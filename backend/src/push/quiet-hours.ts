import type { DataStore } from '../data/store';
import { sendToPrincipal, type PushPayload, type PushSender } from './push';
import type { HeldRow, PushAudience } from './push-store';

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
  if (process.env.TASKFLOW_QUIET_HOURS === 'off') return false; // test suites that run at any time of day
  return inQuietHours(new Date(nowMs).toISOString(), store.conversations.settings(companyId).timeZone);
}

/** Keeps a push for the morning. One per (person, tag); the latest wins. */
export function holdPush(store: DataStore, audience: PushAudience, principalId: string, companyId: string, payload: PushPayload): void {
  store.push.hold(audience, principalId, companyId, payload);
}

const CONVERSATIONS = {
  en: (n: number) => (n === 1 ? '1 conversation needs you' : `${n} conversations need you`),
  ar: (n: number) => (n === 1 ? 'محادثة واحدة بانتظارك' : `${n} محادثات بانتظارك`),
};
const UPDATES = {
  en: (n: number) => (n === 1 ? '1 update while you were away' : `${n} updates while you were away`),
  ar: (n: number) => (n === 1 ? 'تحديث واحد أثناء غيابك' : `${n} تحديثات أثناء غيابك`),
};

/**
 * After quiet hours: one summary push per person with held pushes. The held
 * rows are claimed before sending, so overlapping runs cannot double-send, and
 * are put back if no device took the summary (while the person still has one).
 * Returns how many summaries went out.
 */
export async function releaseHeldPush(store: DataStore, send: PushSender, companyId: string, nowIso: string): Promise<number> {
  if (inQuietHours(nowIso, store.conversations.settings(companyId).timeZone)) return 0;
  const title = store.getCompanyById(companyId)?.name ?? '';
  const groups = new Map<string, HeldRow[]>();
  for (const r of store.push.claimHeld(companyId)) {
    const key = `${r.audience}\u0000${r.principalId}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  let sent = 0;
  for (const rows of groups.values()) {
    const { audience, principalId } = rows[0];
    const lang = audience === 'staff' ? 'en' : store.alerts.prefs(principalId).lang === 'ar' ? 'ar' : 'en';
    const conversations = rows.every((r) => r.tag.startsWith('thread:'));
    const staff = audience === 'staff';
    const payload = {
      title,
      body: (conversations ? CONVERSATIONS : UPDATES)[lang](rows.length),
      url: conversations ? (staff ? '/inbox' : '/messages') : (staff ? '/notifications' : '/'),
      tag: 'quiet-summary',
    };
    let n = 0;
    try { n = await sendToPrincipal(store, send, audience, principalId, payload); } catch { n = 0; }
    if (n > 0) sent += 1;
    else if (store.push.forPrincipal(audience, principalId).length > 0) store.push.restoreHeld(rows);
  }
  return sent;
}
