import fs from 'fs';
import path from 'path';

export interface GateRow {
  method: string;
  route: string;
  module: string;
  /** Dotted sub-resource path, e.g. "whatsapp.instances" — used to split
   *  permissions whose routes disagree about which roles may use them. */
  resource: string;
  action: string;
  roles: string[];
  line: number;
  /** Where the roles came from: an explicit role gate, a bare company-access
   *  check (any member), or no gate at all. */
  gate: 'roles' | 'access' | 'none';
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

/**
 * Collapses the 62 route-level table names into application modules, so the
 * admin grant matrix stays legible. Roughly mirrors Odoo's application groups
 * and this app's own sidebar sections. Payroll is deliberately kept out of hr:
 * salary data is usually granted to a narrower set of people than the rest of
 * the HR module.
 */
const MODULE_ALIASES: Record<string, string> = {
  clients: 'contacts', suppliers: 'contacts', influencers: 'contacts',

  opportunities: 'crm', followups: 'crm', proposals: 'crm',
  'crm-dashboard': 'crm', 'crm-performance': 'crm',
  'vendor-requests': 'crm', contributions: 'crm',

  'campaign-expenses': 'campaigns', 'campaign-deliverables': 'campaigns',
  'campaign-assignments': 'campaigns',

  'commission-rules': 'commissions',

  'sales-orders': 'sales', deliveries: 'sales',

  'credit-notes': 'invoices', 'invoice-templates': 'invoices',

  'purchase-orders': 'purchasing', 'purchase-requisitions': 'purchasing',
  'purchase-receipts': 'purchasing', rfqs: 'purchasing',
  'purchase-order-payables': 'purchasing', 'bill-matches': 'purchasing',

  payables: 'vendor-bills',

  budgets: 'finance', expenses: 'finance', vat: 'finance',
  'vat-returns': 'finance', reports: 'finance',

  'inventory-items': 'inventory', 'inventory-lots': 'inventory',
  'inventory-location-balances': 'inventory', 'stock-movements': 'inventory',
  'stock-counts': 'inventory', warehouses: 'inventory',

  'work-orders': 'manufacturing', recipes: 'manufacturing',

  employees: 'hr', departments: 'hr', attendance: 'hr',
  'leave-requests': 'hr', 'leave-types': 'hr',

  'payroll-runs': 'payroll',

  'document-templates': 'documents', 'record-attachments': 'documents',
  records: 'documents',

  companies: 'settings', users: 'settings', 'custom-fields': 'settings',
  'activity-events': 'settings', 'numbering-settings': 'settings',
  members: 'settings',
};

/**
 * The sub-resource a route addresses: every non-parameter segment after any
 * /companies/:companyId prefix, joined with dots. Distinguishes, for example,
 * /whatsapp/instances from /whatsapp/chats, which carry different role gates.
 */
export function inferResource(route: string): string {
  const segments = route.split('/').filter(Boolean);
  const start = segments[0] === 'companies' ? 2 : 0;
  const parts = segments.slice(start).filter((seg) => !seg.startsWith(':'));
  return parts.length ? parts.join('.') : (segments[0] ?? 'unknown');
}

export function inferModule(route: string): string {
  const segments = route.split('/').filter(Boolean);
  const start = segments[0] === 'companies' ? 2 : 0;
  let raw = segments[0] ?? 'unknown';
  for (let i = start; i < segments.length; i += 1) {
    if (!segments[i].startsWith(':')) {
      raw = segments[i];
      break;
    }
  }
  return MODULE_ALIASES[raw] ?? raw;
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
const ACCESS_RE = /requireCompanyAccess\(/;
const ALL_ROLES = ['Accountant', 'Admin', 'Employee', 'Manager'];

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

    // A route checked only for company membership is readable by any member,
    // which is all four roles. Recording that explicitly preserves today's
    // behaviour instead of silently granting nobody.
    let gate: GateRow['gate'] = 'roles';
    if (!roles.length) {
      if (ACCESS_RE.test(block)) {
        roles.push(...ALL_ROLES);
        gate = 'access';
      } else {
        gate = 'none';
      }
    }

    rows.push({
      method: route.method,
      route: path,
      module: inferModule(path),
      resource: inferResource(path),
      action: inferAction(route.method, path),
      roles: Array.from(new Set(roles)).sort(),
      line: source.slice(0, route.index).split('\n').length,
      gate,
    });
  });

