import fs from 'fs';
import path from 'path';

export interface GateRow {
  method: string;
  route: string;
  module: string;
  action: string;
  roles: string[];
  line: number;
}

/**
 * Routes whose path suffix names a state transition rather than a CRUD verb.
 * Order matters — the first match wins.
 */
const NAMED_ACTIONS: Array<[RegExp, string]> = [
  [/\/payments?$/, 'pay'],
  [/\/post$/, 'post'],
  [/\/approve$/, 'approve'],
  [/\/confirm$/, 'confirm'],
  [/\/void$/, 'void'],
  [/\/cancel$/, 'cancel'],
  [/\/receive$/, 'receive'],
  [/\/issue$/, 'issue'],
  [/\/transfer$/, 'transfer'],
  [/mark-invoiced$/, 'invoice'],
  [/\/send$/, 'send'],
  [/\/pdf$/, 'read'],
];

export function inferAction(method: string, route: string): string {
  for (const [pattern, action] of NAMED_ACTIONS) {
    if (pattern.test(route)) return action;
  }
  switch (method.toUpperCase()) {
    case 'GET':
      return 'read';
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'write';
    case 'DELETE':
      return 'delete';
    default:
      return 'read';
  }
}

export function inferModule(route: string): string {
  const segments = route.split('/').filter(Boolean);
  const start = segments[0] === 'companies' ? 2 : 0;
  for (let i = start; i < segments.length; i += 1) {
    if (!segments[i].startsWith(':')) return segments[i];
  }
  return segments[0] ?? 'unknown';
}

/** Fallbacks for snippets that do not carry their own declarations. */
const DEFAULT_ROLE_CONSTANTS: Record<string, string[]> = {
  userRoles: ['Admin', 'Manager', 'Employee', 'Accountant'],
  companyManagementRoles: ['Admin', 'Manager', 'Accountant'],
};

const ROLE_CONST_RE = /const\s+(\w+)\s*(?::\s*UserRole\[\])?\s*=\s*\[([^\]]*)\]/g;

/**
 * Reads `const someRoles: UserRole[] = [...]` declarations out of the source so
 * a newly-introduced role constant is picked up automatically instead of being
 * mistaken for a role literally named after the variable.
 */
