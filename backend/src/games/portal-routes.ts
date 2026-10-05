import type { Request, RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { PortalSession } from '../portal/portal-store';
import type { Game } from './games-store';
import { boardOf, publicGameDetail, publicGameSummary } from './games';
import type { SessionRequest } from '../portal/common';
import { brandGameFor, brandGameReport, brandGames, brandGameSummary } from './brand-report';


/** The lobby inside both portals: public games, plus restricted ones this portal user may view. */
export function registerPortalGameRoutes(router: Router, store: DataStore, companyId: string, requireSession: RequestHandler): void {
  const visibleTo = (session: PortalSession) => (game: Game) =>
    Boolean(game.publishedAt) && !game.archivedAt
    && (game.visibility === 'public'
      || store.games.isViewer(game.id, { subjectType: 'portal_user', subjectId: session.portalUserId })
      // The brand a game was run for sees it without being added as a viewer.
      || (session.audience === 'client' && game.clientContactId === session.contactId));

  // Brand reports: only for the client the game was run for (404 for anyone else).
  router.get('/:audience/brand-games', requireSession, (req: SessionRequest, res: Response) => {
    if (req.portal!.audience !== 'client') throw new HttpError(404, 'Not found.');
    res.json(brandGames(store, companyId, req.portal!).map((g) => brandGameSummary(store, g)));
  });

  router.get('/:audience/brand-games/:slug', requireSession, (req: SessionRequest, res: Response) => {
    res.json(brandGameReport(store, brandGameFor(store, companyId, req.portal!, req.params.slug)));
  });

  router.get('/:audience/games', requireSession, (req: SessionRequest, res: Response) => {
    res.json(store.games.list(companyId).filter(visibleTo(req.portal!)).map(publicGameSummary));
  });

  router.get('/:audience/games/:slug', requireSession, (req: SessionRequest, res: Response) => {
    const game = store.games.bySlug(companyId, req.params.slug);
    if (!game || !visibleTo(req.portal!)(game)) throw new HttpError(404, 'Not found.');
    const handle = typeof req.query.handle === 'string' ? req.query.handle.slice(0, 64) : undefined;
    res.json(publicGameDetail(store, game, { handle }));
  });

  // An influencer's own standing in a creators game: their rank and their own figures only.
  router.get('/:audience/games/:slug/me', requireSession, (req: SessionRequest, res: Response) => {
    const game = store.games.bySlug(companyId, req.params.slug);
    if (req.portal!.audience !== 'influencer' || !game || !visibleTo(req.portal!)(game) || game.audience !== 'creators') throw new HttpError(404, 'Not found.');
    const contactId = req.portal!.contactId;
    if (!store.games.participants(game.id).includes(contactId)) return res.json({ participating: false });
    const stat = store.games.creatorStats(game.id).find((s) => s.contactId === contactId) ?? null;
    const row = stat ? boardOf(store, game).find((r) => r.actorKey === stat.actorKey) ?? null : null;
    const connected = store.social.accountsFor(companyId, contactId).some((a) => a.status === 'active');
    res.json({
      participating: true, connected, tag: game.tag,
      rank: row?.rank ?? null, points: row?.points ?? 0,
      stats: stat ? { posts: stat.posts, views: stat.views, shares: stat.shares, engagement: stat.engagement, followerGrowth: stat.followerGrowth, updatedAt: stat.updatedAt } : null,
    });
  });
}