  return splitConflictingPermissions(expandFactoryRoutes(source, rows, constants));
}

/**
 * Consolidating 62 tables into 19 modules merges routes that do not agree about
 * who may use them. Granting the union would widen access; granting the
 * intersection would revoke it. Both are wrong for a migration that must change
 * nothing.
 *
 * So permission granularity follows the code's own distinctions: where every
 * route behind a module:action carries the same role set, the coarse permission
 * stands. Where they disagree, the most widely-used role set keeps the plain
 * name and only the dissenting routes get a qualified one
 * (settings:read alongside settings:users.read), until each permission has
 * exactly one role set.
 */
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
        resource: inferResource(route),
        action: inferAction(placeholder.method, route),
        roles: Array.from(new Set(parseRoles(rolesArg, constants))).sort(),
        line: source.slice(0, call.index).split('\n').length,
        gate: 'roles',
      });
      call = callRe.exec(source);
    }

    def = FACTORY_DEF_RE.exec(source);
  }

  return expanded;
}

function splitConflictingPermissions(rows: GateRow[]): GateRow[] {
  const roleKey = (r: GateRow) => [...r.roles].sort().join('+');

  const groupBy = (list: GateRow[], keyOf: (r: GateRow) => string) => {
    const map = new Map<string, GateRow[]>();
    list.forEach((r) => {
      const k = keyOf(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    });
    return map;
  };

  const qualify = (list: GateRow[], depth: number): GateRow[] => {
    const groups = groupBy(list, (r) => `${r.module}:${r.action}`);
    const out: GateRow[] = [];

    groups.forEach((group) => {
      const bySet = groupBy(group, roleKey);
      if (bySet.size <= 1) {
        out.push(...group);
        return;
      }

      // The widest-used role set keeps the plain permission name; only the
      // routes that disagree get a qualified one. This keeps the permission
      // count near the coarse ideal while staying exact.
      let majority = '';
      let majorityCount = -1;
      bySet.forEach((members, set) => {
        if (members.length > majorityCount) {
          majorityCount = members.length;
          majority = set;
        }
      });

      bySet.forEach((members, set) => {
        if (set === majority) {
          out.push(...members);
          return;
        }
        members.forEach((r) => {
          const suffix = depth === 0 ? r.resource : `${r.method.toLowerCase()}.${r.resource}`;
          out.push({ ...r, action: `${suffix}.${r.action}` });
        });
      });
    });

    return out;
  };

  // One pass by sub-resource; a second by method for the rare case where two
  // routes share a resource path but not a role set.
  let result = qualify(rows, 0);
  result = qualify(result, 1);
  return result;
}

if (require.main === module) {
  const serverPath = path.join(__dirname, '..', '..', 'src', 'server.ts');
  const rows = extractGates(fs.readFileSync(serverPath, 'utf8'));
  const header = 'method,route,module,action,roles,line,gate,resource';
  const body = rows
    .map(
      (r) =>
        `${r.method},${r.route},${r.module},${r.action},"${r.roles.join(' ')}",` +
        `${r.line},${r.gate},${r.resource}`,
    )
    .join('\n');
  process.stdout.write(`${header}\n${body}\n`);
  process.stderr.write(
    `\n${rows.length} routes; ` +
      `${rows.filter((r) => r.gate === 'roles').length} role-gated, ` +
      `${rows.filter((r) => r.gate === 'access').length} company-access-only, ` +
      `${rows.filter((r) => r.gate === 'none').length} ungated\n`,
  );
}
