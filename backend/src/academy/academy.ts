import type { DataStore } from '../data/store';
import type { SanitizedUser, TrialBalanceLine } from '../types';
import { highestRole, levelOf, MISSIONS, missionById, requiredMissions, type Mission, type ObjectiveContext } from './missions';

/**
 * TaskFlow Academy: each user practises in their own practice company. Missions
 * are checked on that company's data; finishing one unlocks its modules in the
 * user's real companies. See docs/superpowers/specs/2026-10-06-taskflow-academy-design.md.
 */

export const PRACTICE_NAME = 'Al Waha Trading (practice)';
export const OPENING_CAPITAL = 20000;

const realRoles = (store: DataStore, user: SanitizedUser) => {
  const roles = (user.companyRoles ?? []).filter((r) => !store.isTrainingCompany(r.companyId));
  return roles.length ? roles : (user.companyIds ?? []).filter((id) => !store.isTrainingCompany(id)).map((companyId) => ({ companyId, role: user.role }));
};

/** Modules switched off in every one of the user's real companies (so their missions are skipped). */
function disabledEverywhere(store: DataStore, user: SanitizedUser): Set<string> {
  const companies = realRoles(store, user).map((r) => store.getDisabledModules(r.companyId));
  if (companies.length === 0) return new Set();
  return new Set(companies[0].filter((m) => companies.every((list) => list.includes(m))));
}

export function pathFor(store: DataStore, user: SanitizedUser): Mission[] {
  const role = user.isSuperAdmin ? 'Admin' : highestRole(realRoles(store, user).map((r) => r.role));
  return requiredMissions(role, disabledEverywhere(store, user));
}

function contextFor(store: DataStore, companyId: string): ObjectiveContext {
  return {
    companyId,
    count: (sql, ...params) => store.academy.count(sql, ...params),
    profit: () => store.getProfitAndLoss(companyId, new Date(0)).netIncome,
    balanced: () => store.getTrialBalance(companyId).isBalanced,
  };
}

/** Every measure for a practice company, keyed `missionId/objectiveId`. */
function measureAll(store: DataStore, companyId: string): Record<string, number> {
  const ctx = contextFor(store, companyId);
  const out: Record<string, number> = {};
  for (const m of MISSIONS) for (const o of m.objectives) if (o.measure) out[`${m.id}/${o.id}`] = o.measure(ctx);
  return out;
}

/** Creates the user's practice company (once) and makes them its only member, as Admin. */
export function startPractice(store: DataStore, user: SanitizedUser): string {
  const state = store.academy.state(user.id);
  if (state.practiceCompanyId && store.getCompanyById(state.practiceCompanyId)) return state.practiceCompanyId;
  const company = store.createCompany({ name: PRACTICE_NAME, city: 'Muscat', country: 'Oman' });
  store.academy.markTraining(company.id, user.id);
  // Owner's capital in the bank, so cash never starts negative.
  const accounts = store.listLedgerAccounts(company.id);
  const bank = accounts.find((a) => a.code === '1010');
  const capital = accounts.find((a) => a.code === '3000');
  if (bank && capital) {
    store.createJournalEntry({
      companyId: company.id, sourceType: 'manual', memo: 'Opening capital', entryDate: new Date(),
      lines: [
        { id: 'open-dr', accountId: bank.id, description: 'Owner invests', debit: OPENING_CAPITAL, credit: 0 },
        { id: 'open-cr', accountId: capital.id, description: 'Owner invests', debit: 0, credit: OPENING_CAPITAL },
      ],
    });
  }
  const fresh = store.getUserById(user.id)!;
  const roles = [...(fresh.companyRoles ?? (fresh.companyIds ?? []).map((companyId) => ({ companyId, role: fresh.role }))), { companyId: company.id, role: 'Admin' as const }];
  store.updateUser(user.id, { companyRoles: roles, companyIds: [...new Set([...(fresh.companyIds ?? []), company.id])] });
  store.academy.setPractice(user.id, company.id, measureAll(store, company.id));
  return company.id;
}

