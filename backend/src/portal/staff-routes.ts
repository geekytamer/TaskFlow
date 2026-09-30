import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { SanitizedUser } from '../types';
import { asRecord, enumValue, requiredString } from '../validation';
import { pricingModes } from './catalogue-store';
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

  /** A contact of this company holding `role`, or 404 / 400 saying which way it fails. */
  const loadContact = (companyId: string, contactId: string, role: 'Client' | 'Influencer') => {
    const contact = store.getContactById(contactId);
    if (!contact || contact.companyId !== companyId) throw new HttpError(404, 'Contact not found.');
    if (!contact.roles?.includes(role)) throw new HttpError(400, `This contact does not have the ${role} role.`);
    return contact;
  };

  router.get('/companies/:companyId/portal-catalogue', authMiddleware, wrap((req, res) => {
    res.json(store.catalogue.listedIds(authorize(req)));
  }));

  router.put('/companies/:companyId/portal-catalogue/:contactId', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const contact = loadContact(companyId, req.params.contactId, 'Influencer');
    store.catalogue.list(companyId, contact.id, req.user?.id);
    res.json({ contactId: contact.id, listed: true });
  }));

  router.delete('/companies/:companyId/portal-catalogue/:contactId', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    store.catalogue.unlist(companyId, req.params.contactId);
    res.json({ contactId: req.params.contactId, listed: false });
  }));

  router.get('/companies/:companyId/pricing-profiles/:contactId', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const contact = loadContact(companyId, req.params.contactId, 'Client');
    res.json(store.catalogue.getPricingProfile(contact.id) ?? null);
  }));

  router.put('/companies/:companyId/pricing-profiles/:contactId', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const contact = loadContact(companyId, req.params.contactId, 'Client');
    const body = asRecord(req.body, 'body');
    const mode = enumValue(body.mode, 'mode', pricingModes);
    let markupPercent: number | null = null;
    if (mode === 'markup') {
      const value = Number(body.markupPercent);
      if (body.markupPercent === undefined || body.markupPercent === null || !Number.isFinite(value) || value < 0 || value > 500) {
        throw new HttpError(400, 'markupPercent must be a number from 0 to 500.');
      }
      markupPercent = value;
    }
    res.json(store.catalogue.setPricingProfile({
      contactId: contact.id, companyId, mode, markupPercent, updatedByUserId: req.user?.id,
    }));
  }));

  return router;
}
