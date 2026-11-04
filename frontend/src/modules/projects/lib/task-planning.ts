/**
 * Tasks bundle 3: where tasks fall on a calendar and how much work each
 * person has per week. Dates are the reader's local days.
 */
import type { Task } from '../types';

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Monday of the week holding `d`. */
export const weekStart = (d: Date) => {
  const day = startOfDay(d);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
};

/** The days shown for a month: whole weeks, Monday first. */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const days: Date[] = [];
  for (let d = weekStart(first); d <= last || days.length % 7 !== 0; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) days.push(d);
  return days;
}

/** Each day's tasks: every day from the start to the due date, or only the due day. A span is capped at 62 days. */
export function tasksByDay(tasks: Task[]): Map<string, Task[]> {
  const out = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.dueDate) continue;
    const end = startOfDay(new Date(t.dueDate));
    let d = t.startDate ? startOfDay(new Date(t.startDate)) : end;
    if (d > end) d = end;
    for (let i = 0; d <= end && i < 62; i += 1, d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const k = dayKey(d);
      out.set(k, [...(out.get(k) ?? []), t]);
    }
  }
  return out;
}

export interface WorkloadWeek { start: Date; minutes: number; tasks: Task[]; unestimated: number }
export interface WorkloadRow { userId: string; weeks: WorkloadWeek[]; total: number }

/**
 * Open work per person for `count` weeks from this one: what is left of each
 * estimate (estimate − logged, split evenly between assignees), in the week
 * it is due. Overdue work counts in this week; work due later is left out.
 */
export function workload(tasks: Task[], now: Date, count = 4): WorkloadRow[] {
  const first = weekStart(now);
  const starts = Array.from({ length: count }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + 7 * i));
  const rows = new Map<string, WorkloadRow>();
  const row = (userId: string) => {
    let r = rows.get(userId);
    if (!r) { r = { userId, total: 0, weeks: starts.map((start) => ({ start, minutes: 0, tasks: [], unestimated: 0 })) }; rows.set(userId, r); }
    return r;
  };
  for (const t of tasks) {
    if (t.status === 'Done' || !t.dueDate || !t.assignedUserIds?.length) continue;
    const due = startOfDay(new Date(t.dueDate));
    const index = due < first ? 0 : Math.floor((due.getTime() - first.getTime()) / (7 * 864e5));
    if (index >= count) continue;
    const left = t.estimateMinutes ? Math.max(0, t.estimateMinutes - (t.loggedMinutes ?? 0)) : 0;
    const share = Math.round(left / t.assignedUserIds.length);
    for (const userId of t.assignedUserIds) {
      const w = row(userId).weeks[index];
      w.tasks.push(t);
      w.minutes += share;
      if (!t.estimateMinutes) w.unestimated += 1;
    }
  }
  return [...rows.values()].map((r) => ({ ...r, total: r.weeks.reduce((n, w) => n + w.minutes, 0) }));
}

/** "3h 15m", "45m", "2h". */
export const hoursText = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
};
