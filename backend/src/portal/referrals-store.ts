import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

export const referralStatuses = ['submitted', 'converted', 'declined'] as const;
export type ReferralStatus = (typeof referralStatuses)[number];
export const commissionBases = ['percent', 'fixed'] as const;
export const payoutTypes = ['vendor_bill', 'credit_note'] as const;
export type CommissionBasis = (typeof commissionBases)[number];
export type PayoutType = (typeof payoutTypes)[number];
/** Stored statuses. "Paid" is never stored: it is read from the payout document. */
export type CommissionStatus = 'pending' | 'approved' | 'voided';

export interface ReferralRecord {
  id: string;
  companyId: string;
  referrerContactId: string;
  referrerPortalUserId: string;
  prospectName: string;
  prospectContact: string;
  description: string;
  estimatedValue: number | null;
  currency: string;
  status: ReferralStatus;
  staffNote: string | null;
  opportunityId: string | null;
  prospectContactId: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface CommissionTerms {
  basis: CommissionBasis;
  ratePercent: number | null;
  fixedAmount: number | null;
  payoutType: PayoutType;
}

export interface CommissionRecord extends CommissionTerms {
  id: string;
  companyId: string;
  referralId: string;
  referrerContactId: string;
  status: CommissionStatus;
  amount: number | null;
  payoutRefId: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Storage for portal referrals and the optional commission on each. */
export class PortalReferralsStore {
  constructor(private readonly db: Database.Database) {}

  create(input: Pick<ReferralRecord, 'companyId' | 'referrerContactId' | 'referrerPortalUserId' | 'prospectName' | 'prospectContact' | 'description' | 'estimatedValue' | 'currency'>): ReferralRecord {
    const id = uuid();
    this.db
      .prepare(
        `INSERT INTO portal_referrals
           (id, companyId, referrerContactId, referrerPortalUserId, prospectName, prospectContact, description, estimatedValue, currency, status, createdAt)
         VALUES (@id, @companyId, @referrerContactId, @referrerPortalUserId, @prospectName, @prospectContact, @description, @estimatedValue, @currency, 'submitted', @createdAt)`,
      )
      .run({ ...input, id, createdAt: new Date().toISOString() });
    return this.get(id)!;
  }

  get(id: string): ReferralRecord | undefined {
    return this.db.prepare('SELECT * FROM portal_referrals WHERE id = ?').get(id) as ReferralRecord | undefined;
  }

  listForReferrer(companyId: string, contactId: string): ReferralRecord[] {
    return this.db
      .prepare('SELECT * FROM portal_referrals WHERE companyId = ? AND referrerContactId = ? ORDER BY createdAt DESC, rowid DESC')
      .all(companyId, contactId) as ReferralRecord[];
  }

  /** Submitted first, then newest. */
  list(companyId: string): ReferralRecord[] {
    return this.db
      .prepare(`SELECT * FROM portal_referrals WHERE companyId = ? ORDER BY status = 'submitted' DESC, createdAt DESC, rowid DESC`)
      .all(companyId) as ReferralRecord[];
  }

  countSubmitted(companyId: string, contactId: string): number {
    return (this.db
      .prepare(`SELECT COUNT(*) AS n FROM portal_referrals WHERE companyId = ? AND referrerContactId = ? AND status = 'submitted'`)
      .get(companyId, contactId) as { n: number }).n;
  }

  /** Records staff's decision. False if the referral was no longer waiting for one. */
  decide(id: string, input: { status: Exclude<ReferralStatus, 'submitted'>; staffNote: string | null; reviewedByUserId: string; opportunityId?: string; prospectContactId?: string }): boolean {
    return this.db
      .prepare(
        `UPDATE portal_referrals
            SET status = @status, staffNote = @staffNote, reviewedByUserId = @reviewedByUserId, reviewedAt = @reviewedAt,
                opportunityId = @opportunityId, prospectContactId = @prospectContactId
          WHERE id = @id AND status = 'submitted'`,
      )
      .run({
        id, status: input.status, staffNote: input.staffNote, reviewedByUserId: input.reviewedByUserId,
        reviewedAt: new Date().toISOString(), opportunityId: input.opportunityId ?? null, prospectContactId: input.prospectContactId ?? null,
      }).changes === 1;
  }

  commissionOf(referralId: string): CommissionRecord | undefined {
    return this.db.prepare('SELECT * FROM referral_commissions WHERE referralId = ?').get(referralId) as CommissionRecord | undefined;
  }

  commissionPaidBy(payoutRefId: string): CommissionRecord | undefined {
    return this.db.prepare('SELECT * FROM referral_commissions WHERE payoutRefId = ?').get(payoutRefId) as CommissionRecord | undefined;
  }

  /** Sets or replaces terms. Only a pending or voided commission can be changed; false otherwise. */
  setTerms(referral: ReferralRecord, terms: CommissionTerms): boolean {
    const now = new Date().toISOString();
    const existing = this.commissionOf(referral.id);
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO referral_commissions
             (id, companyId, referralId, referrerContactId, basis, ratePercent, fixedAmount, payoutType, status, createdAt, updatedAt)
           VALUES (@id, @companyId, @referralId, @referrerContactId, @basis, @ratePercent, @fixedAmount, @payoutType, 'pending', @now, @now)`,
        )
        .run({ ...terms, id: uuid(), companyId: referral.companyId, referralId: referral.id, referrerContactId: referral.referrerContactId, now });
      return true;
    }
    return this.db
      .prepare(
        `UPDATE referral_commissions
            SET basis = @basis, ratePercent = @ratePercent, fixedAmount = @fixedAmount, payoutType = @payoutType,
                status = 'pending', updatedAt = @now
          WHERE referralId = @referralId AND status IN ('pending', 'voided')`,
      )
      .run({ ...terms, referralId: referral.id, now }).changes === 1;
  }

  approve(referralId: string, input: { amount: number; payoutRefId: string | null; userId: string }): boolean {
    const now = new Date().toISOString();
    return this.db
      .prepare(
        `UPDATE referral_commissions
            SET status = 'approved', amount = @amount, payoutRefId = @payoutRefId, approvedByUserId = @userId, approvedAt = @now, updatedAt = @now
          WHERE referralId = @referralId AND status = 'pending'`,
      )
      .run({ ...input, referralId, now }).changes === 1;
  }

  linkPayout(referralId: string, payoutRefId: string): boolean {
    return this.db
      .prepare(`UPDATE referral_commissions SET payoutRefId = ?, updatedAt = ? WHERE referralId = ? AND status = 'approved' AND payoutRefId IS NULL`)
      .run(payoutRefId, new Date().toISOString(), referralId).changes === 1;
  }

  void(referralId: string): boolean {
    return this.db
      .prepare(`UPDATE referral_commissions SET status = 'voided', updatedAt = ? WHERE referralId = ? AND status = 'pending'`)
      .run(new Date().toISOString(), referralId).changes === 1;
  }
}