/** Wipes the practice company and starts a fresh one; finished missions stay finished. */
export function resetPractice(store: DataStore, user: SanitizedUser): string {
  const state = store.academy.state(user.id);
  if (state.practiceCompanyId && store.getCompanyById(state.practiceCompanyId)) {
    store.deleteCompany(state.practiceCompanyId, { cascade: true });
  }
  store.academy.setPractice(user.id, null, {});
  return startPractice(store, store.getUserById(user.id)!);
}

export interface ObjectiveView { id: string; title: { en: string; ar: string }; done: boolean; reported: boolean }
export interface MissionView {
  id: string; order: number; xp: number; title: { en: string; ar: string }; story: { en: string; ar: string };
  modules: string[]; status: 'done' | 'open' | 'waiting'; completedAt: string | null; objectives: ObjectiveView[];
}

/**
 * The user's path with live objective states. A mission whose objectives are all
 * met is recorded as done (and its XP awarded) the first time this runs.
 */
export function progressFor(store: DataStore, user: SanitizedUser) {
  const state = store.academy.state(user.id);
  const practice = state.practiceCompanyId && store.getCompanyById(state.practiceCompanyId) ? state.practiceCompanyId : null;
  const now = practice ? measureAll(store, practice) : {};
  const reported = store.academy.reported(user.id);
  const path = pathFor(store, user);
  let completed = store.academy.completed(user.id);

  for (const m of path) {
    if (completed.has(m.id) || (m.after ?? []).some((id) => !completed.has(id))) continue;
    const allDone = m.objectives.every((o) => (o.measure ? practice !== null && (now[`${m.id}/${o.id}`] ?? 0) > (state.baseline[`${m.id}/${o.id}`] ?? 0) : reported.has(`${m.id}/${o.id}`)));
    if (allDone) store.academy.complete(user.id, m.id, m.xp);
  }
  completed = store.academy.completed(user.id);

  const missions: MissionView[] = path.map((m) => {
    const done = completed.get(m.id);
    const waiting = !done && (m.after ?? []).some((id) => !completed.has(id));
    return {
      id: m.id, order: m.order, xp: m.xp, title: m.title, story: m.story, modules: m.modules,
      status: done ? 'done' : waiting ? 'waiting' : 'open', completedAt: done?.completedAt ?? null,
      objectives: m.objectives.map((o) => {
        const key = `${m.id}/${o.id}`;
        const met = Boolean(done) || (o.measure ? practice !== null && (now[key] ?? 0) > (state.baseline[key] ?? 0) : reported.has(key));
        return { id: o.id, title: o.title, done: met, reported: !o.measure };
      }),
    };
  });
  const xp = [...completed.values()].reduce((s, c) => s + c.xp, 0);
  return {
    practiceCompanyId: practice,
    missions,
    xp,
    level: levelOf(xp),
    badges: missions.filter((m) => m.status === 'done').map((m) => m.id),
    graceUntil: state.graceUntil,
    lockedModules: lockedModules(store, user),
    exemptions: store.academy.exemptions(user.id).map((e) => e.module),
  };
}

/**
 * Modules locked in the user's real companies: those taught by a required
 * mission they have not finished. Super admins, full exemptions and the grace
 * period open everything.
 */
export function lockedModules(store: DataStore, user: SanitizedUser, now = new Date()): string[] {
  if (user.isSuperAdmin) return [];
  const exemptions = new Set(store.academy.exemptions(user.id).map((e) => e.module));
  if (exemptions.has('*')) return [];
  const state = store.academy.state(user.id);
  if (state.graceUntil && now < new Date(state.graceUntil)) return [];
  const completed = store.academy.completed(user.id);
  const locked = new Set<string>();
  for (const m of pathFor(store, user)) {
    if (completed.has(m.id)) continue;
    m.modules.forEach((mod) => locked.add(mod));
  }
  // A module taught again by a mission they did finish is open.
  for (const m of pathFor(store, user)) if (completed.has(m.id)) m.modules.forEach((mod) => locked.delete(mod));
  return [...locked].filter((mod) => !exemptions.has(mod)).sort();
}

