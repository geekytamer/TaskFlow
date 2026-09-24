import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { SanitizedUser } from '../types';
import { asRecord, enumValue, requiredString } from '../validation';
import type { PortalInviteSender } from './portal-email';
import { portalAudiences, rolesForAudience, type PortalAudience, type PortalRole, type PortalUser } from './portal-store';

export type StaffRequest = Request & { user?: SanitizedUser };

export interface PortalStaffDeps {
  store: DataStore;
  authMiddleware: RequestHandler;
  requireCompanyAccess(req: StaffRequest, companyId: string): void;
  canManagePortal(req: StaffRequest, companyId: string): boolean;
  inviteLink(audience: PortalAudience, token: string): string;
  sendInvite: PortalInviteSender;
}

const REQUIRED_CONTACT_ROLE: Record<PortalAudience, 'Client' | 'Influencer'> = {
  client: 'Client',
  influencer: 'Influencer',
};

const wrap =
  (fn: (req: StaffRequest, res: Response) => unknown | Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req as StaffRequest, res)).catch(next);

export function createPortalStaffRouter(deps: PortalStaffDeps): Router {
  const { store, authMiddleware } = deps;
  const router = Router();

  const authorize = (req: StaffRequest) => {
    const { companyId } = req.params;
    deps.requireCompanyAccess(req, companyId);
    if (!deps.canManagePortal(req, companyId)) {
      throw new HttpError(403, 'You do not have permission to manage portal access.');
    }
    return companyId;
  };

  const loadUser = (companyId: string, id: string): PortalUser => {
    const user = store.portal.getUser(id);
    if (!user || user.companyId !== companyId) throw new HttpError(404, 'Portal user not found.');
    return user;
  };

  const deliver = async (companyId: string, user: PortalUser, token: string) => {
    const inviteLink = deps.inviteLink(user.audience, token);
    const result = await deps.sendInvite({
      to: user.email,
      name: user.name,
      companyName: store.getCompanyById(companyId)?.name ?? '',
      audience: user.audience,
      link: inviteLink,
    });
    return { user, inviteLink, emailSent: result.sent, emailError: result.error };
  };

  router.get('/companies/:companyId/portal-users', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const audience = typeof req.query.audience === 'string'
      ? enumValue(req.query.audience, 'audience', portalAudiences)
      : undefined;
    const contactId = typeof req.query.contactId === 'string' ? req.query.contactId : undefined;
    res.json(store.portal.listUsers(companyId, { audience, contactId }));
  }));

  router.post('/companies/:companyId/portal-users', authMiddleware, wrap(async (req, res) => {
    const companyId = authorize(req);
    const body = asRecord(req.body, 'body');
    const audience = enumValue(body.audience, 'audience', portalAudiences);
    const contactId = requiredString(body.contactId, 'contactId');
    const email = requiredString(body.email, 'email', { min: 3 });
    const name = requiredString(body.name, 'name');

    const contact = store.getContactById(contactId);
    if (!contact || contact.companyId !== companyId) throw new HttpError(404, 'Contact not found.');
    const requiredRole = REQUIRED_CONTACT_ROLE[audience];
    if (!contact.roles?.includes(requiredRole)) {
      throw new HttpError(400, `This contact does not have the ${requiredRole} role.`);
    }

    let role: PortalRole = 'influencer';
    if (audience === 'client') {
      const first = store.portal.listUsers(companyId, { audience, contactId }).length === 0;
      role = body.role === undefined
        ? (first ? 'client_admin' : 'client_member')
        : enumValue(body.role, 'role', rolesForAudience.client);
    }

    const { user, token } = store.portal.inviteUser({
      companyId, audience, contactId, email, name, role, createdByUserId: req.user?.id,
    });
    res.status(201).json(await deliver(companyId, user, token));
  }));

  router.post('/companies/:companyId/portal-users/:id/reinvite', authMiddleware, wrap(async (req, res) => {
    const companyId = authorize(req);
    loadUser(companyId, req.params.id);
    const { user, token } = store.portal.reinvite(req.params.id);
    res.json(await deliver(companyId, user, token));
  }));

  router.post('/companies/:companyId/portal-users/:id/disable', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    loadUser(companyId, req.params.id);
    res.json(store.portal.disableUser(req.params.id));
  }));

  router.post('/companies/:companyId/portal-users/:id/enable', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    loadUser(companyId, req.params.id);
    res.json(store.portal.enableUser(req.params.id));
  }));

  return router;
}
