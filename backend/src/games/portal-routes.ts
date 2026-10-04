import type { Request, RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { PortalSession } from '../portal/portal-store';
import type { Game } from './games-store';
import { publicGameDetail, publicGameSummary } from './games';
import type { SessionRequest } from '../portal/common';


/** The lobby inside both portals: public games, plus restricted ones this portal user may view. */
export function registerPortalGameRoutes(router: Router, store: DataStore, companyId: string, requireSession: RequestHandler): void {
  const visibleTo = (session: PortalSession) => (game: Game) =>
    Boolean(game.publishedAt) && !game.archivedAt
    && (game.visibility === 'public' || store.games.isViewer(game.id, { subjectType: 'portal_user', subjectId: session.portalUserId }));

  router.get('/:audience/games', requireSession, (req: SessionRequest, res: Response) => {
    res.json(store.games.list(companyId).filter(visibleTo(req.portal!)).map(publicGameSummary));
  });

  router.get('/:audience/games/:slug', requireSession, (req: SessionRequest, res: Response) => {
    const game = store.games.bySlug(companyId, req.params.slug);
    if (!game || !visibleTo(req.portal!)(game)) throw new HttpError(404, 'Not found.');
    res.json(publicGameDetail(store, game));
  });
}
