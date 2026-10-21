import type { Express, Response } from 'express';
import { getAccessibleCompanyIds } from '../http';
import type { LiveHub } from '../live/hub';
import type { RouteContext } from './context';
import type { AuthedRequest } from './shared';

/**
 * GET /live: a Server-Sent Events stream of "this changed" signals for the
 * companies the signed-in person belongs to (live/hub.ts). Read with fetch so
 * the token travels in the Authorization header, never in the URL.
 */
export function registerLiveRoutes(app: Express, ctx: Pick<RouteContext, 'authMiddleware'>, hub: LiveHub) {
  app.get('/live', ctx.authMiddleware, (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    const stop = hub.open(res, user.id, getAccessibleCompanyIds(user));
    req.on('close', stop);
    res.on('close', stop);
  });
}
