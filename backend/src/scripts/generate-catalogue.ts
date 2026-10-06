import fs from 'node:fs';
import path from 'node:path';

/**
 * Regenerates the gate-derived parts of the permission catalogue from
 * docs/superpowers/plans/gate-matrix.csv:
 *
 * - catalogue.ts: each module's `actions` list. Labels and sidebar groups stay
 *   hand-written; a module the matrix uses but the catalogue does not list is
 *   an error, since it needs a label and a group first.
 * - seed-matrix.ts: GATE_SEED_MATRIX, each role's grants, from the roles column.
 *
 * Run through `npm run authz:extract`, which extracts the matrix first. A new
 * grant in the seed only reaches companies created afterwards; existing
 * companies need a grant migration (see 116_shipments_write).
 */

const ROLES = ['Admin', 'Manager', 'Accountant', 'Employee'] as const;

export interface MatrixRow { module: string; action: string; roles: string[] }

export function readMatrix(csv: string): MatrixRow[] {
  return csv
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => {
      const [, , module, action, roles, , gate] = line.split(',');
      return { module, action, roles: roles.replace(/"/g, '').split(' ').filter(Boolean), gate };
    })
    .filter((row) => row.gate !== 'none')
    .map(({ module, action, roles }) => ({ module, action, roles }));
}

export function catalogueSource(current: string, rows: MatrixRow[]): string {
  const actions = new Map<string, Set<string>>();
  for (const row of rows) actions.set(row.module, (actions.get(row.module) ?? new Set()).add(row.action));
  const listed = new Set<string>();
  const next = current.replace(
    /(\n {4}key: '([\w-]+)',\n(?: {4}.*\n)*? {4}actions: )\[[^\]]*\]/g,
    (_whole, head: string, key: string) => {
      listed.add(key);
      const list = [...(actions.get(key) ?? [])].sort();
      if (!list.length) throw new Error(`catalogue.ts lists module "${key}", but no gated route uses it. Remove it from GATE_MODULES.`);
      return `${head}${JSON.stringify(list)}`;
    },
  );
  const unlisted = [...actions.keys()].filter((key) => !listed.has(key));
  if (unlisted.length) throw new Error(`Add ${unlisted.join(', ')} to GATE_MODULES in catalogue.ts (key, labelKey, group), then run this again.`);
  return next;
}

export function seedSource(current: string, rows: MatrixRow[]): string {
  const body = ROLES.map((role) => {
    const grants = [...new Set(rows.filter((r) => r.roles.includes(role)).map((r) => `${r.module}:${r.action}`))].sort();
    return `  ${role}: [\n${grants.map((g) => `    '${g}',`).join('\n')}\n  ],`;
  }).join('\n');
  const replaced = current.replace(/(const GATE_SEED_MATRIX: Record<UserRole, string\[\]> = \{\n)[\s\S]*?(\n\};)/, `$1${body}$2`);
  if (replaced === current && !current.includes(body)) throw new Error('GATE_SEED_MATRIX not found in seed-matrix.ts');
  return replaced;
}

if (require.main === module) {
  const root = path.join(__dirname, '..', '..');
  const rows = readMatrix(fs.readFileSync(path.join(root, '..', 'docs', 'superpowers', 'plans', 'gate-matrix.csv'), 'utf8'));
  const cataloguePath = path.join(root, 'src', 'permissions', 'catalogue.ts');
  const seedPath = path.join(root, 'src', 'permissions', 'seed-matrix.ts');
  fs.writeFileSync(cataloguePath, catalogueSource(fs.readFileSync(cataloguePath, 'utf8'), rows));
  fs.writeFileSync(seedPath, seedSource(fs.readFileSync(seedPath, 'utf8'), rows));
  process.stderr.write(`catalogue.ts and seed-matrix.ts written from ${rows.length} gated routes\n`);
}
