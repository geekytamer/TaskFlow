import { portalGet, portalGetOrNull } from './client-api';
import type { PortalFile } from './files';

export type RequestStatus = 'in_review' | 'proposal_ready' | 'accepted' | 'closed';
export type ProposalStatus = 'sent' | 'accepted' | 'declined' | 'expired';

export interface ProposalSummary {
  id: string;
  number: string;
  title: string;
  status: ProposalStatus;
}

export interface CampaignRequest {
  id: string;
  title: string;
  objective: string;
  budget: number | null;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  platforms: string[];
  influencers: Array<{ id: string; name: string }>;
  status: RequestStatus;
  proposals: ProposalSummary[];
  files: PortalFile[];
  createdAt: string;
}

export interface Proposal extends ProposalSummary {
  issueDate: string | null;
  validUntil: string | null;
  items: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number }>;
  total: number;
  currency: string;
  respondedAt: string | null;
  respondedBy: string | null;
}

export const getRequests = () => portalGet<CampaignRequest[]>('/requests');
export const getRequest = (id: string) => portalGetOrNull<CampaignRequest>(`/requests/${encodeURIComponent(id)}`);
export const getProposals = () => portalGet<Proposal[]>('/proposals');
export const getProposal = (id: string) => portalGetOrNull<Proposal>(`/proposals/${encodeURIComponent(id)}`);
