/** Pure helpers for the staff inbox. Dates are in the viewer's local time. */

/** Conversations belong to contacts: the server gates every inbox route on contacts:read. */
export const INBOX_PERMISSION = 'contacts:read';

/** Tomorrow at 08:00. */
export function tomorrowAt8(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0, 0, 0);
}

/** The next Sunday at 08:00 (start of the Muscat working week); on a Sunday it means the following one. */
export function nextWeekAt8(now: Date): Date {
  const ahead = (7 - now.getDay()) % 7 || 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, 8, 0, 0, 0);
}

/** Sidebar badge: conversations waiting on us that are mine or nobody's yet. */
export function waitingCount(counts: { mine: number; unassigned: number; all: number } | null | undefined): number {
  if (!counts) return 0;
  const n = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  return n(counts.mine) + n(counts.unassigned);
}
