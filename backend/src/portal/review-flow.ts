import type { DataStore } from '../data/store';
import type { CampaignDeliverable } from '../types';
import { reviewableUrl } from './campaigns';
import { safeUrl } from './catalogue';

/**
 * Where a deliverable stands in the review loop. Every audience reads it from
 * here, so the influencer, the client and staff can never disagree about it.
 *
 * Influencer-submitted work is reviewed by staff first; the client sees it only
 * once staff approve it. Content staff entered by hand (no submissions) keeps
 * the original rule: visible once it is submitted.
 */
export function clientVisibleUrl(store: DataStore, deliverable: CampaignDeliverable): string | null {
  const latest = store.influencer.latestSubmission(deliverable.id);
  if (latest && deliverable.status === 'Submitted') {
    return latest.staffDecision === 'approved' ? safeUrl(latest.contentUrl) : null;
  }
  return reviewableUrl(deliverable);
}

export const clientApprovalRequired = (store: DataStore, campaignId: string) =>
  store.influencer.campaignBrief(campaignId).requireClientApproval;

/** Who the influencer is waiting for, if anyone. */
export function waitingFor(store: DataStore, deliverable: CampaignDeliverable): 'team' | 'client' | null {
  if (deliverable.status !== 'Submitted') return null;
  const latest = store.influencer.latestSubmission(deliverable.id);
  if (!latest || latest.staffDecision === null) return 'team';
  return latest.staffDecision === 'approved' ? 'client' : null;
}
