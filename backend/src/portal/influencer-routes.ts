import type { Request, RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { Contact } from '../types';
import { asRecord, enumValue } from '../validation';
import { AVAILABILITY, isVisibleAssignment, parseChanges, toAssignmentDto, toProfileDto } from './influencer';
import type { PortalSession } from './portal-store';

type SessionRequest = Request & { portal?: PortalSession };

const DAY_MS = 24 * 60 * 60 * 1000;
export const CHANGE_REVIEW_TRIGGER = 'portal_profile_change';

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
