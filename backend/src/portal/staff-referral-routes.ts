import type { RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { Opportunity } from '../types';
import { asRecord } from '../validation';
import {
  assertCreditNotePays,
  commissionAmount,
  parseCommissionTerms,
  toStaffReferral,
} from './referrals';
import type { CommissionTerms, ReferralRecord } from './referrals-store';
import { REFERRAL_REVIEW_TRIGGER } from './referral-routes';
import type { StaffRequest } from './staff-routes';

const DAY_MS = 24 * 60 * 60 * 1000;

const optionalText = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().slice(0, max);
};

/**
 * The staff side of referrals: a review queue, conversion into the CRM, and
 * commissions. Nothing here posts to the ledger: a vendor bill is created as a
 * draft for finance, and a credit note is issued by an accountant, then linked.
 */
export function registerStaffReferralRoutes(
  router: Router,
  store: DataStore,
  authMiddleware: RequestHandler,
  authorize: (req: StaffRequest) => string,
  wrap: (fn: (req: StaffRequest, res: Response) => unknown) => RequestHandler,
): void {
  const load = (companyId: string, id: string): ReferralRecord => {
    const referral = store.referrals.get(id);
    if (!referral || referral.companyId !== companyId) throw new HttpError(404, 'Referral not found.');
    return referral;
  };

  const closeReview = (companyId: string, referral: ReferralRecord, userId: string) => {
    store.listFollowupEntities(companyId, { status: 'active', entityType: 'contact', entityId: referral.referrerContactId })
      .filter((f) => f.sourceTrigger === REFERRAL_REVIEW_TRIGGER && f.sourceId === referral.id)
      .forEach((f) => store.completeFollowup(f.id, { outcome: 'done', completedByUserId: userId }));
  };

  const respond = (res: Response, id: string) => res.json(toStaffReferral(store, store.referrals.get(id)!));

  router.get('/companies/:companyId/portal-referrals', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    res.json(store.referrals.list(companyId).map((r) => toStaffReferral(store, r)));
  }));

  router.post('/companies/:companyId/portal-referrals/:id/decline', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const referral = load(companyId, req.params.id);
    const body = asRecord(req.body ?? {}, 'body');
    const userId = req.user!.id;
    const done = store.transaction(() => {
      if (!store.referrals.decide(referral.id, { status: 'declined', staffNote: optionalText(body.staffNote, 2000), reviewedByUserId: userId })) return false;
      closeReview(companyId, referral, userId);
      return true;
    });
    if (!done) throw new HttpError(409, 'This referral has already been decided.');
    respond(res, referral.id);
  }));

  router.post('/companies/:companyId/portal-referrals/:id/convert', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const referral = load(companyId, req.params.id);
    if (referral.status !== 'submitted') throw new HttpError(409, 'This referral has already been decided.');
    const body = asRecord(req.body ?? {}, 'body');
    // Validate everything before writing anything.
    const terms: CommissionTerms | null = body.commission === undefined || body.commission === null ? null : parseCommissionTerms(body.commission);
    let prospect = typeof body.prospectContactId === 'string' && body.prospectContactId ? store.getContactById(body.prospectContactId) : undefined;
    if (body.prospectContactId && (!prospect || prospect.companyId !== companyId)) throw new HttpError(400, 'That contact does not exist.');
    const revenueRaw = body.expectedRevenue ?? referral.estimatedValue ?? 0;
    const expectedRevenue = Number(revenueRaw);
    if (!Number.isFinite(expectedRevenue) || expectedRevenue < 0) throw new HttpError(400, 'expectedRevenue must be a positive number.');
    const referrer = store.getContactById(referral.referrerContactId);
    const ownerId = (typeof body.ownerUserId === 'string' && body.ownerUserId) || referrer?.ownerUserId || req.user!.id;
    const owner = store.getUserById(ownerId);
    if (!owner) throw new HttpError(400, 'That owner does not exist.');
    const title = optionalText(body.title, 160) ?? `${referral.prospectName} (referral)`;
    const userId = req.user!.id;

    const done = store.transaction(() => {
      if (!prospect) {
        prospect = store.createContact({
          companyId,
          kind: 'Organization',
          name: referral.prospectName,
          roles: ['Lead'],
          leadStatus: 'New',
          leadSource: 'Referral',
          ownerUserId: owner.id,
          ownerName: owner.name,
          notes: `Referred by ${referrer?.name ?? 'a portal user'}. Contact details they gave: ${referral.prospectContact}`,
        });
      }
      const opportunity: Opportunity = store.createOpportunity({
        companyId,
        contactId: prospect.id,
        ownerUserId: owner.id,
        ownerName: owner.name,
        title,
        serviceType: 'Referral',
        stage: 'New',
        expectedRevenue: Number(expectedRevenue.toFixed(2)),
        probability: 10,
        expectedCloseDate: new Date(Date.now() + 30 * DAY_MS),
        notes: `Referred by ${referrer?.name ?? 'a portal user'} through the portal.\n\n${referral.description}\n\nContact: ${referral.prospectContact}`,
      });
      if (!store.referrals.decide(referral.id, {
        status: 'converted', staffNote: optionalText(body.staffNote, 2000), reviewedByUserId: userId,
        opportunityId: opportunity.id, prospectContactId: prospect.id,
      })) {
        throw new HttpError(409, 'This referral has already been decided.');
      }
      if (terms) store.referrals.setTerms(store.referrals.get(referral.id)!, terms);
      closeReview(companyId, referral, userId);
      return true;
    });
    if (!done) throw new HttpError(409, 'This referral has already been decided.');
    respond(res, referral.id);
  }));

  router.put('/companies/:companyId/portal-referrals/:id/commission', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const referral = load(companyId, req.params.id);
    if (referral.status !== 'converted') throw new HttpError(409, 'Only a converted referral can carry a commission.');
    const terms = parseCommissionTerms(req.body);
    if (!store.referrals.setTerms(referral, terms)) throw new HttpError(409, 'An approved commission cannot be changed.');
    respond(res, referral.id);
  }));

  router.post('/companies/:companyId/portal-referrals/:id/commission/void', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const referral = load(companyId, req.params.id);
    if (!store.referrals.void(referral.id)) throw new HttpError(409, 'Only a pending commission can be voided.');
    respond(res, referral.id);
  }));

  router.post('/companies/:companyId/portal-referrals/:id/commission/approve', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const referral = load(companyId, req.params.id);
    const commission = store.referrals.commissionOf(referral.id);
    if (!commission || commission.status !== 'pending') throw new HttpError(409, 'There is no pending commission to approve.');
    const opportunity = referral.opportunityId ? store.getOpportunityById(referral.opportunityId) : undefined;
    if (!opportunity || opportunity.stage !== 'Won') throw new HttpError(409, 'A commission is approved once the deal is won.');
    const amount = commissionAmount(commission, opportunity);
    if (amount <= 0) throw new HttpError(409, 'Set the deal value before approving a percentage commission.');
    const referrer = store.getContactById(referral.referrerContactId);
    if (!referrer) throw new HttpError(409, 'The referrer no longer exists.');

    const done = store.transaction(() => {
      let payoutRefId: string | null = null;
      if (commission.payoutType === 'vendor_bill') {
        const bill = store.createVendorBill({
          companyId,
          vendorName: referrer.name,
          supplierId: referrer.supplierId ?? undefined,
          issueDate: new Date(),
          dueDate: new Date(Date.now() + 30 * DAY_MS),
          amount,
          status: 'Draft',
          notes: `Referral commission: ${referral.prospectName}`,
        });
        payoutRefId = bill.id;
      }
      return store.referrals.approve(referral.id, { amount, payoutRefId, userId: req.user!.id });
    });
    if (!done) throw new HttpError(409, 'There is no pending commission to approve.');
    respond(res, referral.id);
  }));

  router.post('/companies/:companyId/portal-referrals/:id/commission/credit-note', authMiddleware, wrap((req, res) => {
    const companyId = authorize(req);
    const referral = load(companyId, req.params.id);
    const commission = store.referrals.commissionOf(referral.id);
    if (!commission || commission.status !== 'approved' || commission.payoutType !== 'credit_note' || commission.payoutRefId) {
      throw new HttpError(409, 'This commission is not waiting for a credit note.');
    }
    const referrer = store.getContactById(referral.referrerContactId);
    if (!referrer) throw new HttpError(409, 'The referrer no longer exists.');
    const body = asRecord(req.body, 'body');
    // Staff who manage the portal may not read finance, so they can name the
    // credit note by the number the accountant gives them.
    const byNumber = typeof body.creditNoteNumber === 'string' && body.creditNoteNumber.trim()
      ? store.listCreditNotes(companyId).find((n) => n.creditNoteNumber.toLowerCase() === (body.creditNoteNumber as string).trim().toLowerCase())
      : undefined;
    const creditNoteId = byNumber?.id ?? (typeof body.creditNoteId === 'string' ? body.creditNoteId : '');
    const note = assertCreditNotePays(store, { companyId, creditNoteId, referrer, amount: commission.amount! });
    if (!store.referrals.linkPayout(referral.id, note.id)) throw new HttpError(409, 'This commission is not waiting for a credit note.');
    respond(res, referral.id);
  }));
}
