import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { DataStore } from '../data/store';
import { isPubliclyListed, publicGameDetail, publicGameSummary } from './games';

/**
 * The public lobby: read-only, no sign-in. Only published public games, and per
 * game only rules, how points are earned, the prize and rank/handle/points.
 */
export function createPublicGamesRouter(store: DataStore, companyId: string, options: { enforceRateLimits: boolean }): Router {
  const router = Router();
  router.use(rateLimit({
    windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false,
    skip: () => !options.enforceRateLimits, message: { message: 'Too many requests.' },
  }));
  const cache = (res: Response) => res.set('Cache-Control', 'public, max-age=60');

  router.get('/games', (_req: Request, res: Response) => {
    cache(res).json(store.games.list(companyId).filter(isPubliclyListed).map(publicGameSummary));
  });

  router.get('/games/:slug', (req: Request, res: Response) => {
    const game = store.games.bySlug(companyId, req.params.slug);
    if (!game || !isPubliclyListed(game)) return res.status(404).json({ message: 'Not found.' });
    cache(res).json(publicGameDetail(store, game));
  });
  return router;
}
