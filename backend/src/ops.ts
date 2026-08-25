import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { DataStore } from './data/store';

const command = process.argv[2] ?? 'help';
const args = process.argv.slice(3);
const force = args.includes('--force');
const dbPath = path.resolve(process.env.TASKFLOW_DB_PATH || path.join(process.cwd(), 'taskflow.db'));

function printHelp() {
  console.log(`TaskFlow ops

Usage:
  npm run ops -- <command> [--force]

Commands:
  status                       Show database path, migration status, and basic record counts
  migrate                      Apply pending schema migrations explicitly
  seed                         Reset and reseed demo data (requires --force)
  prune-orphans                Delete every row whose company no longer exists (requires --force)
  delete-company <id>          Delete a company and all its data (requires --force)
  authz:repair                 Re-seed missing permission groups and user assignments
  fga:sync [--dry-run]         Reconcile OpenFGA tuples with the database
  fga:status                   Show OpenFGA connectivity, outbox depth and authz version

Environment:
  TASKFLOW_DB_PATH=/absolute/path/to/taskflow.db
  AUTHZ_ENGINE, FGA_API_URL, FGA_API_TOKEN, FGA_STORE_ID, FGA_MODEL_ID
`);
}

function getCount(db: Database.Database, tableName: string) {
  const table = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(tableName) as { name?: string } | undefined;
  if (!table?.name) return 0;
  return (db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number }).count;
}

function showStatus() {
  console.log(`Database: ${dbPath}`);
  if (!fs.existsSync(dbPath)) {
    console.log('Exists: no');
    console.log('Migrations: none (database file has not been created yet)');
    return;
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    const hasMigrationsTable = Boolean(
      db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`)
        .get(),
    );
    const migrations = hasMigrationsTable
      ? (db.prepare('SELECT id FROM schema_migrations ORDER BY id ASC').all() as Array<{ id: string }>).map(
          (row) => row.id,
        )
      : [];

    console.log('Exists: yes');
    console.log(`Migrations: ${migrations.length > 0 ? migrations.join(', ') : 'none applied'}`);
    console.log(
      `Counts: companies=${getCount(db, 'companies')} users=${getCount(db, 'users')} projects=${getCount(
        db,
        'projects',
      )} tasks=${getCount(db, 'tasks')}`,
    );
  } finally {
    db.close();
  }
}

function migrate() {
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  console.log(`Database: ${dbPath}`);
  console.log(`Applied migrations: ${store.getAppliedMigrationIds().join(', ') || 'none'}`);
  console.log('Schema is up to date.');
}

function seed() {
  if (!force) {
    console.error('Refusing to reset demo data without --force.');
    process.exitCode = 1;
    return;
  }

  const store = new DataStore({ dbPath, seedOnEmpty: false });
  store.reset();
  console.log(`Database: ${dbPath}`);
  console.log('Demo data reset complete.');
  console.log(
    `Counts: companies=${store.listCompanies().length} users=${store.listUsers().length} projects=${store.listProjects().length} tasks=${store.listTasks().length}`,
  );
}

function pruneOrphans() {
  if (!force) {
    console.error('Refusing to prune orphaned data without --force.');
    process.exitCode = 1;
    return;
  }
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const results = store.pruneOrphanedCompanyData();
  console.log(`Database: ${dbPath}`);
  if (!results.length) {
    console.log('No orphaned company data found.');
    return;
  }
  const total = results.reduce((sum, r) => sum + r.removed, 0);
  console.log(`Pruned ${total} orphaned row(s):`);
  results.forEach((r) => console.log(`  ${r.table}: ${r.removed}`));
}

function deleteCompany() {
  const id = args.find((a) => !a.startsWith('--'));
  if (!id) {
    console.error('Usage: npm run ops -- delete-company <companyId> --force');
    process.exitCode = 1;
    return;
  }
  if (!force) {
    console.error('Refusing to delete a company without --force.');
    process.exitCode = 1;
    return;
  }
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.getCompanyById(id);
  if (!company) {
    console.error(`Company ${id} not found. (If its data is orphaned, run: prune-orphans --force)`);
    process.exitCode = 1;
    return;
  }
  store.deleteCompany(id, { cascade: true });
  console.log(`Database: ${dbPath}`);
  console.log(`Deleted company "${company.name}" (${id}) and all its related data.`);
}

async function fgaSync() {
  const { syncTuples } = await import('./permissions/sync');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const dryRun = args.includes('--dry-run');
  const result = await syncTuples(store, { dryRun });
  console.log(`Database: ${dbPath}`);
  console.log(`To write: ${result.toWrite.length}`);
  console.log(`To delete: ${result.toDelete.length}`);
  if (dryRun) {
    console.log('Dry run — nothing was changed.');
  } else {
    console.log(`Written: ${result.written}, deleted: ${result.deleted}`);
  }
}

async function fgaStatus() {
  const { fgaHealthy, getFgaConfig } = await import('./permissions/fga-client');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const config = getFgaConfig();
  console.log(`Database: ${dbPath}`);
  console.log(`Engine: ${config.engine}`);
  console.log(`API: ${config.apiUrl}`);
  console.log(`Store: ${config.storeId || '(unset)'}`);
  console.log(`Reachable: ${(await fgaHealthy()) ? 'yes' : 'no'}`);
  console.log(`Outbox depth: ${store.countFgaOutbox()}`);
  console.log(`Authz version: ${store.getAuthzVersion()}`);
  const divergences = store.listAuthzDivergences(1000);
  console.log(`Logged divergences: ${divergences.length}`);
}

const fail = (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
};

function authzRepair() {
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const db = new Database(dbPath, { readonly: true });
  const orphansBefore = (db.prepare(
    `SELECT COUNT(*) c FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM user_group_assignments a WHERE a.userId = u.id)`,
  ).get() as { c: number }).c;

  store.backfillPermissionGroups();

  const after = new Database(dbPath, { readonly: true });
  const orphansAfter = (after.prepare(
    `SELECT COUNT(*) c FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM user_group_assignments a WHERE a.userId = u.id)`,
  ).get() as { c: number }).c;

  console.log(`Database: ${dbPath}`);
  console.log(`Users without a group before: ${orphansBefore}`);
  console.log(`Users without a group after:  ${orphansAfter}`);
  console.log(
    orphansAfter === 0
      ? 'All users have a group. Run "fga:sync" next to publish the tuples.'
      : 'Some users still have no group — they belong to no company.',
  );
}

switch (command) {
  case 'authz:repair':
    authzRepair();
    break;
  case 'fga:sync':
    fgaSync().catch(fail);
    break;
  case 'fga:status':
    fgaStatus().catch(fail);
    break;
  case 'status':
    showStatus();
    break;
  case 'migrate':
    migrate();
    break;
  case 'seed':
    seed();
    break;
  case 'prune-orphans':
    pruneOrphans();
    break;
  case 'delete-company':
    deleteCompany();
    break;
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
}
