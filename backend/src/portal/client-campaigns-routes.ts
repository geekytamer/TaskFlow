import type { Request, RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { CampaignDeliverable, CrmCampaign } from '../types';
import { enumValue } from '../validation';
import { toCampaignDetail, toCampaignSummary } from './campaigns';
import { clientApprovalRequired, clientVisibleUrl } from './review-flow';
import { resultsDto } from '../social/results';
import type { PortalSession } from './portal-store';
import { managerOf, notifyManager, raiseFollowup, type SessionRequest } from './common';
import { reviewDecisions } from './reviews-store';
import { clientAnalytics } from './analytics';



/** Campaigns for the client audience. Reviews advise staff; they never change a deliverable's status. */
export function registerClientCampaignRoutes(
  router: Router,
  store: DataStore,
  companyId: string,
  requireClientSession: RequestHandler,
): void {
  const ownCampaigns = (session: PortalSession) =>
    store.listCrmCampaigns(companyId).filter((c) => c.contactId === session.contactId);

  const loadCampaign = (session: PortalSession, id: string): CrmCampaign => {
    const campaign = store.getCrmCampaignById(id);
    const mine = campaign && campaign.companyId === companyId && campaign.contactId === session.contactId && !campaign.archivedAt;
    if (!campaign || !mine) throw new HttpError(404, 'Not found.');
    return campaign;
  };

  const visibleDeliverables = (campaignId: string): CampaignDeliverable[] =>
    store.listCampaignDeliverables(campaignId).filter((d) => d.status !== 'Cancelled');

  const detail = (campaign: CrmCampaign) => toCampaignDetail({
    campaign,
    assignments: store.listCampaignAssignments(campaign.id).map((assignment) => ({
      assignment,
      contact: store.getContactById(assignment.contactId),
    })),
    deliverables: visibleDeliverables(campaign.id).map((deliverable) => {
      const url = clientVisibleUrl(store, deliverable);
      const review = url ? store.reviews.clientReviewOf(deliverable.id, url) : undefined;
      const influencerId = deliverable.vendorContactId ?? deliverable.contactId;
      return {
        deliverable,
        url,
        influencer: influencerId ? store.getContactById(influencerId) : undefined,
        review,
        reviewerName: review?.portalUserId ? store.portal.getUser(review.portalUserId)?.name : undefined,
        results: resultsDto(store, deliverable.id),
      };
    }),
  });

  router.get('/client/campaigns', requireClientSession, (req: SessionRequest, res: Response) => {
    res.json(ownCampaigns(req.portal!).map((campaign) => {
      const deliverables = visibleDeliverables(campaign.id);
      const awaiting = deliverables.filter((d) => {
        const url = clientVisibleUrl(store, d);
        return d.status === 'Submitted' && url !== null && !store.reviews.clientReviewOf(d.id, url);
      }).length;
      return toCampaignSummary(campaign, deliverables, awaiting);
    }));
  });

  router.get('/client/analytics', requireClientSession, (req: SessionRequest, res: Response) => {
    res.json(clientAnalytics(store, companyId, req.portal!.contactId, req.query));
  });

  router.get('/client/campaigns/:id', requireClientSession, (req: SessionRequest, res: Response) => {
    res.json(detail(loadCampaign(req.portal!, req.params.id)));
  });

  router.post('/client/campaigns/:id/deliverables/:deliverableId/review', requireClientSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const campaign = loadCampaign(session, req.params.id);
    const deliverable = store.getCampaignDeliverableById(req.params.deliverableId);
    if (!deliverable || deliverable.campaignId !== campaign.id || deliverable.status === 'Cancelled') {
      throw new HttpError(404, 'Not found.');
    }
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const decision = enumValue(body.decision, 'decision', reviewDecisions);
    const comment = typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim().slice(0, 2000) : null;
    if (decision === 'changes_requested' && (!comment || comment.length < 3)) {
      throw new HttpError(400, 'Say what should change.');
    }

    const url = clientVisibleUrl(store, deliverable);
    if (deliverable.status !== 'Submitted' || !url) throw new HttpError(409, 'There is nothing to review on this item yet.');
    // When the campaign requires the client's approval, it is the last step: it
    // completes staff-approved influencer work. Otherwise a review only advises staff.
    const completes = decision === 'approved' && clientApprovalRequired(store, campaign.id)
      && store.influencer.latestSubmission(deliverable.id)?.staffDecision === 'approved';

    const client = store.getContactById(session.contactId);
    const clientName = client?.name ?? session.name;
    const ownerId = client ? managerOf(store, session, client, campaign.ownerUserId) : campaign.ownerUserId ?? store.portal.inviterOf(session.portalUserId);

    const saved = store.transaction(() => {
      const review = store.reviews.addClientReview({
        companyId, deliverableId: deliverable.id, contentUrl: url, portalUserId: session.portalUserId, decision, comment,
      });
      if (!review) return undefined;
      if (completes) store.updateCampaignDeliverable(deliverable.id, { status: 'Approved' });
      const title = decision === 'approved'
        ? `${clientName} approved "${deliverable.title}"`
        : `${clientName} asked for changes on "${deliverable.title}"`;
      if (decision === 'changes_requested') {
        raiseFollowup(store, {
          companyId,
          entityType: campaign.opportunityId ? 'opportunity' : 'contact',
          entityId: campaign.opportunityId ?? session.contactId,
          title, priority: 'high', ownerUserId: ownerId, dueDays: 1,
          notes: `${session.name} (${campaign.name}): ${comment}`,
          sourceTrigger: 'portal_deliverable_review', sourceType: 'deliverable_review', sourceId: review.id,
        });
      }
      notifyManager(store, { companyId, managerId: ownerId, title, body: comment ?? undefined, link: '/crm/campaigns', entityType: 'campaign', entityId: campaign.id });
      return review;
    });
    if (!saved) throw new HttpError(409, 'This version has already been reviewed.');

    const view = detail(campaign).deliverables.find((d) => d.id === deliverable.id);
    res.json(view);
  });
}
