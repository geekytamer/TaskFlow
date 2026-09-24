import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { HttpError } from '../http';
import { asRecord, requiredString } from '../validation';
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

  const requireSession = (req: PortalRequest, _res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    const session = token ? portal.getSession(token) : undefined;
    if (!session || session.audience !== audienceOf(req) || session.companyId !== companyId) {
      return next(new HttpError(401, 'Unauthorized'));
    }
    req.portal = session;
    req.portalToken = token;
    return next();
  };

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
