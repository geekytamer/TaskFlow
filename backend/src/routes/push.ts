import type { Express, Response } from 'express';
import { HttpError } from '../http';
import type { PushConfig } from '../push/push';
import { parseSubscription } from '../push/push';
import type { RouteContext } from './context';
import { type AuthedRequest, handler } from './shared';

/**
 * Phone notifications for staff: the public key the browser needs, and turning
 * a device on or off. Any signed-in person manages only their own devices.
 */
export function registerPushRoutes(app: Express, ctx: RouteContext, push: PushConfig | undefined): void {
  const { store, authMiddleware } = ctx;

  app.get('/push/public-key', (_req, res: Response) => {
    res.json(push ? { enabled: true, publicKey: push.publicKey } : { enabled: false });
  });

  app.post(
    '/push/subscribe',
    authMiddleware,
    handler((req: AuthedRequest, res) => {
      if (!push) throw new HttpError(409, 'Phone notifications are not set up on this server.');
      const s = parseSubscription(req.body);
      store.push.subscribe({
        audience: 'staff', principalId: req.user!.id, companyId: null, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth,
        userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) || null,
      });
      res.status(201).json({ subscribed: true });
    }),
  );

  app.post(
    '/push/unsubscribe',
    authMiddleware,
    handler((req: AuthedRequest, res) => {
      const endpoint = (req.body ?? {}).endpoint;
      if (typeof endpoint !== 'string') throw new HttpError(400, 'endpoint is required.');
      store.push.unsubscribe('staff', req.user!.id, endpoint);
      res.status(204).end();
    }),
  );
}
