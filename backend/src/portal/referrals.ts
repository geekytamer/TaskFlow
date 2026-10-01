import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { Contact, Opportunity } from '../types';
import { enumValue } from '../validation';
import {
  commissionBases,
  payoutTypes,
  type CommissionRecord,
  type CommissionTerms,
  type ReferralRecord,
} from './referrals-store';

export const MAX_WAITING_REFERRALS = 10;

const text = (value: unknown, field: string, min: number, max: number): string => {
  const v = typeof value === 'string' ? value.trim() : '';
  if (v.length < min || v.length > max) throw new HttpError(400, `${field} must be ${min} to ${max} characters.`);
  return v;
};

const money = (value: unknown, field: string): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${field} must be a positive number.`);
  return Number(n.toFixed(2));
};

export function parseReferral(body: Record<string, unknown>) {
  return {
    prospectName: text(body.prospectName, 'prospectName', 2, 120),
    prospectContact: text(body.prospectContact, 'prospectContact', 3, 200),
    description: text(body.description, 'description', 10, 2000),
    estimatedValue: money(body.estimatedValue, 'estimatedValue'),
  };
}

export function parseCommissionTerms(value: unknown): CommissionTerms {
  if (!value || typeof value !== 'object') throw new HttpError(400, 'Commission terms are required.');
  const body = value as Record<string, unknown>;
  const basis = enumValue(body.basis, 'basis', commissionBases);
  const payoutType = enumValue(body.payoutType, 'payoutType', payoutTypes);
  if (basis === 'percent') {
    const rate = Number(body.ratePercent);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) throw new HttpError(400, 'ratePercent must be above 0 and at most 100.');
    return { basis, ratePercent: Number(rate.toFixed(2)), fixedAmount: null, payoutType };
  }
  const amount = money(body.fixedAmount, 'fixedAmount');
  if (!amount) throw new HttpError(400, 'fixedAmount must be above 0.');
  return { basis, ratePercent: null, fixedAmount: amount, payoutType };
}

/** What a commission is worth once its deal is won. */
export const commissionAmount = (terms: CommissionTerms, opportunity: Opportunity): number =>
  terms.basis === 'fixed'
    ? terms.fixedAmount!
    : Number(((opportunity.expectedRevenue || 0) * terms.ratePercent! / 100).toFixed(2));

/** Paid is never stored: it is read from the document that pays it. */
export function commissionStatus(store: DataStore, commission: CommissionRecord): 'pending' | 'approved' | 'paid' | 'voided' {
  if (commission.status !== 'approved') return commission.status;
  if (!commission.payoutRefId) return 'approved';
  if (commission.payoutType === 'vendor_bill') {
    return store.getVendorBillById(commission.payoutRefId)?.status === 'Paid' ? 'paid' : 'approved';
  }
  return store.getCreditNoteById(commission.payoutRefId)?.status === 'Issued' ? 'paid' : 'approved';
}

/** The referrer's view of where their referral stands, derived from the CRM. */
export function portalReferralStatus(referral: ReferralRecord, opportunity: Opportunity | undefined) {
  if (referral.status === 'submitted') return 'received';
  if (referral.status === 'declined') return 'not_pursued';
  if (opportunity?.stage === 'Won') return 'won';
  if (opportunity && (opportunity.stage === 'Lost' || opportunity.stage === 'Cancelled')) return 'closed';
  return 'taken_forward';
}

/** Allowlisted: no staff note, reviewer, opportunity, deal value or payout document. */
export function toPortalReferral(store: DataStore, referral: ReferralRecord) {
  const opportunity = referral.opportunityId ? store.getOpportunityById(referral.opportunityId) : undefined;
  const commission = store.referrals.commissionOf(referral.id);
  return {
    id: referral.id,
    prospectName: referral.prospectName,
    prospectContact: referral.prospectContact,
    description: referral.description,
    estimatedValue: referral.estimatedValue,
    currency: referral.currency,
    status: portalReferralStatus(referral, opportunity),
    commission: commission
      ? {
          basis: commission.basis,
          ratePercent: commission.ratePercent,
          fixedAmount: commission.fixedAmount,
          amount: commission.status === 'approved' ? commission.amount : null,
          currency: referral.currency,
          status: commissionStatus(store, commission),
        }
      : null,
    createdAt: referral.createdAt,
  };
}

export function toStaffReferral(store: DataStore, referral: ReferralRecord) {
  const referrer = store.getContactById(referral.referrerContactId);
  const opportunity = referral.opportunityId ? store.getOpportunityById(referral.opportunityId) : undefined;
  const commission = store.referrals.commissionOf(referral.id);
  return {
    ...referral,
    referrer: { id: referral.referrerContactId, name: referrer?.name ?? null, roles: referrer?.roles ?? [] },
    submittedBy: store.portal.getUser(referral.referrerPortalUserId)?.name ?? null,
    reviewedBy: referral.reviewedByUserId ? store.getUserById(referral.reviewedByUserId)?.name ?? null : null,
    opportunity: opportunity ? { id: opportunity.id, title: opportunity.title, stage: opportunity.stage, expectedRevenue: opportunity.expectedRevenue } : null,
    commission: commission ? { ...commission, status: commissionStatus(store, commission) } : null,
  };
}

/** A credit note may pay a commission only if it is to the referrer and for exactly the approved amount. */
export function assertCreditNotePays(store: DataStore, input: { companyId: string; creditNoteId: string; referrer: Contact; amount: number }) {
  const note = store.getCreditNoteById(input.creditNoteId);
  if (!note || note.companyId !== input.companyId || note.status !== 'Issued') throw new HttpError(400, 'Choose an issued credit note.');
  if (note.clientId !== input.referrer.id && note.clientId !== input.referrer.clientId) {
    throw new HttpError(400, 'That credit note is for a different client.');
  }
  if (Math.abs(note.total - input.amount) > 0.005) throw new HttpError(400, `The credit note must be for exactly ${input.amount}.`);
  if (store.referrals.commissionPaidBy(note.id)) throw new HttpError(400, 'That credit note already pays another commission.');
  return note;
}
