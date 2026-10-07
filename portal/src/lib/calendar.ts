/** Browser safe. Calendar arithmetic on plain YYYY-MM-DD strings, in UTC so no time zone shifts a day. */

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Weeks start on Sunday: the working week in Oman, where most of Peak's influencers are. */
export const WEEK_STARTS_ON = 0;

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return iso(d).slice(0, 7);
}

/** The month as whole weeks of dates, from the Sunday on or before the 1st to the Saturday on or after the last day. */
export function monthGrid(month: string): string[][] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() - WEEK_STARTS_ON + 7) % 7));
  const weeks: string[][] = [];
  for (const d = new Date(start); d <= last || weeks.at(-1)?.length !== 7; ) {
    if (!weeks.length || weeks.at(-1)!.length === 7) weeks.push([]);
    weeks.at(-1)!.push(iso(d));
    d.setUTCDate(d.getUTCDate() + 1);
    if (d > last && weeks.at(-1)!.length === 7) break;
  }
  return weeks;
}

export function groupByDay<T extends { dueDate: string }>(items: T[]): Array<{ date: string; items: T[] }> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(item.dueDate, [...(map.get(item.dueDate) ?? []), item]);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({ date, items: list }));
}

export const todayIso = () => iso(new Date());
