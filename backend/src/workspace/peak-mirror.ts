import type { DataStore } from '../data/store';
import type { CampaignAssignment, Contact } from '../types';
import { assignmentStatus, isVisibleAssignment, paidContactOf, toAssignmentDto } from '../portal/influencer';
import type { WsDealStatus } from './workspace-store';

/**
 * Peak work, shown in the influencer's workspace as deals. Read from Peak's own
 * records on every request and never copied, so the workspace can never drift
 * from what Peak has. Only what the Assignments page already shows is used.
 */

export const PEAK_PREFIX = 'peak-';

/** Whether every bill paying this influencer's work on the campaign is paid (and there is at least one). */
function allPaid(store: DataStore, assignment: CampaignAssignment): boolean {
  const billIds = new Set(store.listCampaignDeliverables(assignment.campaignId)
    .filter((d) => paidContactOf(d) === assignment.contactId && d.status !== 'Cancelled')
    .map((d) => d.vendorBillId));
  if (billIds.size === 0 || billIds.has(undefined) || billIds.has(null as never)) return false;
  return [...billIds].every((id) => store.getVendorBillById(id!)?.status === 'Paid');
}

const STATUS: Record<string, WsDealStatus | undefined> = { awaiting_reply: 'lead', confirmed: 'confirmed', completed: 'delivered' };

export function peakDeal(store: DataStore, assignment: CampaignAssignment, contact: Contact, currency: string) {
  const campaign = store.getCrmCampaignById(assignment.campaignId);
  if (!isVisibleAssignment(assignment, campaign)) return undefined;
  const mapped = STATUS[assignmentStatus(store, assignment)];
  if (!mapped) return undefined;
  const dto = toAssignmentDto(store, assignment, contact, currency);
  const status: WsDealStatus = mapped === 'delivered' && allPaid(store, assignment) ? 'paid' : mapped;
  const next = dto.deliverables.find((d) => d.dueDate && !['published', 'approved'].includes(d.status));
  return {
    id: `${PEAK_PREFIX}${assignment.id}`,
    source: 'peak' as const,
    title: dto.campaign.name,
    amount: dto.agreedRate,
    currency,
    status,
    startDate: dto.campaign.startDate?.slice(0, 10) ?? null,
    endDate: dto.campaign.endDate?.slice(0, 10) ?? null,
    notes: null,
    brand: dto.campaign.brand ? { id: null, name: dto.campaign.brand, archived: false } : null,
    nextDue: next ? { title: next.title, dueDate: next.dueDate!.slice(0, 10) } : null,
    updatedAt: dto.respondedAt ?? new Date(assignment.createdAt ?? Date.now()).toISOString(),
    assignment: dto,
  };
}

export type PeakDeal = NonNullable<ReturnType<typeof peakDeal>>;

/** Every Peak deal of this influencer. */
export function peakDeals(store: DataStore, companyId: string, contact: Contact, currency: string): PeakDeal[] {
  return store.influencer.assignmentIdsOf(companyId, contact.id)
    .map((id) => store.getCampaignAssignmentById(id))
    .filter((a): a is CampaignAssignment => Boolean(a))
    .map((a) => peakDeal(store, a, contact, currency))
    .filter((d): d is PeakDeal => Boolean(d));
}
