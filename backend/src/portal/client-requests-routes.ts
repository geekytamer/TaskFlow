import type { Request, RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { Contact, CrmProposal } from '../types';
import { asRecord } from '../validation';
import {
  briefForStaff,
  CLIENT_VISIBLE_PROPOSALS,
  clientProposalStatus,
  parseBrief,
  requestStatus,
  toProposalDto,
  toRequestDto,
} from './requests';
import type { CampaignRequestRecord } from './requests-store';
import type { PortalSession } from './portal-store';

type SessionRequest = Request & { portal?: PortalSession };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Campaign requests and proposals for the client audience. Every write goes
 * through the store methods staff use (createOpportunity, createFollowup,
 * updateCrmProposalStatus), so a portal action has exactly the CRM side effects
 * the same action has inside TaskFlow.
 */
export function registerClientRequestRoutes(
  router: Router,
  store: DataStore,
  companyId: string,
  requireClientSession: RequestHandler,
): void {
  const currency = () => store.getCompanyFinanceSettings(companyId).currencyCode;
  const clientContact = (session: PortalSession): Contact => {
    const contact = store.getContactById(session.contactId);
    if (!contact) throw new HttpError(404, 'Not found.');
    return contact;
  };

  /** The staff member who should hear about this client: the account owner, else whoever invited them. */
  const accountManagerOf = (session: PortalSession, contact: Contact) => {
    const userId = contact.ownerUserId ?? store.portal.inviterOf(session.portalUserId);
    return userId ? { userId, name: store.getUserById(userId)?.name } : undefined;
  };

  const actorFor = (session: PortalSession, contact: Contact) => ({ name: `Portal: ${session.name} (${contact.name})` });

  /** A proposal this client may see, or undefined. */
  const visibleProposal = (session: PortalSession, proposalId: string): CrmProposal | undefined => {
    const proposal = store.getCrmProposalById(proposalId);
    if (!proposal) return undefined;
    const mine = proposal.companyId === companyId && proposal.contactId === session.contactId;
    return mine && CLIENT_VISIBLE_PROPOSALS.includes(proposal.status) ? proposal : undefined;
  };

  const proposalsOf = (session: PortalSession, opportunityId?: string): CrmProposal[] =>
    store.listCrmProposals(companyId)
      .filter((p) => p.contactId === session.contactId && CLIENT_VISIBLE_PROPOSALS.includes(p.status))
      .filter((p) => opportunityId === undefined || p.opportunityId === opportunityId)
      .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());

  const proposalDto = (proposal: CrmProposal) => {
    const response = store.requests.responseFor(proposal.id);
    const responder = response ? store.portal.getUser(response.portalUserId)?.name : undefined;
    return toProposalDto(proposal, currency(), response, responder);
  };

  const requestDto = (session: PortalSession, record: CampaignRequestRecord) => {
    const proposals = proposalsOf(session, record.opportunityId);
    const influencers = record.influencerIds
      .map((id) => store.getContactById(id))
      .filter((c): c is Contact => Boolean(c))
      .map((c) => ({ id: c.id, name: c.name }));
    return toRequestDto(record, {
      currency: currency(),
      influencers,
      status: requestStatus(proposals, store.getOpportunityById(record.opportunityId)?.stage),
      proposals: proposals.map((p) => ({ id: p.id, number: p.proposalNumber, title: p.title, status: clientProposalStatus(p) })),
    });
  };

  const loadRequest = (session: PortalSession, id: string) => {
    const record = store.requests.get(id);
    if (!record || record.companyId !== companyId || record.contactId !== session.contactId) {
      throw new HttpError(404, 'Not found.');
    }
    return record;
  };

  router.get('/client/requests', requireClientSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    res.json(store.requests.listFor(companyId, session.contactId).map((r) => requestDto(session, r)));
  });

  router.get('/client/requests/:id', requireClientSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    res.json(requestDto(session, loadRequest(session, req.params.id)));
  });

  router.post('/client/requests', requireClientSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const contact = clientContact(session);
    const brief = parseBrief(asRecord(req.body, 'body'));

    const shortlist = brief.influencerIds.map((id) => {
      const influencer = store.getContactById(id);
      const requestable = influencer
        && influencer.companyId === companyId
        && influencer.roles?.includes('Influencer')
        && store.catalogue.isListed(companyId, influencer.id);
      if (!influencer || !requestable) throw new HttpError(400, 'One of the chosen influencers is not available.');
      const handle = influencer.influencerAccounts?.find((a) => a.handle)?.handle ?? influencer.influencerHandle ?? null;
      return { id: influencer.id, name: influencer.name, handle };
    });

    const manager = accountManagerOf(session, contact);
    const record = store.transaction(() => store.runAsActor(actorFor(session, contact), () => {
      const opportunity = store.createOpportunity({
        companyId,
        contactId: contact.id,
        ownerUserId: manager?.userId,
        ownerName: manager?.name,
        title: `Portal request: ${brief.title}`,
        serviceType: 'Influencer campaign',
        stage: 'New',
        expectedRevenue: brief.budget ?? 0,
        probability: 0,
        notes: briefForStaff({ brief, requesterName: session.name, requesterEmail: session.email, currency: currency(), shortlist }),
      });
      const created = store.requests.create({
        companyId,
        contactId: contact.id,
        portalUserId: session.portalUserId,
        title: brief.title,
        objective: brief.objective,
        budget: brief.budget,
        startDate: brief.startDate,
        endDate: brief.endDate,
        platforms: brief.platforms,
        influencerIds: shortlist.map((s) => s.id),
        opportunityId: opportunity.id,
      });
      const followup = store.createFollowup({
        companyId,
        entityType: 'opportunity',
        entityId: opportunity.id,
        title: `New campaign request from ${contact.name}`,
        channel: 'Task',
        priority: 'high',
        ownerUserId: manager?.userId,
        ownerName: manager?.name,
        dueAt: new Date(Date.now() + DAY_MS),
        notes: brief.title,
        sourceTrigger: 'portal_request',
        sourceType: 'portal_campaign_request',
        sourceId: created.id,
      });
      if (manager) {
        store.notify({
          companyId,
          userIds: [manager.userId],
          type: 'followup_assigned',
          title: `New campaign request from ${contact.name}`,
          body: brief.title,
          data: { tKey: 'notif.followupAssigned.t', name: `${contact.name}: ${brief.title}` },
          link: '/crm/followups',
          entityType: 'follow_up',
          entityId: followup.id,
        });
      }
      return created;
    }));
    res.status(201).json(requestDto(session, record));
  });

  router.get('/client/proposals', requireClientSession, (req: SessionRequest, res: Response) => {
    res.json(proposalsOf(req.portal!).map(proposalDto));
  });

  router.get('/client/proposals/:id', requireClientSession, (req: SessionRequest, res: Response) => {
    const proposal = visibleProposal(req.portal!, req.params.id);
    if (!proposal) throw new HttpError(404, 'Not found.');
    res.json(proposalDto(proposal));
  });

  const respond = (decision: 'accepted' | 'declined') => (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const proposal = visibleProposal(session, req.params.id);
    if (!proposal) throw new HttpError(404, 'Not found.');
    const status = clientProposalStatus(proposal);
    if (status === 'expired') throw new HttpError(409, 'This proposal has expired. Ask your account manager for an updated one.');
    if (status !== 'sent') throw new HttpError(409, 'This proposal has already been answered.');

    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 2000) : null;
    const contact = clientContact(session);
    const manager = accountManagerOf(session, contact);
    const verb = decision === 'accepted' ? 'accepted' : 'declined';

    store.transaction(() => store.runAsActor(actorFor(session, contact), () => {
      store.updateCrmProposalStatus(proposal.id, decision === 'accepted' ? 'Accepted' : 'Declined');
      store.requests.recordResponse({ proposalId: proposal.id, portalUserId: session.portalUserId, decision, reason });
      const title = `${contact.name} ${verb} proposal ${proposal.proposalNumber}`;

      // Winning the opportunity already schedules the CRM's own kickoff follow-up,
      // so an acceptance only notifies. Losing it schedules nothing, so a decline
      // gets a follow-up carrying the client's reason.
      let followupId: string | undefined;
      if (decision === 'declined') {
        followupId = store.createFollowup({
          companyId,
          entityType: 'opportunity',
          entityId: proposal.opportunityId,
          title,
          channel: 'Task',
          priority: 'high',
          ownerUserId: manager?.userId,
          ownerName: manager?.name,
          dueAt: new Date(Date.now() + DAY_MS),
          notes: `Declined by ${session.name} in the client portal.${reason ? ` Reason: ${reason}` : ''}`,
          sourceTrigger: 'portal_proposal_response',
          sourceType: 'crm_proposal',
          sourceId: proposal.id,
        }).id;
      }
      if (manager) {
        store.notify({
          companyId,
          userIds: [manager.userId],
          type: 'followup_assigned',
          title,
          body: reason ?? undefined,
          data: { tKey: 'notif.followupAssigned.t', name: title },
          link: '/crm/followups',
          entityType: followupId ? 'follow_up' : 'opportunity',
          entityId: followupId ?? proposal.opportunityId,
        });
      }
    }));
    res.json(proposalDto(store.getCrmProposalById(proposal.id)!));
  };

  router.post('/client/proposals/:id/accept', requireClientSession, respond('accepted'));
  router.post('/client/proposals/:id/decline', requireClientSession, respond('declined'));
}
