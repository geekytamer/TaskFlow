import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { DataStore } from '../data/store';
import { publicKit } from './media-kit';

/** Published media kits, for anyone with the link. Read-only, rate limited, briefly cacheable. */
export function createPublicKitRouter(store: DataStore, companyId: string, options: { enforceRateLimits: boolean }): Router {
  const router = Router();
  router.use(rateLimit({
    windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false,
    skip: () => !options.enforceRateLimits, message: { message: 'Too many requests.' },
  }));
  router.get('/kit/:slug', (req: Request, res: Response) => {
    const kit = publicKit(store, companyId, req.params.slug);
    if (!kit) return res.status(404).json({ message: 'Not found.' });
    res.set('Cache-Control', 'public, max-age=60').json(kit);
  });
  return router;
}
