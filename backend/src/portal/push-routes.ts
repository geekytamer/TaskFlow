import type { RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import { parseSubscription, type PushConfig } from '../push/push';
import type { SessionRequest } from './common';
import { baselinePortalPush } from './push-alerts';

/** Portal users turn phone notifications on or off for their own devices. */
export function registerPortalPushRoutes(router: Router, store: DataStore, companyId: string, requireSession: RequestHandler, push: PushConfig | undefined): void {
  router.get('/:audience/push/public-key', requireSession, (_req: SessionRequest, res: Response) => {
    res.json(push ? { enabled: true, publicKey: push.publicKey } : { enabled: false });
  });

  router.post('/:audience/push/subscribe', requireSession, (req: SessionRequest, res: Response) => {
    if (!push) throw new HttpError(409, 'Phone notifications are not set up on this server.');
    const session = req.portal!;
    const s = parseSubscription(req.body);
    const firstDevice = store.push.forPrincipal(session.audience, session.portalUserId).length === 0;
    if (firstDevice) {
      const user = store.portal.getUser(session.portalUserId);
      if (user) baselinePortalPush(store, user);
    }
    store.push.subscribe({
      audience: session.audience, principalId: session.portalUserId, companyId, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth,
      userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) || null,
    });
    res.status(201).json({ subscribed: true });
  });

  router.post('/:audience/push/unsubscribe', requireSession, (req: SessionRequest, res: Response) => {
    const endpoint = (req.body ?? {}).endpoint;
    if (typeof endpoint !== 'string') throw new HttpError(400, 'endpoint is required.');
    store.push.unsubscribe(req.portal!.audience, req.portal!.portalUserId, endpoint);
    res.status(204).end();
  });
}
