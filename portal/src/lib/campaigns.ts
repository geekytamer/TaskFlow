import { portalGet, portalGetOrNull } from './client-api';

export type CampaignStatus = 'planned' | 'active' | 'on_hold' | 'completed' | 'cancelled' | 'archived';
export type DeliverableStatus = 'planned' | 'in_progress' | 'ready_for_review' | 'approved' | 'published' | 'cancelled';
/** What the client sees on the badge: once they have reviewed a version, their own answer. */
export type DeliverableView = DeliverableStatus | 'you_approved' | 'changes_requested';

export function deliverableView(d: { status: DeliverableStatus; review: { decision: 'approved' | 'changes_requested' } | null }): DeliverableView {
  if (d.status === 'ready_for_review' && d.review) return d.review.decision === 'approved' ? 'you_approved' : 'changes_requested';
  return d.status;
}

export interface CampaignSummary {
  id: string;
  name: string;
  status: CampaignStatus;
  startDate: string | null;
  endDate: string | null;
  deliverables: { total: number; awaitingReview: number };
}

export interface Deliverable {
  id: string;
  title: string;
  platform: string | null;
  dueDate: string | null;
  status: DeliverableStatus;
  contentUrl: string | null;
  publishedAt: string | null;
  influencer: string | null;
  review: { decision: 'approved' | 'changes_requested'; comment: string | null; by: string | null; at: string } | null;
}

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  startDate: string | null;
  endDate: string | null;
  influencers: Array<{ name: string; handle: string | null }>;
  deliverables: Deliverable[];
}

export const getCampaigns = () => portalGet<CampaignSummary[]>('/campaigns');
export const getCampaign = (id: string) => portalGetOrNull<Campaign>(`/campaigns/${encodeURIComponent(id)}`);
