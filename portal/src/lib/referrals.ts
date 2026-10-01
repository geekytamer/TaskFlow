import { clientGet } from './client-api';

export type ReferralStatus = 'received' | 'taken_forward' | 'won' | 'closed' | 'not_pursued';
export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'voided';

export interface Referral {
  id: string;
  prospectName: string;
  prospectContact: string;
  description: string;
  estimatedValue: number | null;
  currency: string;
  status: ReferralStatus;
  commission: {
    basis: 'percent' | 'fixed';
    ratePercent: number | null;
    fixedAmount: number | null;
    amount: number | null;
    currency: string;
    status: CommissionStatus;
  } | null;
  createdAt: string;
}

export const getReferrals = () => clientGet<Referral[]>('/referrals');
