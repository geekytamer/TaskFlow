import type { Request, RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import { asRecord } from '../validation';
import type { PortalSession } from './portal-store';
import { companyCurrency, managerOf, notifyManager, raiseFollowup, type SessionRequest } from './common';
import { MAX_WAITING_REFERRALS, parseReferral, toPortalReferral } from './referrals';


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
    const managerId = managerOf(store, session, referrer);
    const referral = store.transaction(() => {
      const created = store.referrals.create({
        companyId, referrerContactId: referrer.id, referrerPortalUserId: session.portalUserId, ...input,
        currency: companyCurrency(store, companyId),
      });
      const title = `Review referral from ${referrer.name}: ${input.prospectName}`;
      const followup = raiseFollowup(store, {
        companyId, entityType: 'contact', entityId: referrer.id, title, priority: 'normal', ownerUserId: managerId, dueDays: 2,
        notes: `${session.name}: ${input.description}\nProspect contact: ${input.prospectContact}`,
        sourceTrigger: REFERRAL_REVIEW_TRIGGER, sourceType: 'portal_referral', sourceId: created.id,
      });
      notifyManager(store, {
        companyId, managerId, title: `${referrer.name} referred ${input.prospectName}`, name: title,
        body: input.description.slice(0, 200), link: '/portal-referrals', entityType: 'follow_up', entityId: followup.id,
      });
      return created;
    });
    res.status(201).json(toPortalReferral(store, referral));
  });
}
