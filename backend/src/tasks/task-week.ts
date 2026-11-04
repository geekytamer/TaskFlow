/**
 * The weekly report (tasks bundle 3): for one week, per person, what they
 * finished, what is due and still open, what is overdue, and the time they
 * logged. Pure: the caller passes the tasks the reader may see and the time
 * logged on them in the week.
 */
import type { Task } from '../types';

export interface WeekTaskRef { id: string; title: string; projectId: string; dueDate?: string; estimateMinutes?: number | null; loggedMinutes?: number }
export interface WeekPerson { userId: string; name: string; done: WeekTaskRef[]; dueOpen: WeekTaskRef[]; overdue: WeekTaskRef[]; loggedMinutes: number }
export interface TaskWeek {
  weekStart: string; weekEnd: string;
  people: WeekPerson[];
  totals: { done: number; dueOpen: number; overdue: number; loggedMinutes: number; unassignedOpen: number };
}

/** Monday 00:00 UTC of the week holding `day`. */
export const weekStartOf = (day: Date): Date => {
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d;
};

export function taskWeek(
  tasks: Task[],
  logged: Array<{ userId: string; userName: string | null; minutes: number }>,
  names: (userId: string) => string,
  weekStart: Date,
  now: Date,
): TaskWeek {
  const start = weekStartOf(weekStart);
  const end = new Date(start.getTime() + 7 * 864e5);
  const inWeek = (d?: Date | null) => Boolean(d && d.getTime() >= start.getTime() && d.getTime() < end.getTime());
  const ref = (t: Task): WeekTaskRef => ({
    id: t.id, title: t.title, projectId: t.projectId, dueDate: t.dueDate?.toISOString(),
    estimateMinutes: t.estimateMinutes ?? null, loggedMinutes: t.loggedMinutes ?? 0,
  });
  const people = new Map<string, WeekPerson>();
  const person = (userId: string, name?: string | null) => {
    let p = people.get(userId);
    if (!p) { p = { userId, name: name || names(userId), done: [], dueOpen: [], overdue: [], loggedMinutes: 0 }; people.set(userId, p); }
    return p;
  };
  let unassignedOpen = 0;
  for (const t of tasks) {
    const who = t.assignedUserIds ?? [];
    const open = t.status !== 'Done';
    if (!who.length && open && (inWeek(t.dueDate) || (t.dueDate && t.dueDate < now))) unassignedOpen += 1;
    for (const userId of who) {
      if (!open && inWeek(t.completedAt)) person(userId).done.push(ref(t));
      // Overdue is as of now (or the week's end, for a past week); due-and-open is the rest of the week.
      const cutoff = now < end ? now : end;
      if (open && t.dueDate && t.dueDate < cutoff) person(userId).overdue.push(ref(t));
      else if (open && inWeek(t.dueDate)) person(userId).dueOpen.push(ref(t));
    }
  }
  for (const l of logged) person(l.userId, l.userName).loggedMinutes += l.minutes;
  const list = [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    weekStart: start.toISOString(), weekEnd: end.toISOString(), people: list,
    totals: {
      done: new Set(list.flatMap((p) => p.done.map((t) => t.id))).size,
      dueOpen: new Set(list.flatMap((p) => p.dueOpen.map((t) => t.id))).size,
      overdue: new Set(list.flatMap((p) => p.overdue.map((t) => t.id))).size,
      loggedMinutes: list.reduce((n, p) => n + p.loggedMinutes, 0),
      unassignedOpen,
    },
  };
}
