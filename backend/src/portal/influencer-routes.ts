import type { Request, RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { Contact } from '../types';
import { asRecord, enumValue } from '../validation';
import { AVAILABILITY, isVisibleAssignment, paidContactOf, parseChanges, submissionDto, toAssignmentDto, toProfileDto } from './influencer';
import { safeUrl } from './catalogue';
import type { PortalSession } from './portal-store';

type SessionRequest = Request & { portal?: PortalSession };

const DAY_MS = 24 * 60 * 60 * 1000;
export const CHANGE_REVIEW_TRIGGER = 'portal_profile_change';
export const SUBMISSION_REVIEW_TRIGGER = 'portal_submission';

/** The influencer audience: profile, change requests and assignments. */
export function registerInfluencerRoutes(router: Router, store: DataStore, companyId: string, requireInfluencerSession: RequestHandler): void {
  const currency = () => store.getCompanyFinanceSettings(companyId).currencyCode;
  const actorFor = (session: PortalSession, contact: Contact) => ({ name: `Portal: ${session.name} (influencer ${contact.name})` });

  const self = (session: PortalSession): Contact => {
    const contact = store.getContactById(session.contactId);
    if (!contact || contact.companyId !== companyId) throw new HttpError(404, 'Not found.');
    return contact;
  };

  const managerOf = (session: PortalSession, contact: Contact, campaignOwner?: string) =>
    campaignOwner ?? contact.ownerUserId ?? store.portal.inviterOf(session.portalUserId);

  router.get('/influencer/profile', requireInfluencerSession, (req: SessionRequest, res: Response) => {
    res.json(toProfileDto(store, self(req.portal!), currency()));
  });

  router.post('/influencer/profile/availability', requireInfluencerSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const contact = self(session);
    const availability = enumValue(asRecord(req.body, 'body').availability, 'availability', AVAILABILITY);
    store.runAsActor(actorFor(session, contact), () => store.updateContact(contact.id, { availabilityStatus: availability }));
    res.json(toProfileDto(store, self(session), currency()));
  });

  router.post('/influencer/profile/change-requests', requireInfluencerSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const contact = self(session);
    const changes = parseChanges(asRecord(req.body, 'body'), contact.influencerAccounts ?? []);
    const managerId = managerOf(session, contact);
    const created = store.transaction(() => {
      const request = store.influencer.addChangeRequest({ companyId, contactId: contact.id, portalUserId: session.portalUserId, changes });
      if (!request) return undefined;
      const title = `Review profile changes from ${contact.name}`;
      const followup = store.createFollowup({
        companyId, entityType: 'contact', entityId: contact.id, title, channel: 'Task', priority: 'normal',
        ownerUserId: managerId, ownerName: managerId ? store.getUserById(managerId)?.name : undefined,
        dueAt: new Date(Date.now() + 2 * DAY_MS),
        notes: `Requested changes: ${Object.keys(changes).join(', ')}`,
        sourceTrigger: CHANGE_REVIEW_TRIGGER, sourceType: 'contact_change_request', sourceId: request.id,
      });
      if (managerId) {
        store.notify({
          companyId, userIds: [managerId], type: 'followup_assigned',
          title: `${contact.name} asked to update their profile`,
          data: { tKey: 'notif.followupAssigned.t', name: title },
          link: '/influencers', entityType: 'follow_up', entityId: followup.id,
        });
      }
      return request;
    });
    if (!created) throw new HttpError(409, 'A change request is already waiting for review.');
    res.status(201).json(toProfileDto(store, self(session), currency()));
  });

  const ownAssignment = (session: PortalSession, id: string) => {
    const assignment = store.getCampaignAssignmentById(id);
    const campaign = assignment ? store.getCrmCampaignById(assignment.campaignId) : undefined;
    if (!assignment || assignment.companyId !== companyId || assignment.contactId !== session.contactId || !isVisibleAssignment(assignment, campaign)) {
      throw new HttpError(404, 'Not found.');
    }
    return { assignment, campaign: campaign! };
  };

  /** A deliverable this influencer is paid for, on a campaign they have accepted. */
  const ownWork = (session: PortalSession, id: string) => {
    const deliverable = store.getCampaignDeliverableById(id);
    if (!deliverable || deliverable.companyId !== companyId || paidContactOf(deliverable) !== session.contactId || deliverable.status === 'Cancelled') {
      throw new HttpError(404, 'Not found.');
    }
    const campaign = store.getCrmCampaignById(deliverable.campaignId);
    const assignment = store.listCampaignAssignments(deliverable.campaignId)
      .find((a) => a.contactId === session.contactId && (a.status === 'Confirmed' || a.status === 'Completed'));
    if (!assignment || !isVisibleAssignment(assignment, campaign)) throw new HttpError(404, 'Not found.');
    return { deliverable, campaign: campaign! };
  };

  const link = (value: unknown, field: string) => {
    const url = safeUrl(value);
    if (!url || url.length > 2000) throw new HttpError(400, `${field} must be an http or https link.`);
    return url;
  };

  router.post('/influencer/deliverables/:id/start', requireInfluencerSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const { deliverable } = ownWork(session, req.params.id);
    if (deliverable.status !== 'Planned') throw new HttpError(409, 'This has already been started.');
    store.runAsActor(actorFor(session, self(session)), () => store.updateCampaignDeliverable(deliverable.id, { status: 'In Progress' }));
    res.json({ status: 'in_progress' });
  });

  router.post('/influencer/deliverables/:id/submissions', requireInfluencerSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const contact = self(session);
    const { deliverable, campaign } = ownWork(session, req.params.id);
    if (deliverable.status !== 'Planned' && deliverable.status !== 'In Progress') {
      throw new HttpError(409, deliverable.status === 'Submitted' ? 'Your last version is still being reviewed.' : 'This can no longer be changed.');
    }
    const body = asRecord(req.body, 'body');
    const contentUrl = link(body.contentUrl, 'contentUrl');
    const caption = typeof body.caption === 'string' && body.caption.trim() ? body.caption.trim().slice(0, 2200) : null;
    const managerId = managerOf(session, contact, campaign.ownerUserId);
    const submission = store.transaction(() => store.runAsActor(actorFor(session, contact), () => {
      const created = store.influencer.addSubmission({ companyId, deliverableId: deliverable.id, contactId: contact.id, portalUserId: session.portalUserId, contentUrl, caption });
      store.updateCampaignDeliverable(deliverable.id, { status: 'Submitted', contentUrl });
      const title = `Review ${contact.name}'s "${deliverable.title}" (version ${created.version})`;
      const followup = store.createFollowup({
        companyId, entityType: 'contact', entityId: contact.id, title, channel: 'Task', priority: 'high',
        ownerUserId: managerId, ownerName: managerId ? store.getUserById(managerId)?.name : undefined,
        dueAt: new Date(Date.now() + DAY_MS), notes: `${campaign.name}: ${contentUrl}`,
        sourceTrigger: SUBMISSION_REVIEW_TRIGGER, sourceType: 'deliverable_submission', sourceId: created.id,
      });
      if (managerId) {
        store.notify({
          companyId, userIds: [managerId], type: 'followup_assigned', title,
          data: { tKey: 'notif.followupAssigned.t', name: title },
          link: '/crm/campaigns', entityType: 'follow_up', entityId: followup.id,
        });
      }
      return created;
    }));
    res.status(201).json(submissionDto(submission));
  });

  router.post('/influencer/deliverables/:id/publish', requireInfluencerSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const { deliverable } = ownWork(session, req.params.id);
    const postUrl = link(asRecord(req.body, 'body').postUrl, 'postUrl');
    if (deliverable.status !== 'Approved') throw new HttpError(409, 'Publish once your content is approved.');
    store.runAsActor(actorFor(session, self(session)), () =>
      store.updateCampaignDeliverable(deliverable.id, { status: 'Published', contentUrl: postUrl, publishedAt: new Date() }));
    res.json({ status: 'published', postUrl });
  });

  router.get('/influencer/assignments', requireInfluencerSession, (req: SessionRequest, res: Response) => {
    const contact = self(req.portal!);
    const assignments = store.listCrmCampaigns(companyId)
      .flatMap((campaign) => store.listCampaignAssignments(campaign.id)
        .filter((a) => a.contactId === contact.id && isVisibleAssignment(a, campaign)));
    res.json(assignments.map((a) => toAssignmentDto(store, a, contact, currency())));
  });

  router.post('/influencer/assignments/:id/respond', requireInfluencerSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const contact = self(session);
    const { assignment, campaign } = ownAssignment(session, req.params.id);
    const body = asRecord(req.body, 'body');
    const decision = enumValue(body.decision, 'decision', ['accepted', 'declined'] as const);
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 1000) : null;
    if (decision === 'declined' && (!reason || reason.length < 3)) throw new HttpError(400, 'Say why you are declining.');
    if (assignment.status !== 'Contacted') throw new HttpError(409, 'This assignment is not waiting for your answer.');

    const managerId = managerOf(session, contact, campaign.ownerUserId);
    const ok = store.transaction(() => store.runAsActor(actorFor(session, contact), () => {
      if (!store.influencer.addResponse({ assignmentId: assignment.id, companyId, portalUserId: session.portalUserId, decision, reason })) return false;
      store.updateCampaignAssignment(assignment.id, { status: decision === 'accepted' ? 'Confirmed' : 'Cancelled' });
      const title = decision === 'accepted'
        ? `${contact.name} accepted "${campaign.name}"`
        : `${contact.name} declined "${campaign.name}"`;
      if (decision === 'declined') {
        store.createFollowup({
          companyId, entityType: 'contact', entityId: contact.id, title, channel: 'Task', priority: 'high',
          ownerUserId: managerId, ownerName: managerId ? store.getUserById(managerId)?.name : undefined,
          dueAt: new Date(Date.now() + DAY_MS), notes: `${session.name}: ${reason}`,
          sourceTrigger: 'portal_assignment_declined', sourceType: 'campaign_assignment', sourceId: assignment.id,
        });
      }
      if (managerId) {
        store.notify({
          companyId, userIds: [managerId], type: 'followup_assigned', title, body: reason ?? undefined,
          data: { tKey: 'notif.followupAssigned.t', name: title },
          link: '/crm/campaigns', entityType: 'campaign', entityId: campaign.id,
        });
      }
      return true;
    }));
    if (!ok) throw new HttpError(409, 'This assignment is not waiting for your answer.');
    res.json(toAssignmentDto(store, store.getCampaignAssignmentById(assignment.id)!, contact, currency()));
  });
}
