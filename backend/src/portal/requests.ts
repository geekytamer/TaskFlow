import { HttpError } from '../http';
import { influencerPlatforms, type CrmProposal, type OpportunityStage, type ProposalStatus } from '../types';
import type { CampaignRequestRecord, ProposalResponse } from './requests-store';

export const MAX_SHORTLIST = 30;

export interface CampaignBrief {
  title: string;
  objective: string;
  budget: number | null;
  startDate: string | null;
  endDate: string | null;
  platforms: string[];
  influencerIds: string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const boundedText = (value: unknown, name: string, min: number, max: number): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min || text.length > max) {
    throw new HttpError(400, `${name} must be ${min} to ${max} characters.`);
  }
  return text;
};

const optionalDate = (value: unknown, name: string): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new HttpError(400, `${name} must be a date (YYYY-MM-DD).`);
  }
  return value;
};

/** Validates the shape of a brief. Whether each shortlisted id may be requested is checked by the caller. */
export function parseBrief(body: Record<string, unknown>): CampaignBrief {
  const title = boundedText(body.title, 'title', 3, 120);
  const objective = boundedText(body.objective, 'objective', 10, 4000);

  let budget: number | null = null;
  if (body.budget !== undefined && body.budget !== null && body.budget !== '') {
    const value = Number(body.budget);
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) throw new HttpError(400, 'budget is invalid.');
    budget = value;
  }

  const startDate = optionalDate(body.startDate, 'startDate');
  const endDate = optionalDate(body.endDate, 'endDate');
  if (startDate && endDate && endDate < startDate) throw new HttpError(400, 'endDate must not be before startDate.');

  const platformsRaw = body.platforms ?? [];
  if (!Array.isArray(platformsRaw)) throw new HttpError(400, 'platforms must be a list.');
  const platforms = [...new Set(platformsRaw)].map((p) => {
    if (typeof p !== 'string' || !(influencerPlatforms as readonly string[]).includes(p)) {
      throw new HttpError(400, `Unknown platform: ${String(p).slice(0, 40)}.`);
    }
    return p;
  });

  const idsRaw = body.influencerIds ?? [];
  if (!Array.isArray(idsRaw) || idsRaw.some((id) => typeof id !== 'string')) {
    throw new HttpError(400, 'influencerIds must be a list of ids.');
  }
  const influencerIds = [...new Set(idsRaw as string[])];
  if (influencerIds.length > MAX_SHORTLIST) throw new HttpError(400, `Shortlist at most ${MAX_SHORTLIST} influencers.`);

  return { title, objective, budget, startDate, endDate, platforms, influencerIds };
}

/** What staff read on the opportunity. Carries handles, never rates. */
export function briefForStaff(input: {
  brief: CampaignBrief;
  requesterName: string;
  requesterEmail: string;
  currency: string;
  shortlist: Array<{ name: string; handle: string | null }>;
}): string {
  const { brief } = input;
  const lines = [
    `Requested in the client portal by ${input.requesterName} (${input.requesterEmail}).`,
    '',
    'Objective:',
    brief.objective,
    '',
  ];
  if (brief.startDate || brief.endDate) lines.push(`Dates: ${brief.startDate ?? 'open'} to ${brief.endDate ?? 'open'}`);
  if (brief.budget !== null) lines.push(`Budget: ${brief.budget} ${input.currency}`);
  if (brief.platforms.length) lines.push(`Platforms: ${brief.platforms.join(', ')}`);
  if (input.shortlist.length) {
    lines.push(`Shortlist: ${input.shortlist.map((i) => (i.handle ? `${i.name} (${i.handle})` : i.name)).join(', ')}`);
  }
  return lines.join('\n').trim();
}

/** Proposals a client may see. A draft is still staff's work in progress. */
export const CLIENT_VISIBLE_PROPOSALS: readonly ProposalStatus[] = ['Sent', 'Accepted', 'Declined', 'Expired'];

export type ClientProposalStatus = 'sent' | 'accepted' | 'declined' | 'expired';

export function clientProposalStatus(proposal: CrmProposal, now = new Date()): ClientProposalStatus {
  if (proposal.status === 'Accepted') return 'accepted';
  if (proposal.status === 'Declined') return 'declined';
  if (proposal.status === 'Expired') return 'expired';
  return proposal.validUntil && new Date(proposal.validUntil) < now ? 'expired' : 'sent';
}

export type ClientRequestStatus = 'in_review' | 'proposal_ready' | 'accepted' | 'closed';

/**
 * A request's status, derived on read from its opportunity and its visible
 * proposals, so it always agrees with the CRM.
 */
export function requestStatus(proposals: CrmProposal[], stage: OpportunityStage | undefined, now = new Date()): ClientRequestStatus {
  const statuses = proposals.map((p) => clientProposalStatus(p, now));
  if (statuses.includes('accepted')) return 'accepted';
  if (statuses.includes('sent')) return 'proposal_ready';
  if (stage === 'Lost' || stage === 'Cancelled' || statuses.includes('declined')) return 'closed';
  return 'in_review';
}

const iso = (value: Date | string | undefined | null) => (value ? new Date(value).toISOString() : null);

/** Allowlisted proposal: line items as staff wrote them for the client, nothing from the opportunity. */
export function toProposalDto(proposal: CrmProposal, currency: string, response: ProposalResponse | undefined, responderName: string | undefined, now = new Date()) {
  return {
    id: proposal.id,
    number: proposal.proposalNumber,
    title: proposal.title,
    status: clientProposalStatus(proposal, now),
    issueDate: iso(proposal.issueDate),
    validUntil: iso(proposal.validUntil),
    items: proposal.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    total: proposal.totalAmount,
    currency,
    respondedAt: iso(proposal.acceptedAt ?? proposal.declinedAt),
    respondedBy: response ? responderName ?? null : null,
  };
}

export function toRequestDto(
  record: CampaignRequestRecord,
  input: {
    currency: string;
    influencers: Array<{ id: string; name: string }>;
    status: ClientRequestStatus;
    proposals: Array<{ id: string; number: string; title: string; status: ClientProposalStatus }>;
  },
) {
  return {
    id: record.id,
    title: record.title,
    objective: record.objective,
    budget: record.budget,
    currency: input.currency,
    startDate: record.startDate,
    endDate: record.endDate,
    platforms: record.platforms,
    influencers: input.influencers,
    status: input.status,
    proposals: input.proposals,
    createdAt: record.createdAt,
  };
}
