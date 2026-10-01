import type { Request, RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import { asRecord } from '../validation';
import type { PortalSession } from './portal-store';
import { MAX_WAITING_REFERRALS, parseReferral, toPortalReferral } from './referrals';

type SessionRequest = Request & { portal?: PortalSession };

const DAY_MS = 24 * 60 * 60 * 1000;
export const REFERRAL_REVIEW_TRIGGER = 'portal_referral';

/** Referrals for either audience, scoped to the session's own contact. */
export function registerReferralRoutes(router: Router, store: DataStore, companyId: string, requireSession: RequestHandler): void {
  router.get('/:audience/referrals', requireSession, (req: SessionRequest, res: Response) => {
    res.json(store.referrals.listForReferrer(companyId, req.portal!.contactId).map((r) => toPortalReferral(store, r)));
  });

  router.post('/:audience/referrals', requireSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const input = parseReferral(asRecord(req.body, 'body'));
    const referrer = store.getContactById(session.contactId);
    if (!referrer) throw new HttpError(404, 'Not found.');
    if (store.referrals.countSubmitted(companyId, referrer.id) >= MAX_WAITING_REFERRALS) {
      throw new HttpError(429, 'Several referrals are still waiting for review. Please wait for your account manager to reply.');
    }
    const managerId = referrer.ownerUserId ?? store.portal.inviterOf(session.portalUserId);
    const referral = store.transaction(() => {
      const created = store.referrals.create({
        companyId, referrerContactId: referrer.id, referrerPortalUserId: session.portalUserId, ...input,
        currency: store.getCompanyFinanceSettings(companyId).currencyCode,
      });
      const title = `Review referral from ${referrer.name}: ${input.prospectName}`;
      const followup = store.createFollowup({
        companyId,
        entityType: 'contact',
        entityId: referrer.id,
        title,
        channel: 'Task',
        priority: 'normal',
        ownerUserId: managerId,
        ownerName: managerId ? store.getUserById(managerId)?.name : undefined,
        dueAt: new Date(Date.now() + 2 * DAY_MS),
        notes: `${session.name}: ${input.description}\nProspect contact: ${input.prospectContact}`,
        sourceTrigger: REFERRAL_REVIEW_TRIGGER,
        sourceType: 'portal_referral',
        sourceId: created.id,
      });
      if (managerId) {
        store.notify({
          companyId,
          userIds: [managerId],
          type: 'followup_assigned',
          title: `${referrer.name} referred ${input.prospectName}`,
          body: input.description.slice(0, 200),
          data: { tKey: 'notif.followupAssigned.t', name: title },
          link: '/portal-referrals',
          entityType: 'follow_up',
          entityId: followup.id,
        });
      }
      return created;
    });
    res.status(201).json(toPortalReferral(store, referral));
  });
}