function parseRoleConstants(source: string): Record<string, string[]> {
  const constants = { ...DEFAULT_ROLE_CONSTANTS };
  ROLE_CONST_RE.lastIndex = 0;
  let match = ROLE_CONST_RE.exec(source);
  while (match) {
    const [, name, body] = match;
    const values = body
      .split(',')
      .map((part) => part.trim().replace(/['"`]/g, ''))
      .filter(Boolean);
    const isRoleList =
      name.toLowerCase().endsWith('roles') &&
      values.length > 0 &&
      values.every((v) => /^(Admin|Manager|Employee|Accountant)$/.test(v));
    if (isRoleList) constants[name] = values;
    match = ROLE_CONST_RE.exec(source);
  }
  return constants;
}

const ROUTE_RE = /app\.(get|post|put|patch|delete)\(/g;
const PATH_RE = /['"`](\/[^'"`]*)['"`]/;
// [\s\S] rather than . so a call split across lines is still matched.
const ROLES_RE = /requireCompanyRoles\(\s*[\s\S]*?,\s*[\s\S]*?,\s*(\[[\s\S]*?\]|\w+)\s*,?\s*\)/;

function parseRoles(raw: string, constants: Record<string, string[]>): string[] {
  const trimmed = raw.trim();
  if (constants[trimmed]) return constants[trimmed];
  return trimmed
    .replace(/[[\]]/g, '')
    .split(',')
    .map((part) => part.trim().replace(/['"`]/g, ''))
    .filter(Boolean)
    .flatMap((part) => constants[part] ?? [part]);
}

/**
 * Splits server.ts into one block per route registration and reads the first
 * requireCompanyRoles call inside each. A route with no gate is still emitted,
 * with an empty role list, so a parser miss shows up in the matrix for review
 * instead of disappearing.
 */
export function extractGates(source: string): GateRow[] {
  const constants = parseRoleConstants(source);

  // Helper functions such as loadFollowup / loadRecipe carry a gate that
  // applies to every route calling them. They are block boundaries so their
  // gate is not misread as belonging to the preceding route, and their roles
  // are folded into each caller below.
  const helpers: Array<{ index: number; name: string }> = [];
  const HELPER_RE = /const\s+(\w+)\s*=\s*\(\s*req\b/g;
  let helperMatch = HELPER_RE.exec(source);
  while (helperMatch) {
    helpers.push({ index: helperMatch.index, name: helperMatch[1] });
    helperMatch = HELPER_RE.exec(source);
  }

  const routes: Array<{ index: number; method: string }> = [];
  ROUTE_RE.lastIndex = 0;
  let routeMatch = ROUTE_RE.exec(source);
  while (routeMatch) {
    routes.push({ index: routeMatch.index, method: routeMatch[1].toUpperCase() });
    routeMatch = ROUTE_RE.exec(source);
  }

  // Every boundary, so a block never runs past the start of the next construct.
  const boundaries = [...routes.map((r) => r.index), ...helpers.map((h) => h.index)].sort(
    (a, b) => a - b,
  );
  const blockEnd = (start: number): number =>
    boundaries.find((b) => b > start) ?? source.length;

  const helperRoles = new Map<string, string[]>();
  helpers.forEach((helper) => {
    const block = source.slice(helper.index, blockEnd(helper.index));
    const match = block.match(ROLES_RE);
    if (match) helperRoles.set(helper.name, parseRoles(match[1], constants));
  });

  const rows: GateRow[] = [];
  routes.forEach((route) => {
    const block = source.slice(route.index, blockEnd(route.index));

    const pathMatch = block.match(PATH_RE);
    if (!pathMatch) return;
    const path = pathMatch[1];

    const ownMatch = block.match(ROLES_RE);
    const roles = ownMatch ? parseRoles(ownMatch[1], constants) : [];

    // Fold in the gate of every helper this route invokes.
    helperRoles.forEach((inherited, name) => {
      if (new RegExp(`\\b${name}\\s*\\(`).test(block)) roles.push(...inherited);
    });

    rows.push({
      method: route.method,
      route: path,
      module: inferModule(path),
      action: inferAction(route.method, path),
      roles: Array.from(new Set(roles)).sort(),
      line: source.slice(0, route.index).split('\n').length,
    });
  });

  return expandFactoryRoutes(source, rows, constants);
}

/**
 * Some routes are registered by a factory that takes the path suffix and the
 * role list as parameters, e.g. requisitionAction('approve', [...], run). Those
 * produce one unusable row holding a template literal and a parameter name, so
 * it is replaced with one concrete row per call site.
 */
const FACTORY_DEF_RE = /const\s+(\w+)\s*=\s*\(\s*(\w+):\s*string,\s*(\w+):\s*UserRole\[\]/g;

function expandFactoryRoutes(
  source: string,
  rows: GateRow[],
  constants: Record<string, string[]>,
): GateRow[] {
  const expanded = [...rows];

  FACTORY_DEF_RE.lastIndex = 0;
  let def = FACTORY_DEF_RE.exec(source);
  while (def) {
    const [, factoryName, suffixParam, rolesParam] = def;

    // The placeholder row this factory produced, if any.
    const placeholderIndex = expanded.findIndex((r) => r.route.includes(`\${${suffixParam}}`));
    if (placeholderIndex === -1) {
      def = FACTORY_DEF_RE.exec(source);
      continue;
    }
    const placeholder = expanded[placeholderIndex];
    if (!placeholder.roles.includes(rolesParam)) {
      def = FACTORY_DEF_RE.exec(source);
      continue;
    }
    expanded.splice(placeholderIndex, 1);

    const callRe = new RegExp(
      `\\b${factoryName}\\(\\s*['"\`]([^'"\`]+)['"\`]\\s*,\\s*(\\[[^\\]]*\\]|\\w+)`,
      'g',
    );
    let call = callRe.exec(source);
    while (call) {
      const [, suffix, rolesArg] = call;
      const route = placeholder.route.replace(`\${${suffixParam}}`, suffix);
      expanded.push({
        method: placeholder.method,
        route,
        module: inferModule(route),
        action: inferAction(placeholder.method, route),
        roles: Array.from(new Set(parseRoles(rolesArg, constants))).sort(),
        line: source.slice(0, call.index).split('\n').length,
      });
      call = callRe.exec(source);
    }

    def = FACTORY_DEF_RE.exec(source);
  }

  return expanded;
}

if (require.main === module) {
  const serverPath = path.join(__dirname, '..', '..', 'src', 'server.ts');
  const rows = extractGates(fs.readFileSync(serverPath, 'utf8'));
  const header = 'method,route,module,action,roles,line';
  const body = rows
    .map((r) => `${r.method},${r.route},${r.module},${r.action},"${r.roles.join(' ')}",${r.line}`)
    .join('\n');
  process.stdout.write(`${header}\n${body}\n`);
  process.stderr.write(
    `\n${rows.length} routes; ${rows.filter((r) => !r.roles.length).length} with no role gate\n`,
  );
}
