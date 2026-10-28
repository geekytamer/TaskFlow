import type { ProjectPriority, ProjectStatus } from '../types';

/** Names and colours for project statuses, in one place for every view. */
const STATUS_NAMES: Record<ProjectStatus, [string, string]> = {
  Planning: ['Planning', 'تخطيط'],
  Active: ['Active', 'قيد التنفيذ'],
  'On Hold': ['On hold', 'متوقف'],
  Done: ['Done', 'مكتمل'],
  Archived: ['Archived', 'مؤرشف'],
};
export const projectStatusName = (s: ProjectStatus | undefined, language: string) => STATUS_NAMES[s ?? 'Active'][language === 'ar' ? 1 : 0];

export const PROJECT_STATUS_STYLE: Record<ProjectStatus, string> = {
  Planning: 'border-sky-300 text-sky-700 dark:border-sky-500/40 dark:text-sky-300',
  Active: 'border-primary/40 text-primary',
  'On Hold': 'border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-300',
  Done: 'border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300',
  Archived: 'border-muted-foreground/30 text-muted-foreground',
};

/** Which list tab a project sits in. */
export type ProjectTab = 'current' | 'done' | 'archived' | 'all';
export const projectTab = (s: ProjectStatus | undefined): Exclude<ProjectTab, 'all'> =>
  s === 'Done' ? 'done' : s === 'Archived' ? 'archived' : 'current';

const PRIORITY_NAMES: Record<ProjectPriority, [string, string]> = {
  Low: ['Low', 'منخفضة'],
  Medium: ['Medium', 'متوسطة'],
  High: ['High', 'عالية'],
  Urgent: ['Urgent', 'عاجلة'],
};
export const projectPriorityName = (p: ProjectPriority | undefined, language: string) => PRIORITY_NAMES[p ?? 'Medium'][language === 'ar' ? 1 : 0];
export const PROJECT_PRIORITY_WEIGHT: Record<ProjectPriority, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
export const PROJECT_PRIORITY_STYLE: Record<ProjectPriority, string> = {
  Urgent: 'bg-red-600 text-white border-transparent',
  High: 'border-red-300 text-red-700 dark:border-red-500/40 dark:text-red-300',
  Medium: 'border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-300',
  Low: 'border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300',
};

/** Past its end date and not finished. */
export function projectIsLate(p: { endDate?: string | null; status?: ProjectStatus }, today = new Date()): boolean {
  if (!p.endDate || p.status === 'Done') return false;
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  return new Date(p.endDate) < t;
}
