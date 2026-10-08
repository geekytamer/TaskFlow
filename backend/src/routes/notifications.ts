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
      const next: Record<string, { inApp: boolean; email: boolean; push: boolean }> = {};
      for (const category of NOTIFICATION_CATEGORIES) {
        const entry = asRecord(body[category] ?? {}, category);
        next[category] = {
          inApp: entry.inApp !== false,
          email: entry.email !== false,
          push: entry.push !== false,
        };
      }
      const prefs = store.updateNotificationPrefs(
        req.user!.id,
        normalizeNotificationPrefs(next) as NotificationPrefs,
      );
      res.json(prefs);
    }),
  );
}
