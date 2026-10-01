import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { HttpError } from '../http';
import { asRecord, requiredString } from '../validation';
import type { DataStore } from '../data/store';
import { registerClientCatalogueRoutes, type ClientCatalogueDeps } from './client-catalogue-routes';
import { registerClientCampaignRoutes } from './client-campaigns-routes';
import { registerClientRequestRoutes } from './client-requests-routes';
import { registerThreadRoutes } from './thread-routes';
import { registerReferralRoutes } from './referral-routes';
import { registerInfluencerRoutes } from './influencer-routes';
import { registerPortalGameRoutes } from '../games/portal-routes';
import { registerClientBillingRoutes, type PortalPdfRenderer } from './client-billing-routes';
import { toBrandingDto, toMeDto, type PortalBranding } from './dto';
import { portalAudiences, type PortalAudience, type PortalSession, type PortalStore } from './portal-store';

interface PortalRequest extends Request {
  portal?: PortalSession;
  portalToken?: string;
}

export interface PortalRouterOptions {
  portal: PortalStore;
  /** The one company this portal deployment serves. */
  companyId: string;
  getBranding: () => PortalBranding | undefined;
  /** Display name of the contact a user is bound to: the client organisation or the influencer. */
  getSubjectName: (contactId: string) => string | undefined;
  /** Throttle sign-in and invitation acceptance. */
  enforceRateLimits?: boolean;
  logger?: { error: (...args: unknown[]) => void };
  /** The client catalogue. Absent: the catalogue routes do not exist. */
  catalogue?: ClientCatalogueDeps;
  /** Campaign requests and proposals. Absent: those routes do not exist. */
  requestsStore?: DataStore;
  /** Renders invoices, receipts and statements. Absent: the billing routes do not exist. */
  pdf?: PortalPdfRenderer;
  /** Where the staff app serves the public invoice page the invoice PDF is rendered from. */
  appPublicUrl?: string;
}

const bearerToken = (req: Request) => {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

const audienceOf = (req: Request) => req.params.audience as PortalAudience;

/** A password is not trimmed like other strings, so only reject a missing or empty one. */
const rawPassword = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0) throw new HttpError(400, 'password is required.');
  return value;
};

export function createPortalRouter(options: PortalRouterOptions): Router {
  const { portal, companyId } = options;
  const router = Router();

  const skip = () => !options.enforceRateLimits;
  const message = { message: 'Too many attempts. Please try again in a few minutes.' };
  const byAddress = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, skip, message,
  });
  const byEmail = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, skip, message,
    keyGenerator: (req) =>
      `${audienceOf(req)}:${String((req.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase()}`,
  });

  /** A session for the route's audience: fixed when given, else the `:audience` path segment. */
  const requireSessionFor = (fixed?: PortalAudience) =>
    (req: PortalRequest, _res: Response, next: NextFunction) => {
      const token = bearerToken(req);
      const session = token ? portal.getSession(token) : undefined;
      const audience = fixed ?? audienceOf(req);
      if (!session || session.audience !== audience || session.companyId !== companyId) {
        return next(new HttpError(401, 'Unauthorized'));
      }
      req.portal = session;
      req.portalToken = token;
      return next();
    };
  const requireSession = requireSessionFor();

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.param('audience', (_req, _res, next, value: string) => {
    if ((portalAudiences as readonly string[]).includes(value)) return next();
    return next(new HttpError(404, 'Not found.'));
  });

  router.get('/:audience/branding', (req, res) => {
    const branding = options.getBranding();
    if (!branding) throw new HttpError(404, 'Not found.');
    res.json(toBrandingDto(branding, audienceOf(req)));
  });

  router.get('/:audience/invitations/:token', byAddress, (req, res) => {
    const invited = portal.getInvitation(req.params.token);
    if (!invited || invited.audience !== audienceOf(req) || invited.companyId !== companyId) {
      throw new HttpError(404, 'This invitation is no longer valid.');
    }
    res.json({ name: invited.name, email: invited.email });
  });

  router.post('/:audience/auth/accept-invite', byAddress, (req, res) => {
    const body = asRecord(req.body, 'body');
    const token = requiredString(body.token, 'token', { min: 10 });
    const password = rawPassword(body.password);
    const invited = portal.getInvitation(token);
    if (!invited || invited.audience !== audienceOf(req) || invited.companyId !== companyId) {
      throw new HttpError(400, 'This invitation is no longer valid.');
    }
    const user = portal.acceptInvitation(token, password);
    const session = portal.createSession(user.id);
    res.json({ token: session.token, expiresAt: session.expiresAt.toISOString() });
  });

  router.post('/:audience/auth/login', byAddress, byEmail, (req, res) => {
    const body = asRecord(req.body, 'body');
    const email = requiredString(body.email, 'email', { min: 3 });
    const password = rawPassword(body.password);
    const user = portal.authenticate(companyId, audienceOf(req), email, password);
    if (!user) throw new HttpError(401, 'Invalid email or password.');
    const session = portal.createSession(user.id);
    res.json({ token: session.token, expiresAt: session.expiresAt.toISOString() });
  });

  router.post('/:audience/auth/logout', requireSession, (req: PortalRequest, res) => {
    portal.revokeSession(req.portalToken!);
    res.json({ success: true });
  });

  router.get('/:audience/me', requireSession, (req: PortalRequest, res) => {
    const session = req.portal!;
    res.json(toMeDto(session, options.getSubjectName(session.contactId), options.getBranding()));
  });

  if (options.catalogue) {
    registerClientCatalogueRoutes(router, options.catalogue, companyId, requireSessionFor('client'));
  }
  if (options.requestsStore) {
    registerClientRequestRoutes(router, options.requestsStore, companyId, requireSessionFor('client'));
    registerClientCampaignRoutes(router, options.requestsStore, companyId, requireSessionFor('client'));
    registerThreadRoutes(router, options.requestsStore, companyId, requireSession);
    registerReferralRoutes(router, options.requestsStore, companyId, requireSession);
    registerInfluencerRoutes(router, options.requestsStore, companyId, requireSessionFor('influencer'));
    registerPortalGameRoutes(router, options.requestsStore, companyId, requireSession);
    if (options.pdf) {
      registerClientBillingRoutes(router, options.requestsStore, companyId, requireSessionFor('client'), {
        pdf: options.pdf,
        appPublicUrl: (options.appPublicUrl ?? 'http://localhost:3000').replace(/\/$/, ''),
      });
    }
  }

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    options.logger?.error('[portal] unexpected error', error);
    res.status(500).json({ message: 'Something went wrong.' });
  });

  return router;
}
