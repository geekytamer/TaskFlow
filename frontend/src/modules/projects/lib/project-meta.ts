import type { ProjectStatus } from '../types';

/** Names and colours for project statuses, in one place for every view. */
const STATUS_NAMES: Record<ProjectStatus, [string, string]> = {
  Planning: ['Planning', 'تخطيط'],
  Active: ['Active', 'قيد التنفيذ'],
  'On Hold': ['On hold', 'متوقف'],
  Done: ['Done', 'مكتمل'],
};
export const projectStatusName = (s: ProjectStatus | undefined, language: string) => STATUS_NAMES[s ?? 'Active'][language === 'ar' ? 1 : 0];

export const PROJECT_STATUS_STYLE: Record<ProjectStatus, string> = {
  Planning: 'border-sky-300 text-sky-700 dark:border-sky-500/40 dark:text-sky-300',
  Active: 'border-primary/40 text-primary',
  'On Hold': 'border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-300',
  Done: 'border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300',
};

/** Past its end date and not finished. */
export function projectIsLate(p: { endDate?: string | null; status?: ProjectStatus }, today = new Date()): boolean {
  if (!p.endDate || p.status === 'Done') return false;
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  return new Date(p.endDate) < t;
}
