import type { DataStore } from '../data/store';
import { sendToPrincipal, type PushSender } from '../push/push';
import { alertLine, currentEvents } from './alerts';
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
      const lang = store.alerts.prefs(user.id).lang;
      for (const e of currentEvents(store, user)) {
        if (seen.has(`${e.event}:${e.refId}`)) continue;
        const payload = { title: company, body: alertLine(e.event, lang), url: e.path, tag: `${e.event}:${e.refId}` };
        // Quiet hours: held for the morning summary, and logged so it is not sent again.
        if (quiet) { holdPush(store, audience, user.id, companyId, payload); store.push.logPortal(user.id, [e], 'skipped'); continue; }
        const n = await sendToPrincipal(store, send, audience, user.id, payload);
        // Delivered to at least one device: done. Otherwise it waits for the next sweep.
        if (n > 0) { store.push.logPortal(user.id, [e], 'sent'); delivered += 1; }
      }
    }
  }
  return delivered;
}
