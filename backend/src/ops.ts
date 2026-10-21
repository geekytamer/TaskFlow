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
  authz:status                 Show the permissions engine, authz version and logged shadow divergences
  authz:compare [--days N]     Summarise shadow divergences (authz_divergence) of the last N days
                               (default 7): by route, key and company, newest first (read-only)

Environment:
  TASKFLOW_DB_PATH=/absolute/path/to/taskflow.db
  PERMISSIONS_ENGINE=legacy|shadow|v2 (default legacy): who decides access. legacy: company
    roles; shadow: roles decide and every disagreement with v2 goes to authz_divergence;
    v2: declared permissions and roles/add-ons (rollback = set it back to legacy)
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

async function authzStatus() {
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  console.log(`Database: ${dbPath}`);
  console.log(`Engine: ${process.env.PERMISSIONS_ENGINE || 'legacy'} (PERMISSIONS_ENGINE)`);
  console.log(`Authz version: ${store.getAuthzVersion()}`);
  const divergences = store.listAuthzDivergences(1000);
  console.log(`Logged divergences: ${divergences.length}`);
}

/**
 * The shadow-week tool: summarises authz_divergence (every request where the
 * v2 answer differed from the legacy one) since N days ago (--days, default
 * 7): counts by route, by permission key and by company, then the newest
 * disagreements. Read-only; prints user and company ids, never names or
 * contact details.
 */
async function authzCompare() {
  const daysAt = args.indexOf('--days');
  const days = daysAt >= 0 ? Number(args[daysAt + 1]) : 7;
  if (!Number.isFinite(days) || days <= 0) {
    console.error('Usage: npm run ops -- authz:compare [--days N]   (N > 0, default 7)');
    process.exitCode = 1;
    return;
  }
  console.log(`Database: ${dbPath}`);
  if (!fs.existsSync(dbPath)) {
    console.log('Exists: no');
    return;
  }
  const db = new Database(dbPath, { readonly: true });
  try {
    const table = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'authz_divergence'`).get();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    console.log(`Since: ${since} (last ${days} days)`);
    if (!table) {
      console.log('Divergences: 0 (no authz_divergence table yet)');
      return;
    }
    const rows = db
      .prepare(`SELECT userId, companyId, module, action, route, legacyAllowed, openfgaAllowed, observedAt
                  FROM authz_divergence WHERE observedAt >= ? ORDER BY observedAt DESC, id DESC`)
      .all(since) as Array<{
        userId: string; companyId: string; module: string; action: string; route: string;
        legacyAllowed: number; openfgaAllowed: number; observedAt: string;
      }>;
    console.log(`Divergences: ${rows.length}`);
    if (!rows.length) return;
    const keyOf = (r: { module: string; action: string }) => (r.module === 'field' ? `field:${r.action}` : `${r.module}.${r.action}`);
    const answer = (r: { legacyAllowed: number; openfgaAllowed: number }) =>
      `legacy ${r.legacyAllowed ? 'allow' : 'deny'}, v2 ${r.openfgaAllowed ? 'allow' : 'deny'}`;
    const section = (title: string, label: (r: (typeof rows)[number]) => string) => {
      const counts = new Map<string, number>();
      rows.forEach((r) => counts.set(label(r), (counts.get(label(r)) ?? 0) + 1));
      console.log(`\nBy ${title}:`);
      [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .forEach(([name, n]) => console.log(`  ${String(n).padStart(6)}  ${name}`));
    };
    section('route', (r) => r.route);
    section('permission key', keyOf);
    section('company', (r) => r.companyId);
    section('answer', answer);
    const limit = 20;
    console.log(`\nNewest ${Math.min(limit, rows.length)}:`);
    rows.slice(0, limit).forEach((r) => console.log(
      `  ${r.observedAt}  company ${r.companyId}  user ${r.userId}  ${r.route}  ${keyOf(r)}  (${answer(r)})`,
    ));
  } finally {
    db.close();
  }
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
  // Assignments may have changed underneath a running API; make it refetch.
  store.bumpAuthzVersion();

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
      ? 'All users have a group.'
      : 'Some users still have no group — they belong to no company.',
  );
}

switch (command) {
  case 'authz:repair':
    authzRepair();
    break;
  case 'authz:status':
    authzStatus().catch(fail);
    break;
  case 'authz:compare':
    authzCompare().catch(fail);
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
