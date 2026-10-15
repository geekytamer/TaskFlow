import { NOTIFICATION_CATEGORIES, normalizeNotificationPrefs } from '../notifications';
import type { NotificationPrefs } from '../types';
import { asRecord } from '../validation';
import type { RouteContext } from './context';
import { handler } from './shared';
import type { Express } from 'express';

/** Notifications. */
export function registerNotificationRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware } = ctx;

  app.get(
    '/notifications',
    authMiddleware,
    handler((req, res) => {
      const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      res.json(store.listNotifications(req.user!.id, { unreadOnly, limit }));
    }),
  );

  app.get(
    '/notifications/unread-count',
    authMiddleware,
    handler((req, res) => {
      res.json({ count: store.unreadNotificationCount(req.user!.id) });
    }),
  );

  app.post(
    '/notifications/read-all',
    authMiddleware,
    handler((req, res) => {
      res.json({ updated: store.markAllNotificationsRead(req.user!.id) });
    }),
  );

  app.post(
    '/notifications/:id/read',
    authMiddleware,
    handler((req, res) => {
      const updated = store.markNotificationRead(req.user!.id, req.params.id);
      res.json({ updated });
    }),
  );

  app.get(
    '/notifications/preferences',
    authMiddleware,
    handler((req, res) => {
      res.json(store.getNotificationPrefs(req.user!.id));
    }),
  );

  app.put(
    '/notifications/preferences',
    authMiddleware,
    handler((req, res) => {
      const body = asRecord(req.body, 'body');
      const current = store.getNotificationPrefs(req.user!.id);
      const next: Record<string, unknown> = {};
      for (const category of NOTIFICATION_CATEGORIES) {
        // A category the client did not send keeps what it had (a new one starts at its default).
        if (body[category] === undefined) { next[category] = current[category]; continue; }
        const entry = asRecord(body[category], category);
        // A channel the client did not send keeps what it had.
        const keep = current[category];
        next[category] = {
          inApp: typeof entry.inApp === 'boolean' ? entry.inApp : keep.inApp,
          email: typeof entry.email === 'boolean' ? entry.email : keep.email,
          push: typeof entry.push === 'boolean' ? entry.push : keep.push,
        };
      }
      next.pushPreview = body.pushPreview === undefined ? current.pushPreview : body.pushPreview !== false;
      const prefs = store.updateNotificationPrefs(
        req.user!.id,
        normalizeNotificationPrefs(next) as NotificationPrefs,
      );
      res.json(prefs);
    }),
  );
}
