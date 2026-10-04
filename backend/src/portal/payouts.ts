import type { DataStore } from '../data/store';
import type { VendorBill } from '../types';
import { paidContactOf } from './influencer';

const iso = (value: Date | string | undefined | null) => (value ? new Date(value).toISOString() : null);

const STATUS: Record<VendorBill['status'], 'pending' | 'approved' | 'paid'> = {
  Draft: 'pending',
  Approved: 'approved',
  Overdue: 'approved',
  Paid: 'paid',
};

/**
 * The bills that pay this influencer's own work: bills linked from deliverables
 * they are paid for, and their referral commission bills. Not every bill for
 * their supplier record, which can be unset, shared, or about something else.
 */
export function payoutsFor(store: DataStore, companyId: string, contactId: string, currency: string) {
  const byBill = new Map<string, { kind: 'campaign' | 'referral'; label: string; items: string[] }>();

  for (const id of store.influencer.paidDeliverableIdsOf(companyId, contactId)) {
    const d = store.getCampaignDeliverableById(id);
    if (!d?.vendorBillId || paidContactOf(d) !== contactId) continue;
    const entry = byBill.get(d.vendorBillId) ?? { kind: 'campaign' as const, label: store.getCrmCampaignById(d.campaignId)?.name ?? '', items: [] };
    entry.items.push(d.title);
    byBill.set(d.vendorBillId, entry);
  }
  for (const referral of store.referrals.listForReferrer(companyId, contactId)) {
    const commission = store.referrals.commissionOf(referral.id);
    if (commission?.payoutType === 'vendor_bill' && commission.status === 'approved' && commission.payoutRefId) {
      byBill.set(commission.payoutRefId, { kind: 'referral', label: referral.prospectName, items: [] });
    }
  }

  return [...byBill.entries()]
    .map(([billId, source]) => ({ bill: store.getVendorBillById(billId), source }))
    .filter((x): x is { bill: VendorBill; source: typeof x.source } => Boolean(x.bill) && x.bill!.companyId === companyId)
    .map(({ bill, source }) => ({
      id: bill.id,
      number: bill.billNumber,
      kind: source.kind,
      label: source.label,
      items: source.items,
      amount: bill.amount,
      currency,
      dueDate: iso(bill.dueDate),
      status: STATUS[bill.status],
      paidAt: bill.status === 'Paid' ? iso(bill.paidAt) : null,
    }))
    .sort((a, b) => (b.dueDate ?? '').localeCompare(a.dueDate ?? ''));
}
