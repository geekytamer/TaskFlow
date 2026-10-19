import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { MaskEntity } from '../authz/mask';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { Contact, SanitizedUser } from '../types';
import { asRecord, enumValue, requiredString } from '../validation';
import { pricingModes } from './catalogue-store';
import { downloadHeaders, readUpload } from './files';
import { registerStaffReferralRoutes } from './staff-referral-routes';
import { registerStaffRequestRoutes } from './staff-request-routes';
import { registerStaffInfluencerRoutes } from './staff-influencer-routes';
import { fileDto } from './thread';
import type { PortalFileMeta } from './thread-store';
import { canSeeContact, canSeeMessage, type StaffViewer } from '../conversations/visibility';
import type { PortalInviteSender } from './portal-email';
import { portalAudiences, rolesForAudience, type PortalAudience, type PortalRole, type PortalUser } from './portal-store';

export type StaffRequest = Request & { user?: SanitizedUser };

export interface PortalStaffDeps {
  store: DataStore;
  authMiddleware: RequestHandler;
  requireCompanyAccess(req: StaffRequest, companyId: string): void;
  canManagePortal(req: StaffRequest, companyId: string): boolean;
  /** Whether the request user may read private contacts of others (CONTACTS_PRIVATE_READ). */
  /** Whether this staff member may see a contact (authz/visible.ts, inbox rule). */
  seesContact(req: StaffRequest, contact: Pick<Contact, 'id' | 'companyId'>): boolean;
  inviteLink(audience: PortalAudience, token: string): string;
  sendInvite: PortalInviteSender;
  /** A row without the sensitive properties the person may not see (authz/mask.ts). */
  maskFor<T>(req: StaffRequest, companyId: string, entity: MaskEntity, row: T): T;
  /** 403 { permission: 'field:<key>' } when a write changes a sensitive field the person may not edit. */
  requireFieldEdits(req: StaffRequest, companyId: string, entity: MaskEntity, body: Record<string, unknown>, existing?: object | null): void;
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
      throw new HttpError(403, 'You do not have permission to manage portal access.', { code: 'FORBIDDEN', permission: 'portal.manage_access' });
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

  // Shown influencers (everyone with the role unless hidden).
  router.get('/companies/:companyId/portal-catalogue', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const hidden = store.catalogue.hiddenIds(companyId);
    res.json(store.listContacts(companyId, 'Influencer').map((c) => c.id).filter((id) => !hidden.has(id)));
  }));

  router.put('/companies/:companyId/portal-catalogue/:contactId', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const contact = loadContact(companyId, req.params.contactId, 'Influencer');
    store.catalogue.list(companyId, contact.id);
    res.json({ contactId: contact.id, listed: true });
  }));

  router.delete('/companies/:companyId/portal-catalogue/:contactId', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    store.catalogue.unlist(companyId, req.params.contactId, req.user?.id);
    res.json({ contactId: req.params.contactId, listed: false });
  }));

  // How far below and above the client's price an influencer's range goes.
  router.get('/companies/:companyId/portal-price-range/:contactId', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const contact = loadContact(companyId, req.params.contactId, 'Influencer');
    // The range around an influencer's rate is the rate_cards field.
    res.json(deps.maskFor(req, companyId, 'price_range', store.catalogue.priceRange(contact.id)));
  }));

  router.put('/companies/:companyId/portal-price-range/:contactId', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const contact = loadContact(companyId, req.params.contactId, 'Influencer');
    const body = asRecord(req.body, 'body');
    deps.requireFieldEdits(req, companyId, 'price_range', body, store.catalogue.priceRange(contact.id));
    const percent = (value: unknown, field: string, max: number) => {
      const n = Number(value);
      if (value === null || value === '' || !Number.isFinite(n) || n < 0 || n > max) throw new HttpError(400, `${field} must be between 0 and ${max}.`);
      return n;
    };
    res.json(deps.maskFor(req, companyId, 'price_range', store.catalogue.setPriceRange({
      companyId, contactId: contact.id,
      belowPercent: percent(body.belowPercent, 'belowPercent', 90),
      abovePercent: percent(body.abovePercent, 'abovePercent', 300),
      updatedByUserId: req.user?.id,
    })));
  }));

  router.get('/companies/:companyId/pricing-profiles/:contactId', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const contact = loadContact(companyId, req.params.contactId, 'Client');
    // A client's pricing terms are the client_terms field.
    res.json(deps.maskFor(req, companyId, 'pricing_profile', store.catalogue.getPricingProfile(contact.id) ?? null));
  }));

  router.put('/companies/:companyId/pricing-profiles/:contactId', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const contact = loadContact(companyId, req.params.contactId, 'Client');
    const body = asRecord(req.body, 'body');
    deps.requireFieldEdits(req, companyId, 'pricing_profile', body, store.catalogue.getPricingProfile(contact.id) ?? {});
    const mode = enumValue(body.mode, 'mode', pricingModes);
    let markupPercent: number | null = null;
    if (mode === 'markup') {
      const value = Number(body.markupPercent);
      if (body.markupPercent === undefined || body.markupPercent === null || !Number.isFinite(value) || value < 0 || value > 500) {
        throw new HttpError(400, 'markupPercent must be a number from 0 to 500.');
      }
      markupPercent = value;
    }
    res.json(deps.maskFor(req, companyId, 'pricing_profile', store.catalogue.setPricingProfile({
      contactId: contact.id, companyId, mode, markupPercent, updatedByUserId: req.user?.id,
    })));
  }));

  /** A contact of this company that can have a portal thread. */
  const threadContact = (companyId: string, contactId: string) => {
    const contact = store.getContactById(contactId);
    if (!contact || contact.companyId !== companyId) throw new HttpError(404, 'Contact not found.');
    return contact;
  };

  router.post('/companies/:companyId/contacts/:contactId/files', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const contact = threadContact(companyId, req.params.contactId);
    const upload = readUpload(asRecord(req.body, 'body'));
    const file = store.thread.addFile({
      companyId, contactId: contact.id, uploader: { kind: 'staff', userId: req.user!.id },
      fileName: upload.fileName, mimeType: upload.type, content: upload.content,
    });
    res.status(201).json(fileDto(file));
  }));

  /** A conversation message's file follows that message: its contact must be visible, and owner_private stays its author's. */
  const messageFileVisible = (req: StaffRequest, file: PortalFileMeta): boolean => {
    if (file.parentType !== 'message' || !file.parentId) return true;
    const message = store.conversations.getMessage(file.parentId);
    // Fails closed: a message that is gone can no longer prove who may see it.
    if (!message) return false;
    const thread = store.conversations.getThread(message.threadId);
    const contact = thread ? store.getContactById(thread.contactId) : undefined;
    if (!thread || !contact || thread.companyId !== file.companyId) return false;
    const viewer: StaffViewer = { kind: 'staff', userId: req.user!.id, sees: (c) => deps.seesContact(req, c) };
    return canSeeContact(contact, viewer) && canSeeMessage(message, viewer);
  };

  router.get('/companies/:companyId/portal-files/:id/content', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const file = store.thread.getFile(req.params.id);
    if (!file || file.companyId !== companyId || !messageFileVisible(req, file)) throw new HttpError(404, 'File not found.');
    res.set(downloadHeaders(file)).send(store.thread.fileContent(file.id));
  }));

  registerStaffReferralRoutes(router, store, authMiddleware, authorize, wrap);
  registerStaffRequestRoutes(router, store, authMiddleware, authorize, wrap);
  registerStaffInfluencerRoutes(router, store, authMiddleware, authorize, wrap, deps);

  return router;
}
