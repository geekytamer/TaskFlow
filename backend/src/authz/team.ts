/**
 * The manager line from HR: who is in a person's team in one company.
 *
 * A team is the person plus everyone below them through employees.managerId
 * (employees.id), mapped to logins through employees.userId. Employees without
 * a login still pass the line on (A → unlinked → C keeps C in A's team). A
 * person with no employee record is a team of one.
 *
 * Terminated employees (status 'Terminated') are out of every team and lead
 * none: their login is never added and their row does not anchor a team (a
 * terminated person is a team of one). Like an unlinked row, the line still
 * passes through them, so active people who still report to a terminated
 * manager stay in the team of the manager above. 'Active' and 'On Leave'
 * count.
 *
 * Cycles in managerId (A manages B manages A) stop at the first repeated
 * employee: everyone on the cycle is in everyone else's team on it, plus
 * whoever hangs below the cycle.
 *
 * Cached per company against team_versions, a counter that triggers on the
 * employees table move whenever a row changes its line (migration 140), so
 * every writer — store methods and raw SQL alike — invalidates it, in every
 * process.
 */
import type { DataStore } from '../data/store';

interface CompanyLines {
  version: number;
  /** employee id → direct reports' employee ids */
  reports: Map<string, string[]>;
  /** user id → their employee ids in the company */
  employeesOf: Map<string, string[]>;
  userOf: Map<string, string | null>;
  teams: Map<string, ReadonlySet<string>>;
}

const caches = new WeakMap<DataStore, Map<string, CompanyLines>>();

function linesFor(store: DataStore, companyId: string): CompanyLines {
  let perStore = caches.get(store);
  if (!perStore) caches.set(store, (perStore = new Map()));
  const version = store.authz.teamVersion(companyId);
  const cached = perStore.get(companyId);
  if (cached && cached.version === version) return cached;

  const reports = new Map<string, string[]>();
  const employeesOf = new Map<string, string[]>();
  const userOf = new Map<string, string | null>();
  for (const e of store.authz.employeeLines(companyId)) {
    const terminated = e.status === 'Terminated';
    userOf.set(e.id, terminated ? null : e.userId);
    if (e.userId && !terminated) employeesOf.set(e.userId, [...(employeesOf.get(e.userId) ?? []), e.id]);
    if (e.managerId && e.managerId !== e.id) reports.set(e.managerId, [...(reports.get(e.managerId) ?? []), e.id]);
  }
  const lines: CompanyLines = { version, reports, employeesOf, userOf, teams: new Map() };
  perStore.set(companyId, lines);
  return lines;
}

export function teamOf(store: DataStore, companyId: string, userId: string): ReadonlySet<string> {
  const lines = linesFor(store, companyId);
  const known = lines.teams.get(userId);
  if (known) return known;
  const team = new Set<string>([userId]);
  const seen = new Set<string>();
  const queue = [...(lines.employeesOf.get(userId) ?? [])];
  while (queue.length) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const user = lines.userOf.get(id);
    if (user) team.add(user);
    for (const report of lines.reports.get(id) ?? []) if (!seen.has(report)) queue.push(report);
  }
  lines.teams.set(userId, team);
  return team;
}

