import type { RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import { asRecord } from '../validation';
import { applyChanges } from './influencer';
import { CHANGE_REVIEW_TRIGGER } from './influencer-routes';
import type { StaffRequest } from './staff-routes';

const MAX_BRIEF = 5000;

const brief = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > MAX_BRIEF) throw new HttpError(400, `A brief is at most ${MAX_BRIEF} characters.`);
  return value.trim() || null;
};

/** Staff side of the influencer portal: briefs and profile change requests. */
export function registerStaffInfluencerRoutes(
  router: Router,
  store: DataStore,
  authMiddleware: RequestHandler,
  authorize: (req: StaffRequest) => string,
  wrap: (fn: (req: StaffRequest, res: Response) => unknown) => RequestHandler,
): void {
  const campaignOf = (companyId: string, id: string) => {
    const campaign = store.getCrmCampaignById(id);
    if (!campaign || campaign.companyId !== companyId) throw new HttpError(404, 'Campaign not found.');
    return campaign;
  };

  router.get('/companies/:companyId/campaigns/:id/portal-brief', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    res.json(store.influencer.campaignBrief(campaignOf(companyId, req.params.id).id));
  }));

  router.put('/companies/:companyId/campaigns/:id/portal-brief', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const campaign = campaignOf(companyId, req.params.id);
    const body = asRecord(req.body, 'body');
    const current = store.influencer.campaignBrief(campaign.id);
    store.influencer.setCampaignBrief(companyId, {
      campaignId: campaign.id,
      influencerBrief: body.influencerBrief === undefined ? current.influencerBrief : brief(body.influencerBrief),
      requireClientApproval: body.requireClientApproval === undefined ? current.requireClientApproval : body.requireClientApproval === true,
    });
    res.json(store.influencer.campaignBrief(campaign.id));
  }));

  router.get('/companies/:companyId/campaign-deliverables/:id/portal-brief', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const deliverable = store.getCampaignDeliverableById(req.params.id);
    if (!deliverable || deliverable.companyId !== companyId) throw new HttpError(404, 'Deliverable not found.');
    res.json({ deliverableId: deliverable.id, brief: store.influencer.deliverableBrief(deliverable.id) });
  }));

  router.put('/companies/:companyId/campaign-deliverables/:id/portal-brief', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const deliverable = store.getCampaignDeliverableById(req.params.id);
    if (!deliverable || deliverable.companyId !== companyId) throw new HttpError(404, 'Deliverable not found.');
    store.influencer.setDeliverableBrief(companyId, deliverable.id, brief(asRecord(req.body, 'body').brief));
    res.json({ deliverableId: deliverable.id, brief: store.influencer.deliverableBrief(deliverable.id) });
  }));

  const contactOf = (companyId: string, id: string) => {
    const contact = store.getContactById(id);
    if (!contact || contact.companyId !== companyId) throw new HttpError(404, 'Contact not found.');
    return contact;
  };

  router.get('/companies/:companyId/contacts/:contactId/change-requests', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const contact = contactOf(companyId, req.params.contactId);
    res.json(store.influencer.changeRequests(companyId, contact.id).map((r) => ({
      ...r,
      requestedBy: store.portal.getUser(r.portalUserId)?.name ?? null,
      reviewedBy: r.reviewedByUserId ? store.getUserById(r.reviewedByUserId)?.name ?? null : null,
    })));
  }));

  const decide = (status: 'approved' | 'rejected') => wrap((req, res) => {
    const companyId = authorize(req);
    const contact = contactOf(companyId, req.params.contactId);
    const request = store.influencer.getChangeRequest(req.params.id);
    if (!request || request.companyId !== companyId || request.contactId !== contact.id) throw new HttpError(404, 'Change request not found.');
    const body = asRecord(req.body ?? {}, 'body');
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : null;
    const userId = req.user!.id;
    const ok = store.transaction(() => {
      if (!store.influencer.decideChangeRequest(request.id, { status, note, userId })) return false;
      if (status === 'approved') applyChanges(store, contact, request.changes);
      store.listFollowupEntities(companyId, { status: 'active', entityType: 'contact', entityId: contact.id })
        .filter((f) => f.sourceTrigger === CHANGE_REVIEW_TRIGGER && f.sourceId === request.id)
        .forEach((f) => store.completeFollowup(f.id, { outcome: 'done', completedByUserId: userId }));
      return true;
    });
    if (!ok) throw new HttpError(409, 'This change request has already been decided.');
    res.json(store.influencer.getChangeRequest(request.id));
  });

  router.post('/companies/:companyId/contacts/:contactId/change-requests/:id/approve', authMiddleware, decide('approved'));
  router.post('/companies/:companyId/contacts/:contactId/change-requests/:id/reject', authMiddleware, decide('rejected'));
}