/** The mission that unlocks a module, for "finish mission X first". */
export const missionForModule = (module: string) => MISSIONS.find((m) => m.modules.includes(module)) ?? null;

/** Reports a browser-only objective (first-day). Refuses objectives the server can check. */
export function reportObjective(store: DataStore, user: SanitizedUser, missionId: string, objectiveId: string): boolean {
  const objective = missionById(missionId)?.objectives.find((o) => o.id === objectiveId);
  if (!objective || objective.measure) return false;
  store.academy.report(user.id, `${missionId}/${objectiveId}`);
  return true;
}

/** A trial balance line's balance, positive in the account's natural direction. */
const natural = (l: TrialBalanceLine) =>
  l.type === 'Asset' || l.type === 'Expense' ? l.debitBalance - l.creditBalance : l.creditBalance - l.debitBalance;

const sumCodes = (lines: Array<{ code: string; balance: number }>, codes: string[]) =>
  Number(lines.filter((l) => codes.includes(l.code)).reduce((s, l) => s + l.balance, 0).toFixed(2));

/**
 * The numbers each action moves, straight from the practice company's trial
 * balance and P&L, so the academy never shows a figure the reports would not.
 * Balances are positive in the account's natural direction.
 */
export function impactOf(store: DataStore, companyId: string) {
  const tb = store.getTrialBalance(companyId);
  const lines = tb.lines.map((l) => ({ code: l.code, type: l.type, balance: natural(l) }));
  const pnl = store.getProfitAndLoss(companyId, new Date(0));
  return {
    cash: sumCodes(lines, ['1000', '1010']),
    receivables: sumCodes(lines, ['1100']),
    stock: sumCodes(lines, ['1200']),
    inputVat: sumCodes(lines, ['1150']),
    payables: sumCodes(lines, ['2000']),
    vatOwed: sumCodes(lines, ['2200']),
    commissionsOwed: sumCodes(lines, ['2300']),
    gratuityOwed: sumCodes(lines, ['2400']),
    revenue: Number(pnl.totalRevenue.toFixed(2)),
    expenses: Number(pnl.totalExpenses.toFixed(2)),
    profit: Number(pnl.netIncome.toFixed(2)),
    balanced: tb.isBalanced,
  };
}

/** A small P&L and balance sheet for the practice company. */
export function statementsOf(store: DataStore, companyId: string) {
  const tb = store.getTrialBalance(companyId);
  const pnl = store.getProfitAndLoss(companyId, new Date(0));
  const group = (type: string) => tb.lines
    .filter((l) => l.type === type)
    .map((l) => ({ code: l.code, name: l.name, amount: Number(natural(l).toFixed(2)) }))
    .filter((l) => Math.abs(l.amount) >= 0.005);
  const total = (rows: Array<{ amount: number }>) => Number(rows.reduce((s, r) => s + r.amount, 0).toFixed(2));
  const assets = group('Asset');
  const liabilities = group('Liability');
  const equity = group('Equity');
  return {
    profitAndLoss: {
      revenue: pnl.revenue.map((l) => ({ code: l.code, name: l.name, amount: l.amount })),
      expenses: pnl.expenses.map((l) => ({ code: l.code, name: l.name, amount: l.amount })),
      totalRevenue: pnl.totalRevenue, totalExpenses: pnl.totalExpenses, netIncome: pnl.netIncome,
    },
    balanceSheet: {
      assets, liabilities, equity,
      totalAssets: total(assets),
      // Equity on the trial balance excludes this year's profit until it is closed; add it so the sheet balances.
      totalLiabilitiesAndEquity: Number((total(liabilities) + total(equity) + pnl.netIncome).toFixed(2)),
      currentProfit: pnl.netIncome,
    },
  };
}
