import type { RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import { asRecord } from '../validation';
import { FlexiError, type FlexiBalance, type FlexiState } from '../finance/flexi';
import type { CampaignRequestRecord } from './requests-store';
import type { StaffRequest } from './staff-routes';
import type { PortalUser } from './portal-store';
import { companyCurrency } from './common';

const STALE_MS = 2 * 86_400_000;
const NEAR_LIMIT = 0.8;
const STATES: FlexiState[] = ['active', 'frozen', 'closed'];

/**
 * The Peak Flexi section in TaskFlow: overview, accounts and their controls,
 * campaign requests against the balance, website leads, and settings.
 * `authorize` needs FLEXI_REVIEW; `authorizeManage` needs FLEXI_MANAGE.
 */
export function registerStaffFlexiSectionRoutes(
  router: Router,
  store: DataStore,
  deps: {
    authMiddleware: RequestHandler;
    authorize: (req: StaffRequest) => string;
    authorizeManage: (req: StaffRequest) => string;
    wrap: (fn: (req: StaffRequest, res: Response) => unknown) => RequestHandler;
    deliver: (companyId: string, user: PortalUser, token: string) => Promise<{ emailSent: boolean; emailError?: string; inviteLink: string }>;
  },
): void {
  const { authMiddleware, authorize, authorizeManage, wrap } = deps;

  const guard = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (error) {
      if (error instanceof FlexiError) throw new HttpError(error.status, error.message);
      throw error;
    }
  };

  const accountDto = (contactId: string, balance: FlexiBalance = store.flexi.balanceOf(contactId)) => ({
    contactId,
    name: store.getContactById(contactId)?.name ?? '',
    currency: companyCurrency(store, store.getContactById(contactId)?.companyId ?? ''),
    balance: balance.balance,
    used: balance.used,
    available: balance.available,
    usedPct: balance.balance > 0 ? Math.round((balance.used / balance.balance) * 1000) / 10 : 0,
    upfrontPct: balance.upfrontPct,
    maxMonths: balance.maxMonths,
    state: balance.state,
    since: store.flexi.since(contactId),
  });

  const accounts = (companyId: string) => store.flexi.accountContactIds(companyId).map((id) => accountDto(id));

  /** A campaign request as the section sees it: against the client's balance. */
  const requestDto = (companyId: string, r: CampaignRequestRecord) => {
    const balance = store.flexi.balanceOf(r.contactId);
    const hasAccount = balance.enabled;
    const flag = r.payWith === 'flexi' && !hasAccount ? 'no_account' as const
      : hasAccount && r.budget !== null && r.budget > balance.available ? 'over_budget' as const
        : null;
    return {
      id: r.id, contactId: r.contactId, clientName: store.getContactById(r.contactId)?.name ?? '', title: r.title, budget: r.budget,
      payWith: r.payWith, currency: companyCurrency(store, companyId), available: balance.available, accountState: balance.state, flag, createdAt: r.createdAt, closed: !!r.closedAt,
    };
  };

  const flexiRequests = (companyId: string) => store.requests.listAll(companyId)
    .filter((r) => !r.closedAt && (r.payWith === 'flexi' || store.flexi.balanceOf(r.contactId).enabled))
    .map((r) => requestDto(companyId, r));

  const loadContact = (companyId: string, contactId: string) => {
    const contact = store.getContactById(contactId);
    if (!contact || contact.companyId !== companyId) throw new HttpError(404, 'Contact not found.');
    return contact;
  };

  // ─── Overview ───────────────────────────────────────────────────────

  router.get('/companies/:companyId/flexi/overview', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const list = accounts(companyId);
    const live = list.filter((a) => a.state === 'active' || a.state === 'frozen');
    const sum = (key: 'balance' | 'used' | 'available') => Math.round(live.reduce((n, a) => n + a[key], 0) * 1000) / 1000;
    const waiting = store.flexi.list(companyId, { status: 'new' });
    const now = Date.now();
    res.json({
      currency: companyCurrency(store, companyId),
      totals: {
        balance: sum('balance'), used: sum('used'), available: sum('available'),
        active: list.filter((a) => a.state === 'active').length, frozen: list.filter((a) => a.state === 'frozen').length, waiting: waiting.length,
      },
      alerts: {
        staleApplications: waiting.filter((a) => now - Date.parse(a.createdAt) > STALE_MS)
          .map((a) => ({ id: a.id, contactId: a.contactId, contactName: store.getContactById(a.contactId)?.name ?? '', kind: a.kind, createdAt: a.createdAt })),
        nearLimit: list.filter((a) => a.state === 'active' && a.balance > 0 && a.used / a.balance >= NEAR_LIMIT),
        frozen: list.filter((a) => a.state === 'frozen'),
        overBudgetRequests: flexiRequests(companyId).filter((r) => r.flag === 'over_budget'),
      },
    });
  }));

  // ─── Accounts ───────────────────────────────────────────────────────

  router.get('/companies/:companyId/flexi/accounts', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    if (state && !STATES.includes(state as FlexiState)) throw new HttpError(400, 'Unknown state.');
    res.json(accounts(companyId).filter((a) => !state || a.state === state));
  }));

  router.get('/companies/:companyId/flexi/accounts/:contactId', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const contact = loadContact(companyId, req.params.contactId);
    const balance = store.flexi.balanceOf(contact.id);
    const openInvoices = balance.clientId
      ? store.listInvoices(companyId)
        .filter((i) => i.clientId === balance.clientId && i.status !== 'Draft' && (i.outstandingAmount ?? 0) > 0)
        .map((i) => ({ id: i.id, number: i.invoiceNumber, outstanding: i.outstandingAmount ?? 0, dueDate: i.dueDate }))
      : [];
    res.json({
      account: accountDto(contact.id, balance),
      currency: companyCurrency(store, companyId),
      events: store.flexi.events(contact.id),
      applications: store.flexi.list(companyId, { contactId: contact.id }),
      openInvoices,
      requests: store.requests.listFor(companyId, contact.id).map((r) => requestDto(companyId, r)),
    });
  }));

  for (const action of ['adjust', 'freeze', 'unfreeze', 'close'] as const) {
    router.post(`/companies/:companyId/flexi/accounts/:contactId/${action}`, authMiddleware, wrap((req, res) => {
      const companyId = authorizeManage(req);
      const contact = loadContact(companyId, req.params.contactId);
      const body = asRecord(req.body ?? {}, 'body');
      const userId = req.user!.id;
      const balance = guard(() => action === 'adjust'
        ? store.flexi.adjust(contact.id, { amount: body.amount, upfrontPct: body.upfrontPct, maxMonths: body.maxMonths, reason: body.reason, userId })
        : store.flexi[action](contact.id, { reason: body.reason, userId }));
      res.json(accountDto(contact.id, balance));
    }));
  }

  // ─── Campaign requests ──────────────────────────────────────────────

  router.get('/companies/:companyId/flexi/requests', authMiddleware, wrap((req, res) => {
    res.json(flexiRequests(authorize(req)));
  }));

  // ─── Website leads ──────────────────────────────────────────────────

  /** Reads a "Label: value" line the /join page wrote into the contact notes. */
  const noteLine = (notes: string | undefined, label: string) =>
    notes?.split('\n').find((l) => l.startsWith(`${label}: `))?.slice(label.length + 2).trim() ?? null;

  const isLead = (companyId: string, contact: { id: string; tags?: string[] }) =>
    (contact.tags ?? []).includes('peak-flexi') && store.portal.listUsers(companyId, { contactId: contact.id }).length === 0;

  router.get('/companies/:companyId/flexi/leads', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    res.json(store.listContacts(companyId)
      .filter((c) => isLead(companyId, c))
      .map((c) => ({
        contactId: c.id, company: c.name, person: c.contactPerson ?? null, phone: c.phone ?? null, email: c.email || null,
        crNumber: noteLine(c.notes, 'Commercial registration'), services: noteLine(c.notes, 'Services wanted'), role: noteLine(c.notes, 'Role'),
        createdAt: c.createdAt,
      }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
  }));

  router.post('/companies/:companyId/flexi/leads/:contactId/invite', authMiddleware, wrap(async (req, res) => {
    const companyId = authorizeManage(req);
    const contact = loadContact(companyId, req.params.contactId);
    if (!isLead(companyId, contact)) throw new HttpError(409, 'This lead already has a portal account.');
    const email = contact.email?.trim();
    if (!email) throw new HttpError(400, 'This lead left no email. Add one on the contact first.');
    const { user, token } = store.transaction(() => {
      if (!(contact.roles ?? []).includes('Client')) store.addContactRole(contact.id, companyId, 'Client');
      return store.portal.inviteUser({
        companyId, audience: 'client', contactId: contact.id, email, name: contact.contactPerson || contact.name,
        role: 'client_admin', createdByUserId: req.user!.id,
      });
    });
    const delivered = await deps.deliver(companyId, user, token);
    res.status(201).json({ userId: user.id, emailSent: delivered.emailSent, inviteLink: delivered.inviteLink });
  }));

  // ─── Settings ───────────────────────────────────────────────────────

  router.get('/companies/:companyId/flexi/settings', authMiddleware, wrap((req, res) => {
    res.json(store.flexi.settings(authorize(req)));
  }));

  router.put('/companies/:companyId/flexi/settings', authMiddleware, wrap((req, res) => {
    const companyId = authorizeManage(req);
    res.json(guard(() => store.flexi.saveSettings(companyId, asRecord(req.body, 'body') as never, req.user!.id)));
  }));
}
