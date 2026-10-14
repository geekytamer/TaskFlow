/** Pure helpers for the thread timeline and composer. */

/** A note is editable while the server-issued editableUntil is still in the future. */
export function canEdit(message: { editableUntil: string | null }, now: Date): boolean {
  return !!message.editableUntil && Date.parse(message.editableUntil) > now.getTime();
}

export interface DayGroup<T> { key: string; label: string; items: T[] }

/** Groups messages (oldest first) by calendar day in the given time zone (default: the viewer's). */
export function groupByDay<T extends { createdAt: string }>(
  messages: T[],
  locale: 'en' | 'ar',
  timeZone?: string,
): DayGroup<T>[] {
  const key = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const label = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', {
    timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
  const groups: DayGroup<T>[] = [];
  for (const m of messages) {
    const d = new Date(m.createdAt);
    const k = key.format(d);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.items.push(m);
    else groups.push({ key: k, label: label.format(d), items: [m] });
  }
  return groups;
}
