import type { DataStore } from '../data/store';
import { sendToPrincipal, type PushSender } from '../push/push';
import { alertLine, currentEvents, GROUP_OF, type PendingAlert } from './alerts';
import { companyInQuietHours, holdPush } from '../push/quiet-hours';
import type { PortalUser } from './portal-store';

/**
 * Phone notifications for portal users, from the same events as the WhatsApp
 * alerts (alerts.ts). One notification per event, so each opens its own page,
 * each sent once. What existed when someone first turned a device on is
 * marked skipped: notifications start from then.
 */

/** On a person's first device, everything that already happened counts as seen. */
export function baselinePortalPush(store: DataStore, user: PortalUser): void {
  const seen = store.push.portalLogged(user.id);
  store.push.logPortal(user.id, currentEvents(store, user).filter((e) => !seen.has(`${e.event}:${e.refId}`)), 'skipped');
}

/** One push per (person, thread) inside this window; what arrives meanwhile goes out as one push after it. */
export const THREAD_PUSH_WINDOW_MS = 2 * 60 * 1000;
/** How much of a message the lock screen may show. */
const PREVIEW_CHARS = 120;

const countLine = (n: number, lang: 'en' | 'ar') =>
  lang === 'ar' ? (n === 1 ? 'رسالة جديدة' : `${n} رسائل جديدة`) : (n === 1 ? 'New message' : `${n} new messages`);

/** One pass over everyone with a device. Returns how many notifications were delivered. */
export async function sweepPortalPush(store: DataStore, send: PushSender, companyId: string, nowMs: number = Date.now()): Promise<number> {
  let delivered = 0;
  const quiet = companyInQuietHours(store, companyId, nowMs);
  const company = store.getCompanyById(companyId)?.name ?? '';
  for (const audience of ['client', 'influencer'] as const) {
    for (const { principalId } of store.push.principals(audience)) {
      const user = store.portal.getUser(principalId);
      if (!user || user.companyId !== companyId || user.status !== 'active') continue;
      const seen = store.push.portalLogged(user.id);
      const prefs = store.alerts.prefs(user.id);
      const lang = prefs.lang;
      const messagesByThread = new Map<string, PendingAlert[]>();
      for (const e of currentEvents(store, user)) {
        if (seen.has(`${e.event}:${e.refId}`)) continue;
        // A group switched off: marked skipped, so switching it on later does not replay the past.
        if (!prefs.groups[GROUP_OF[e.event]].push) { store.push.logPortal(user.id, [e], 'skipped'); continue; }
        if (e.event === 'message') {
          const list = messagesByThread.get(e.path) ?? [];
          list.push(e);
          messagesByThread.set(e.path, list);
          continue;
        }
        const payload = { title: company, body: alertLine(e.event, lang), url: e.path, tag: `${e.event}:${e.refId}` };
        // Quiet hours: held for the morning summary, and logged so it is not sent again.
        if (quiet) { holdPush(store, audience, user.id, companyId, payload); store.push.logPortal(user.id, [e], 'skipped'); continue; }
        const n = await sendToPrincipal(store, send, audience, user.id, payload);
        // Delivered to at least one device: done. Otherwise it waits for the next sweep.
        if (n > 0) { store.push.logPortal(user.id, [e], 'sent'); delivered += 1; }
      }
      // Staff messages: one push per thread carrying how many are unread; the tag makes a later one replace the earlier.
      for (const [path, events] of messagesByThread) {
        const threadId = events[0].threadId ?? path.replace('/messages/', '');
        const readAt = store.conversations.readsOf(threadId).find((r) => r.readerType === 'portal' && r.readerId === user.id)?.lastReadAt ?? '';
        const isUnread = (m: { createdAt: string }) => m.createdAt > readAt;
        const msgs = events.map((e) => ({ e, m: store.conversations.getMessage(e.refId) }));
        // Already read: nothing to tell them about.
        const read = msgs.filter((x) => !x.m || !isUnread(x.m)).map((x) => x.e);
        if (read.length > 0) store.push.logPortal(user.id, read, 'skipped');
        const fresh = msgs.filter((x) => x.m && isUnread(x.m)) as Array<{ e: PendingAlert; m: NonNullable<typeof msgs[number]['m']> }>;
        if (fresh.length === 0) continue;
        const unread = store.conversations.messages(threadId).filter((m) => m.authorType === 'staff' && m.channel === 'portal' && m.visibility === 'external' && isUnread(m)).length;
        const last = store.push.portalThreadPush(user.id, threadId);
        const age = last ? nowMs - Date.parse(last.pushedAt) : Infinity;
        if (!quiet && age < THREAD_PUSH_WINDOW_MS) continue; // the window holds it; the next sweep after it sends the count
        const count = Math.max(unread, fresh.length);
        const latest = prefs.preview ? fresh[fresh.length - 1].m : undefined;
        const text = latest && latest.visibility === 'external' && latest.channel === 'portal' ? latest.body.slice(0, PREVIEW_CHARS).trim() : '';
        const line = countLine(count, lang);
        const payload = { title: company, body: text ? `${line}: ${text}` : line, url: path, tag: `thread:${threadId}` };
        if (quiet) {
          holdPush(store, audience, user.id, companyId, payload);
          store.push.logPortal(user.id, fresh.map((x) => x.e), 'skipped');
          store.push.setPortalThreadPush(user.id, threadId, new Date(nowMs).toISOString(), count);
          continue;
        }
        const n = await sendToPrincipal(store, send, audience, user.id, payload);
        if (n > 0) {
          store.push.logPortal(user.id, fresh.map((x) => x.e), 'sent');
          store.push.setPortalThreadPush(user.id, threadId, new Date(nowMs).toISOString(), count);
          delivered += 1;
        }
      }
    }
  }
  return delivered;
}
