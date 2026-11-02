import type { Express, Response } from 'express';
import type { LiveHub } from '../live/hub';
import type { RouteContext } from './context';
import type { AuthedRequest } from './shared';

/**
 * GET /live: a Server-Sent Events stream of "this changed" signals for the
 * companies the signed-in person reaches (live/hub.ts): their memberships and,
 * under PERMISSIONS_ENGINE=v2, the companies a holding-group role covers
 * (Ruling P). Read with fetch so the token travels in the Authorization
 * header, never in the URL.
 */
export function registerLiveRoutes(app: Express, ctx: Pick<RouteContext, 'authMiddleware' | 'accessibleCompanyIds'>, hub: LiveHub) {
  app.get('/live', ctx.authMiddleware, (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    const stop = hub.open(res, user.id, ctx.accessibleCompanyIds(user));
    req.on('close', stop);
    res.on('close', stop);
  });
}
