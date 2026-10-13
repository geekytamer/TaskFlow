import type { RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import { asRecord } from '../validation';
import { CLIENT_VISIBLE_PROPOSALS, clientProposalStatus, requestStatus } from './requests';
import type { CampaignRequestRecord } from './requests-store';
import type { StaffRequest } from './staff-routes';
import { fileDto } from './thread';
import { companyCurrency } from './common';

/**
 * The staff side of client portal requests: one place to read each brief as
 * the client wrote it, with the shortlist linked, the files downloadable, the
 * proposals it led to, and a way to close it with a reason the client reads.
 */
export function registerStaffRequestRoutes(
  router: Router,
  store: DataStore,
  authMiddleware: RequestHandler,
  authorize: (req: StaffRequest) => string,
  wrap: (fn: (req: StaffRequest, res: Response) => unknown) => RequestHandler,
): void {
  const load = (companyId: string, id: string): CampaignRequestRecord => {
    const record = store.requests.get(id);
    if (!record || record.companyId !== companyId) throw new HttpError(404, 'Request not found.');
    return record;
  };

  const view = (record: CampaignRequestRecord, detailed: boolean) => {
    const client = store.getContactById(record.contactId);
    const requester = store.portal.getUser(record.portalUserId);
    const opportunity = store.getOpportunityById(record.opportunityId);
    const proposals = store.listCrmProposals(record.companyId).filter((p) => p.opportunityId === record.opportunityId);
    const clientVisible = proposals.filter((p) => CLIENT_VISIBLE_PROPOSALS.includes(p.status));
    const shortlist = record.influencerIds.map((id) => {
      const contact = store.getContactById(id);
      if (contact) return { id, name: contact.name, onRoster: true, handle: contact.influencerAccounts?.find((a) => a.handle)?.handle ?? contact.influencerHandle ?? null };
      const profile = store.discover.get(id);
      return profile ? { id, name: profile.fullName || `@${profile.username}`, onRoster: false, handle: `@${profile.username}` } : null;
    }).filter((x): x is NonNullable<typeof x> => x !== null);
    const base = {
      id: record.id,
      title: record.title,
      client: client ? { id: client.id, name: client.name } : null,
      requester: requester ? { name: requester.name, email: requester.email } : null,
      createdAt: record.createdAt,
      budget: record.budget,
      currency: companyCurrency(store, record.companyId),
      startDate: record.startDate,
      endDate: record.endDate,
      platforms: record.platforms,
      shortlist,
      status: requestStatus(clientVisible, opportunity?.stage, new Date(), Boolean(record.closedAt)),
      opportunity: opportunity ? { id: opportunity.id, stage: opportunity.stage, ownerName: opportunity.ownerName ?? null } : null,
      proposalCount: proposals.length,
      fileCount: store.thread.filesOf('request', record.id).length,
      closedReason: record.closedReason ?? null,
      closedAt: record.closedAt ?? null,
    };
    if (!detailed) return base;
    return {
      ...base,
      objective: record.objective,
      files: store.thread.filesOf('request', record.id).map(fileDto),
      proposals: proposals.map((p) => ({
        id: p.id, number: p.proposalNumber, title: p.title, staffStatus: p.status,
        clientStatus: CLIENT_VISIBLE_PROPOSALS.includes(p.status) ? clientProposalStatus(p) : null,
      })),
    };
  };

  router.get('/companies/:companyId/portal-requests', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    res.json(store.requests.listAll(companyId).map((r) => view(r, false)));
  }));

  router.get('/companies/:companyId/portal-requests/:id', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    res.json(view(load(companyId, req.params.id), true));
  }));

  /** "We can't take this on": the client sees the request as closed, with this reason. */
  router.post('/companies/:companyId/portal-requests/:id/close', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const record = load(companyId, req.params.id);
    const body = asRecord(req.body, 'body');
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3 || reason.length > 1000) throw new HttpError(400, 'Give the client a short reason (3 to 1000 characters).');
    store.transaction(() => {
      store.requests.close(record.id, reason, req.user?.id ?? null);
      const opportunity = store.getOpportunityById(record.opportunityId);
      if (opportunity && opportunity.stage !== 'Won') store.updateOpportunity(opportunity.id, { stage: 'Lost' });
    });
    // The client hears about it through the portal alerts sweep (event 'request').
    res.json(view(load(companyId, record.id), true));
  }));

  router.post('/companies/:companyId/portal-requests/:id/reopen', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const record = load(companyId, req.params.id);
    store.transaction(() => {
      store.requests.reopen(record.id);
      const opportunity = store.getOpportunityById(record.opportunityId);
      if (opportunity?.stage === 'Lost') store.updateOpportunity(opportunity.id, { stage: 'New' });
    });
    res.json(view(load(companyId, record.id), true));
  }));
}
