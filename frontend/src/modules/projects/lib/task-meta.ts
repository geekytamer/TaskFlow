import type { PartStatus, Task, TaskPart, TaskPriority, TaskRecurrence, TaskStatus } from '../types';

/** Names and colours for task statuses and priorities, in one place for every view. */
const STATUS_NAMES: Record<TaskStatus, { en: string; ar: string }> = {
  'To Do': { en: 'To Do', ar: 'قيد الانتظار' },
  'In Progress': { en: 'In Progress', ar: 'قيد التنفيذ' },
  Waiting: { en: 'Waiting', ar: 'بانتظار' },
  'In Review': { en: 'In Review', ar: 'تحت المراجعة' },
  Done: { en: 'Done', ar: 'مكتملة' },
};

const PRIORITY_NAMES: Record<TaskPriority, { en: string; ar: string }> = {
  Low: { en: 'Low', ar: 'منخفضة' },
  Medium: { en: 'Medium', ar: 'متوسطة' },
  High: { en: 'High', ar: 'عالية' },
  Urgent: { en: 'Urgent', ar: 'عاجلة' },
};

export const statusName = (status: TaskStatus, language: string) =>
  (STATUS_NAMES[status] ?? STATUS_NAMES['To Do'])[language === 'ar' ? 'ar' : 'en'];

export const priorityName = (priority: TaskPriority, language: string) =>
  (PRIORITY_NAMES[priority] ?? PRIORITY_NAMES.Medium)[language === 'ar' ? 'ar' : 'en'];

export const STATUS_STYLE: Record<TaskStatus, { dot: string; text: string }> = {
  'To Do': { dot: 'bg-slate-400', text: 'text-muted-foreground' },
  'In Progress': { dot: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' },
  Waiting: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  'In Review': { dot: 'bg-violet-500', text: 'text-violet-600 dark:text-violet-400' },
  Done: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
};

export const PRIORITY_DOT: Record<TaskPriority, string> = {
  Urgent: 'bg-red-600 ring-2 ring-red-500/30',
  High: 'bg-red-500',
  Medium: 'bg-amber-500',
  Low: 'bg-emerald-500',
};

/** Lower comes first when sorting. */
export const PRIORITY_WEIGHT: Record<TaskPriority, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

export const myPart = (task: Task, userId: string | null | undefined): TaskPart | undefined =>
  userId ? task.parts?.find((p) => p.userId === userId) : undefined;

/** What the task looks like to this person: their own part's state when they have one. */
export const statusFor = (task: Task, userId: string | null | undefined): TaskStatus =>
  (myPart(task, userId)?.status as PartStatus | undefined) ?? task.status;

/** "1/2": parts finished out of all, for tasks shared by several people. */
export const partsProgress = (task: Task) => {
  const parts = task.parts ?? [];
  return { done: parts.filter((p) => p.status === 'Done').length, total: parts.length };
};

const RECURRENCE_NAMES: Record<TaskRecurrence, [string, string]> = {
  daily: ['Every day', 'كل يوم'],
  weekly: ['Every week', 'كل أسبوع'],
  monthly: ['Every month', 'كل شهر'],
};
export const recurrenceName = (r: TaskRecurrence, language: string) => RECURRENCE_NAMES[r][language === 'ar' ? 1 : 0];

const dayStart = (d: Date | string) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/** How many calendar days a task spans, first and last included; 1 without a start date. */
export function taskSpanDays(task: Pick<Task, 'startDate' | 'dueDate'>): number {
  if (!task.startDate || !task.dueDate) return 1;
  return Math.max(1, Math.round((dayStart(task.dueDate).getTime() - dayStart(task.startDate).getTime()) / 86_400_000) + 1);
}

/** "3 Nov – 6 Nov" for a span, "6 Nov" for a due date alone, '' for neither. */
export function formatTaskDates(task: Pick<Task, 'startDate' | 'dueDate'>, locale: string): string {
  const fmt = (d: Date | string) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  if (task.startDate && task.dueDate && taskSpanDays(task) > 1) return `${fmt(task.startDate)} – ${fmt(task.dueDate)}`;
  return task.dueDate ? fmt(task.dueDate) : '';
}

/** Day n of a running span (today inside start..due), else undefined. */
export function spanDayToday(task: Pick<Task, 'startDate' | 'dueDate'>, today = new Date()): number | undefined {
  if (!task.startDate || !task.dueDate || taskSpanDays(task) < 2) return undefined;
  const t = dayStart(today).getTime();
  const s = dayStart(task.startDate).getTime();
  if (t < s || t > dayStart(task.dueDate).getTime()) return undefined;
  return Math.round((t - s) / 86_400_000) + 1;
}
