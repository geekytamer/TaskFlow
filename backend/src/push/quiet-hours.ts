import type { DataStore } from '../data/store';
import { sendToPrincipal, type PushPayload, type PushSender } from './push';
import type { PushAudience } from './push-store';

/**
 * Quiet hours for phone notifications: between 22:00 and 08:00 (company time)
 * pushes are held, not sent, and after they end each person gets one summary.
 * In-app notifications are never held.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Minutes since local midnight in the zone. */
function localMinutes(ms: number, timeZone: string): number {
  let f = formatters.get(timeZone);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: 'numeric', minute: 'numeric' }); formatters.set(timeZone, f); }
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(ms))) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return p.hour * 60 + p.minute;
}

const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Whether the zone's clock is inside [start, end), which may run past midnight. */
export function inQuietHours(nowIso: string, timeZone: string, start = '22:00', end = '08:00'): boolean {
  const now = localMinutes(Date.parse(nowIso), timeZone);
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return false;
  return s < e ? now >= s && now < e : now >= s || now < e;
}

/** Whether this company is in quiet hours at this instant. */
export function companyInQuietHours(store: DataStore, companyId: string, nowMs: number): boolean {
  return inQuietHours(new Date(nowMs).toISOString(), store.conversations.settings(companyId).timeZone);
}

/** Keeps a push for the morning. One per (person, tag); the latest wins. */
export function holdPush(store: DataStore, audience: PushAudience, principalId: string, companyId: string, payload: PushPayload): void {
  store.push.hold(audience, principalId, companyId, payload);
}

const SUMMARY = {
  en: (n: number) => (n === 1 ? '1 conversation needs you' : `${n} conversations need you`),
  ar: (n: number) => (n === 1 ? 'محادثة واحدة بانتظارك' : `${n} محادثات بانتظارك`),
};

/**
 * After quiet hours: one summary push per person with held pushes, then the
 * held rows are cleared. Returns how many summaries went out.
 */
export async function releaseHeldPush(store: DataStore, send: PushSender, companyId: string, nowIso: string): Promise<number> {
  if (inQuietHours(nowIso, store.conversations.settings(companyId).timeZone)) return 0;
  const title = store.getCompanyById(companyId)?.name ?? '';
  let sent = 0;
  for (const g of store.push.heldGroups(companyId)) {
    const lang = g.audience === 'staff' ? 'en' : store.alerts.prefs(g.principalId).lang;
    const n = await sendToPrincipal(store, send, g.audience, g.principalId, {
      title, body: SUMMARY[lang === 'ar' ? 'ar' : 'en'](g.count), url: g.audience === 'staff' ? '/inbox' : '/messages', tag: 'quiet-summary',
    });
    store.push.clearHeld(g.audience, g.principalId, companyId);
    if (n > 0) sent += 1;
  }
  return sent;
}
