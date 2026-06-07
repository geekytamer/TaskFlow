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

Environment:
  TASKFLOW_DB_PATH=/absolute/path/to/taskflow.db
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

switch (command) {
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
