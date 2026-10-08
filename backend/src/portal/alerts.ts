import type Database from 'better-sqlite3';
import type { DataStore } from '../data/store';
import { clientProposalStatus, CLIENT_VISIBLE_PROPOSALS } from './requests';
import { paidContactOf } from './influencer';
import { clientVisibleUrl } from './review-flow';
import type { PortalUser } from './portal-store';

/**
 * WhatsApp alerts for portal users who opt in. Events are derived from the data
 * on each sweep (never hooked into individual routes, so none is missed), and
 * each one is logged per user so it is sent once. What existed before opting in
 * is logged as skipped. Messages say what happened and link to the portal; they
 * never carry amounts, rates or anything else a lock screen should not show.
 */

export type AlertEvent = 'message' | 'proposal' | 'invitation' | 'changes' | 'payout' | 'review';
export interface AlertPrefs { portalUserId: string; phone: string | null; whatsapp: boolean; lang: 'en' | 'ar'; updatedAt: string }
export interface PendingAlert { event: AlertEvent; refId: string; path: string }

/** Sends one WhatsApp text from the company's connected number. */
export type WhatsAppSender = (companyId: string, phone: string, text: string, contactId: string) => Promise<void>;

export class PortalAlertsStore {
  constructor(private readonly db: Database.Database) {}

  prefs(portalUserId: string): AlertPrefs {
    const row = this.db.prepare('SELECT * FROM portal_alert_prefs WHERE portalUserId = ?').get(portalUserId) as
      | { portalUserId: string; phone: string | null; whatsapp: number; lang: 'en' | 'ar'; updatedAt: string } | undefined;
    return row ? { ...row, whatsapp: row.whatsapp === 1 } : { portalUserId, phone: null, whatsapp: false, lang: 'en', updatedAt: '' };
  }

  setPrefs(p: Omit<AlertPrefs, 'updatedAt'>): AlertPrefs {
    this.db.prepare(
      `INSERT INTO portal_alert_prefs (portalUserId, phone, whatsapp, lang, updatedAt) VALUES (@portalUserId, @phone, @whatsapp, @lang, @updatedAt)
       ON CONFLICT (portalUserId) DO UPDATE SET phone = excluded.phone, whatsapp = excluded.whatsapp, lang = excluded.lang, updatedAt = excluded.updatedAt`,
    ).run({ ...p, whatsapp: p.whatsapp ? 1 : 0, updatedAt: new Date().toISOString() });
    return this.prefs(p.portalUserId);
  }

  optedIn(): AlertPrefs[] {
    return (this.db.prepare("SELECT * FROM portal_alert_prefs WHERE whatsapp = 1 AND phone IS NOT NULL AND phone != ''").all() as Array<Omit<AlertPrefs, 'whatsapp'> & { whatsapp: number }>)
      .map((r) => ({ ...r, whatsapp: true }));
  }

  /** `event:refId` → its last status and when. */
  logged(portalUserId: string): Map<string, { status: 'sent' | 'skipped' | 'failed'; at: string }> {
    return new Map((this.db.prepare('SELECT event, refId, status, createdAt FROM portal_alert_log WHERE portalUserId = ?').all(portalUserId) as Array<{ event: string; refId: string; status: 'sent' | 'skipped' | 'failed'; createdAt: string }>)
      .map((r) => [`${r.event}:${r.refId}`, { status: r.status, at: r.createdAt }]));
  }

  log(portalUserId: string, items: Array<Pick<PendingAlert, 'event' | 'refId'>>, status: 'sent' | 'skipped' | 'failed', error: string | null = null): void {
    const insert = this.db.prepare(
      `INSERT INTO portal_alert_log (portalUserId, event, refId, status, error, createdAt) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (portalUserId, event, refId) DO UPDATE SET status = excluded.status, error = excluded.error, createdAt = excluded.createdAt`,
    );
    const now = new Date().toISOString();
    this.db.transaction(() => items.forEach((i) => insert.run(portalUserId, i.event, i.refId, status, error, now)))();
  }
}

/** Everything this user could be alerted about right now; the log decides what is new. */
export function currentEvents(store: DataStore, user: PortalUser): PendingAlert[] {
  const out: PendingAlert[] = store.thread.messagesFor(user.companyId, user.contactId)
    .filter((m) => m.authorType === 'staff')
    .map((m) => ({ event: 'message' as const, refId: m.id, path: '/messages' }));
  if (user.audience === 'client') {
    for (const p of store.listCrmProposals(user.companyId)) {
      if (p.contactId === user.contactId && CLIENT_VISIBLE_PROPOSALS.includes(p.status) && clientProposalStatus(p) === 'sent') {
        out.push({ event: 'proposal', refId: p.id, path: `/proposals/${p.id}` });
      }
    }
    // Content waiting for the client: one alert per version (keyed by its link), once the team has approved it.
    for (const c of store.listCrmCampaigns(user.companyId)) {
      if (c.contactId !== user.contactId || c.archivedAt) continue;
      for (const d of store.listCampaignDeliverables(c.id)) {
        if (d.status !== 'Submitted') continue;
        const url = clientVisibleUrl(store, d);
        if (!url || store.reviews.clientReviewOf(d.id, url)) continue;
        out.push({ event: 'review', refId: `${d.id}:${url}`, path: `/campaigns/${c.id}/content/${d.id}` });
      }
    }
    return out;
  }
  for (const id of store.influencer.assignmentIdsOf(user.companyId, user.contactId)) {
    const a = store.getCampaignAssignmentById(id);
    if (a?.status === 'Contacted') out.push({ event: 'invitation', refId: a.id, path: `/deals/peak-${a.id}` });
    if (!a) continue;
    for (const d of store.listCampaignDeliverables(a.campaignId).filter((x) => paidContactOf(x) === user.contactId)) {
      const latest = store.influencer.latestSubmission(d.id);
      if (latest?.staffDecision === 'changes_requested') out.push({ event: 'changes', refId: latest.id, path: `/deals/peak-${a.id}#work-${d.id}` });
    }
  }
  for (const id of store.influencer.paidDeliverableIdsOf(user.companyId, user.contactId)) {
    const billId = store.getCampaignDeliverableById(id)?.vendorBillId;
    if (billId && store.getVendorBillById(billId)?.status === 'Paid') out.push({ event: 'payout', refId: billId, path: '/payouts' });
  }
  // One bill pays several deliverables; one draft can show under several assignments.
  return [...new Map(out.map((e) => [`${e.event}:${e.refId}`, e])).values()];
}

