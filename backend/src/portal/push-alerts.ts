import type { DataStore } from '../data/store';
import { sendToPrincipal, type PushSender } from '../push/push';
import { alertLine, currentEvents } from './alerts';
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
export async function sweepPortalPush(store: DataStore, send: PushSender, companyId: string): Promise<number> {
  let delivered = 0;
  const company = store.getCompanyById(companyId)?.name ?? '';
  for (const audience of ['client', 'influencer'] as const) {
    for (const { principalId } of store.push.principals(audience)) {
      const user = store.portal.getUser(principalId);
      if (!user || user.companyId !== companyId || user.status !== 'active') continue;
      const seen = store.push.portalLogged(user.id);
      const lang = store.alerts.prefs(user.id).lang;
      for (const e of currentEvents(store, user)) {
        if (seen.has(`${e.event}:${e.refId}`)) continue;
        const n = await sendToPrincipal(store, send, audience, user.id, { title: company, body: alertLine(e.event, lang), url: e.path, tag: `${e.event}:${e.refId}` });
        // Delivered to at least one device: done. Otherwise it waits for the next sweep.
        if (n > 0) { store.push.logPortal(user.id, [e], 'sent'); delivered += 1; }
      }
    }
  }
  return delivered;
}
