import { apiFetch } from '@/lib/api-client';

export type Bilingual = { en: string; ar: string };

export interface AcademyObjective { id: string; title: Bilingual; done: boolean; reported: boolean; visit: string | null }
export interface AcademyMission {
  id: string;
  order: number;
  xp: number;
  title: Bilingual;
  story: Bilingual;
  modules: string[];
  status: 'done' | 'open' | 'waiting';
  completedAt: string | null;
  objectives: AcademyObjective[];
}

export interface AcademyProgress {
  practiceCompanyId: string | null;
  missions: AcademyMission[];
  xp: number;
  level: number;
  badges: string[];
  graceUntil: string | null;
  lockedModules: string[];
  exemptions: string[];
}

/** What each action moves, from the practice company's trial balance and P&L. */
export interface AcademyImpact {
  cash: number;
  receivables: number;
  stock: number;
  inputVat: number;
  payables: number;
  vatOwed: number;
  commissionsOwed: number;
  gratuityOwed: number;
  revenue: number;
  expenses: number;
  profit: number;
  balanced: boolean;
}

export interface StatementLine { code: string; name: string; amount: number }
export interface AcademyStatements {
  profitAndLoss: { revenue: StatementLine[]; expenses: StatementLine[]; totalRevenue: number; totalExpenses: number; netIncome: number };
  balanceSheet: { assets: StatementLine[]; liabilities: StatementLine[]; equity: StatementLine[]; totalAssets: number; totalLiabilitiesAndEquity: number; currentProfit: number };
}

export interface TeamMember { userId: string; name: string; done: number; required: number }

export const getAcademy = () => apiFetch<AcademyProgress>('/academy/me');
export const startAcademy = () => apiFetch<AcademyProgress>('/academy/start', { method: 'POST', body: '{}' });
export const resetAcademy = () => apiFetch<AcademyProgress>('/academy/reset', { method: 'POST', body: '{}' });
export const reportObjective = (missionId: string, objectiveId: string) =>
  apiFetch<AcademyProgress>(`/academy/objectives/${missionId}/${objectiveId}`, { method: 'POST', body: '{}' });
export const getImpact = () => apiFetch<AcademyImpact>('/academy/impact');
export const getStatements = () => apiFetch<AcademyStatements>('/academy/statements');
export const getTeam = (companyId: string) => apiFetch<TeamMember[]>(`/academy/team?companyId=${encodeURIComponent(companyId)}`);