const LINES: Record<AlertEvent, { en: (n: number) => string; ar: (n: number) => string }> = {
  message: { en: (n) => (n === 1 ? 'A new message from the team' : `${n} new messages from the team`), ar: (n) => (n === 1 ? 'رسالة جديدة من الفريق' : `${n} رسائل جديدة من الفريق`) },
  proposal: { en: (n) => (n === 1 ? 'A proposal is ready for your review' : `${n} proposals are ready for your review`), ar: (n) => (n === 1 ? 'عرض جاهز لمراجعتك' : `${n} عروض جاهزة لمراجعتك`) },
  invitation: { en: (n) => (n === 1 ? 'You are invited to a campaign' : `You are invited to ${n} campaigns`), ar: (n) => (n === 1 ? 'لديك دعوة لحملة' : `لديك دعوات لـ ${n} حملات`) },
  changes: { en: (n) => (n === 1 ? 'Changes were requested on your draft' : `Changes were requested on ${n} drafts`), ar: (n) => (n === 1 ? 'طُلبت تعديلات على مسودتك' : `طُلبت تعديلات على ${n} مسودات`) },
  review: { en: (n) => (n === 1 ? 'Content is ready for your review' : `${n} pieces of content are ready for your review`), ar: (n) => (n === 1 ? 'محتوى جاهز لمراجعتك' : `${n} محتويات جاهزة لمراجعتك`) },
  payout: { en: (n) => (n === 1 ? 'A payout was marked paid' : `${n} payouts were marked paid`), ar: (n) => (n === 1 ? 'تم دفع مستحقاتك' : `تم دفع ${n} مستحقات`) },
};

/** One short digest per sweep, in the user's language, with one link. */
export function digest(items: PendingAlert[], lang: 'en' | 'ar', company: string, baseUrl: string): string {
  const counts = new Map<AlertEvent, number>();
  items.forEach((i) => counts.set(i.event, (counts.get(i.event) ?? 0) + 1));
  const lines = [...counts.entries()].map(([e, n]) => `• ${LINES[e][lang](n)}`);
  const path = new Set(items.map((i) => i.path)).size === 1 ? items[0].path : '/';
  const head = `${company}:`;
  const open = lang === 'ar' ? 'افتح البوابة' : 'Open your portal';
  return `${head}\n${lines.join('\n')}\n${open}: ${baseUrl}${path}`;
}

/** A failed send is tried again on a sweep at least this long after. */
const RETRY_AFTER_MS = 60 * 60 * 1000;

/**
 * One pass: for each opted-in, active portal user, send what is new as one
 * digest. A failed send is logged and tried again an hour later.
 */
export async function sweepPortalAlerts(store: DataStore, send: WhatsAppSender, companyId: string, baseUrlFor: (audience: 'client' | 'influencer') => string, now = new Date()): Promise<number> {
  let sent = 0;
  const company = store.getCompanyById(companyId)?.name ?? '';
  for (const prefs of store.alerts.optedIn()) {
    const user = store.portal.getUser(prefs.portalUserId);
    if (!user || user.companyId !== companyId || user.status !== 'active') continue;
    const log = store.alerts.logged(user.id);
    const due = currentEvents(store, user).filter((e) => {
      const entry = log.get(`${e.event}:${e.refId}`);
      return !entry || (entry.status === 'failed' && now.getTime() - Date.parse(entry.at) >= RETRY_AFTER_MS);
    });
    if (due.length === 0) continue;
    try {
      await send(companyId, prefs.phone!, digest(due, prefs.lang, company, baseUrlFor(user.audience)), user.contactId);
      store.alerts.log(user.id, due, 'sent');
      sent += 1;
    } catch (error) {
      store.alerts.log(user.id, due, 'failed', (error as Error).message.slice(0, 300));
    }
  }
  return sent;
}

/** On opting in, everything that already happened is marked skipped: alerts start from now. */
export function baselineAlerts(store: DataStore, user: PortalUser): void {
  const seen = store.alerts.logged(user.id);
  store.alerts.log(user.id, currentEvents(store, user).filter((e) => !seen.has(`${e.event}:${e.refId}`)), 'skipped');
}

/** Phone as digits with country code, 8 to 15 of them; spaces, dashes and a leading + are allowed. */
export function normalisePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/^\s*\+/, '').replace(/[\s-]/g, '');
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}
