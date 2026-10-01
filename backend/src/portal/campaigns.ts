import type {
  CampaignAssignment,
  CampaignDeliverable,
  CampaignDeliverableStatus,
  CampaignStatus,
  Contact,
  CrmCampaign,
} from '../types';
import { safeUrl } from './catalogue';
import type { DeliverableReview } from './reviews-store';

const CAMPAIGN_STATUS: Record<CampaignStatus, string> = {
  Planned: 'planned',
  Active: 'active',
  'On Hold': 'on_hold',
  Completed: 'completed',
  Cancelled: 'cancelled',
  Archived: 'archived',
};

const DELIVERABLE_STATUS: Record<CampaignDeliverableStatus, string> = {
  Planned: 'planned',
  'In Progress': 'in_progress',
  Submitted: 'ready_for_review',
  Approved: 'approved',
  Published: 'published',
  Cancelled: 'cancelled',
};

/** Content is shown once it has been handed over, never while it is a draft. */
const CONTENT_VISIBLE: readonly CampaignDeliverableStatus[] = ['Submitted', 'Approved', 'Published'];

/** Influencers are named once confirmed, so a client is never promised someone still being approached. */
const CONFIRMED: readonly CampaignAssignment['status'][] = ['Confirmed', 'Completed'];

const iso = (value: Date | string | undefined | null) => (value ? new Date(value).toISOString() : null);

/** The link a client may open for this deliverable, or null. */
export function reviewableUrl(deliverable: CampaignDeliverable): string | null {
  return CONTENT_VISIBLE.includes(deliverable.status) ? safeUrl(deliverable.contentUrl) : null;
}

export const isAwaitingReview = (deliverable: CampaignDeliverable) =>
  deliverable.status === 'Submitted' && reviewableUrl(deliverable) !== null;

const handleOf = (contact: Contact) =>
  contact.influencerAccounts?.find((a) => a.handle)?.handle ?? contact.influencerHandle ?? null;

export function toCampaignSummary(campaign: CrmCampaign, deliverables: CampaignDeliverable[], awaitingReview: number) {
  return {
    id: campaign.id,
    name: campaign.name,
    status: CAMPAIGN_STATUS[campaign.status],
    startDate: iso(campaign.startDate),
    endDate: iso(campaign.endDate),
    deliverables: { total: deliverables.length, awaitingReview },
  };
}

/**
 * Allowlisted campaign detail. Budget, notes, expenses, rates, prices, costs,
 * vendor bills and owners never appear.
 */
export function toCampaignDetail(input: {
  campaign: CrmCampaign;
  assignments: Array<{ assignment: CampaignAssignment; contact: Contact | undefined }>;
  /** `url` is what the client may open now; null hides the content (see review-flow.ts). */
  deliverables: Array<{ deliverable: CampaignDeliverable; url: string | null; influencer: Contact | undefined; review: DeliverableReview | undefined; reviewerName: string | undefined }>;
}) {
  const { campaign } = input;
  return {
    id: campaign.id,
    name: campaign.name,
    status: CAMPAIGN_STATUS[campaign.status],
    startDate: iso(campaign.startDate),
    endDate: iso(campaign.endDate),
    influencers: input.assignments
      .filter(({ assignment, contact }) => assignment.role === 'Influencer' && CONFIRMED.includes(assignment.status) && contact)
      .map(({ contact }) => ({ name: contact!.name, handle: handleOf(contact!) })),
    deliverables: input.deliverables.map(({ deliverable, url, influencer, review, reviewerName }) => ({
      id: deliverable.id,
      title: deliverable.title,
      platform: deliverable.platform ?? null,
      dueDate: iso(deliverable.dueDate),
      // Submitted work the agency has not reviewed yet still reads as in progress to the client.
      status: deliverable.status === 'Submitted' && !url ? DELIVERABLE_STATUS['In Progress'] : DELIVERABLE_STATUS[deliverable.status],
      contentUrl: url,
      publishedAt: iso(deliverable.publishedAt),
      influencer: influencer && influencer.roles?.includes('Influencer') ? influencer.name : null,
      review: review
        ? { decision: review.decision, comment: review.comment, by: reviewerName ?? null, at: review.createdAt }
        : null,
    })),
  };
}
