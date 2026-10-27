/**
 * Repeating tasks, "next round on completion": when a repeating task is done,
 * a fresh copy is created for the next period (same people, part labels and
 * checklist steps, all unticked). A task spawns its next round only once, so
 * reopening and closing it again never makes duplicates.
 */
export const taskRecurrences = ['daily', 'weekly', 'monthly'] as const;
export type TaskRecurrence = (typeof taskRecurrences)[number];

/** The next round's due date: one period after the old due date, moved forward until it is not in the past. */
export function nextDueDate(recurrence: TaskRecurrence, due: Date | undefined, now = new Date()): Date {
  const step = (d: Date) => {
    const next = new Date(d);
    if (recurrence === 'daily') next.setDate(next.getDate() + 1);
    else if (recurrence === 'weekly') next.setDate(next.getDate() + 7);
    else {
      const day = next.getDate();
      next.setDate(1);
      next.setMonth(next.getMonth() + 1);
      // 31 Jan -> 28/29 Feb, not 3 Mar.
      next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    }
    return next;
  };
  let next = step(due ?? now);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  for (let i = 0; next < today && i < 1000; i++) next = step(next);
  return next;
}
