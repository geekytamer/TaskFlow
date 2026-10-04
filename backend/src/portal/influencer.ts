import { v4 as uuid } from 'uuid';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import {
  influencerPlatforms,
  type CampaignAssignment,
  type CampaignDeliverable,
  type CampaignDeliverableStatus,
  type Contact,
  type CrmCampaign,
  type InfluencerAccount,
  type InfluencerPlatform,
} from '../types';
import { safeUrl } from './catalogue';
import type { ChangeRequest, ProfileChanges, Submission } from './influencer-store';
import { waitingFor } from './review-flow';
import { resultsDto } from '../social/results';
import { iso } from './common';

export const AVAILABILITY = ['Available', 'Partially Available', 'Unavailable'] as const;
const MAX_ACCOUNTS = 10;

const DELIVERABLE_STATUS: Record<CampaignDeliverableStatus, string> = {
  Planned: 'planned',
  'In Progress': 'in_progress',
  Submitted: 'submitted',
  Approved: 'approved',
  Published: 'published',
  Cancelled: 'cancelled',
};


const accountDto = (a: InfluencerAccount) => ({
  id: a.id,
  platform: a.platform,
  handle: a.handle ?? null,
  url: safeUrl(a.url),
  followers: a.followers ?? null,
  engagementRate: a.engagementRate ?? null,
});

/** A version as its author sees it: the link, and staff's decision with its comment. Never who reviewed it. */
export const submissionDto = (sub: Submission | undefined) => sub
  ? {
      id: sub.id,
      version: sub.version,
      contentUrl: safeUrl(sub.contentUrl),
      caption: sub.caption,
      submittedAt: sub.submittedAt,
      feedback: sub.staffDecision ? { decision: sub.staffDecision, comment: sub.staffComment } : null,
    }
  : null;

const changeDto = (r: ChangeRequest) => ({ id: r.id, changes: r.changes, createdAt: r.createdAt });

/** The influencer's own profile, from an allowlist. */
export function toProfileDto(store: DataStore, contact: Contact, currency: string) {
  const requests = store.influencer.changeRequests(contact.companyId, contact.id);
  const pending = requests.find((r) => r.status === 'pending');
  const decided = requests.find((r) => r.status !== 'pending');
  return {
    name: contact.name,
    niche: contact.influencerNiche ?? null,
    location: contact.location ?? null,
    languages: contact.languages ?? [],
    availability: contact.availabilityStatus ?? null,
    accounts: (contact.influencerAccounts ?? []).map(accountDto),
    rateCard: { amount: contact.rateCardAmount ?? null, currency },
    pendingChange: pending ? changeDto(pending) : null,
    lastDecision: decided ? { status: decided.status, note: decided.note, at: decided.reviewedAt } : null,
  };
}

const str = (value: unknown, field: string, max: number): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpError(400, `${field} must be 1 to ${max} characters.`);
  return value.trim();
};

const nonNegative = (value: unknown, field: string, max = Number.MAX_SAFE_INTEGER): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new HttpError(400, `${field} must be a number from 0 to ${max}.`);
  return n;
};

/** Only the fields an influencer may ask to change; anything else is refused. */
export function parseChanges(body: Record<string, unknown>, existing: InfluencerAccount[]): ProfileChanges {
  const allowed = new Set(['niche', 'location', 'languages', 'rateCardAmount', 'accounts']);
  const unknown = Object.keys(body).filter((k) => !allowed.has(k));
  if (unknown.length) throw new HttpError(400, `These fields cannot be changed here: ${unknown.join(', ')}.`);
  const changes: ProfileChanges = {};
  if (body.niche !== undefined) changes.niche = str(body.niche, 'niche', 80);
  if (body.location !== undefined) changes.location = str(body.location, 'location', 80);
  if (body.languages !== undefined) {
    if (!Array.isArray(body.languages) || body.languages.length > 10) throw new HttpError(400, 'languages must be a list of up to 10.');
    changes.languages = [...new Set(body.languages.map((l) => str(l, 'language', 40)))];
  }
  if (body.rateCardAmount !== undefined) changes.rateCardAmount = Number(nonNegative(body.rateCardAmount, 'rateCardAmount').toFixed(2));
  if (body.accounts !== undefined) {
    if (!Array.isArray(body.accounts) || body.accounts.length > MAX_ACCOUNTS) throw new HttpError(400, `accounts must be a list of up to ${MAX_ACCOUNTS}.`);
    const known = new Set(existing.map((a) => a.id));
    changes.accounts = body.accounts.map((raw) => {
      if (!raw || typeof raw !== 'object') throw new HttpError(400, 'Each account must be an object.');
      const a = raw as Record<string, unknown>;
      if (a.id !== undefined && (typeof a.id !== 'string' || !known.has(a.id))) throw new HttpError(400, 'Unknown account.');
      if (typeof a.platform !== 'string' || !influencerPlatforms.includes(a.platform as InfluencerPlatform)) throw new HttpError(400, 'Unknown platform.');
      const url = a.url === undefined || a.url === '' ? undefined : safeUrl(a.url);
      if (url === null) throw new HttpError(400, 'An account link must be an http or https address.');
      return {
        ...(a.id ? { id: a.id as string } : {}),
        platform: a.platform,
        ...(a.handle !== undefined && a.handle !== '' ? { handle: str(a.handle, 'handle', 80) } : {}),
        ...(url ? { url } : {}),
        ...(a.followers !== undefined && a.followers !== null ? { followers: Math.round(nonNegative(a.followers, 'followers')) } : {}),
        ...(a.engagementRate !== undefined && a.engagementRate !== null ? { engagementRate: nonNegative(a.engagementRate, 'engagementRate', 100) } : {}),
      };
    });
  }
  if (Object.keys(changes).length === 0) throw new HttpError(400, 'Nothing to change.');
  return changes;
}

/**
 * Applies approved changes through the normal contact update. Accounts merge by
 * id, so fields only staff keep (notes, estimates) survive; new ones are added.
 */
export function applyChanges(store: DataStore, contact: Contact, changes: ProfileChanges): void {
  const updates: Parameters<DataStore['updateContact']>[1] = {};
  if (changes.niche !== undefined) updates.influencerNiche = changes.niche;
  if (changes.location !== undefined) updates.location = changes.location;
  if (changes.languages !== undefined) updates.languages = changes.languages;
  if (changes.rateCardAmount !== undefined) updates.rateCardAmount = changes.rateCardAmount;
  if (changes.accounts !== undefined) {
    const existing = contact.influencerAccounts ?? [];
    const merged = existing.map((a) => {
      const change = changes.accounts!.find((c) => c.id === a.id);
      return change ? { ...a, ...change, id: a.id, platform: change.platform as InfluencerPlatform } : a;
    });
    for (const c of changes.accounts.filter((c) => !c.id)) {
      merged.push({ ...c, id: uuid(), platform: c.platform as InfluencerPlatform });
    }
    updates.influencerAccounts = merged;
  }
  store.updateContact(contact.id, updates);
}

/** Who a deliverable pays: the same rule vendor bill generation uses. */
export const paidContactOf = (d: CampaignDeliverable) => d.vendorContactId ?? d.contactId;

export const isVisibleAssignment = (assignment: CampaignAssignment, campaign: CrmCampaign | undefined) =>
  Boolean(campaign) && assignment.status !== 'Planned' && !campaign!.archivedAt && campaign!.status !== 'Archived';

export function assignmentStatus(store: DataStore, assignment: CampaignAssignment) {
  switch (assignment.status) {
    case 'Contacted': return 'awaiting_reply';
    case 'Confirmed': return 'confirmed';
    case 'Completed': return 'completed';
    default: return store.influencer.responseTo(assignment.id)?.decision === 'declined' ? 'declined' : 'cancelled';
  }
}

/**
 * An assignment as its influencer sees it. Their own agreed rate is shown; the
 * campaign budget, deliverable prices and costs, notes and other assignees never are.
 */
export function toAssignmentDto(store: DataStore, assignment: CampaignAssignment, contact: Contact, currency: string) {
  const campaign = store.getCrmCampaignById(assignment.campaignId)!;
  const status = assignmentStatus(store, assignment);
  const briefed = status === 'confirmed' || status === 'completed';
  const brand = campaign.contactId ? store.getContactById(campaign.contactId)?.name ?? null : null;
  const deliverables = store.listCampaignDeliverables(campaign.id)
    .filter((d) => paidContactOf(d) === contact.id && d.status !== 'Cancelled')
    .map((d) => ({
      id: d.id,
      title: d.title,
      platform: d.platform ?? null,
      dueDate: iso(d.dueDate),
      status: DELIVERABLE_STATUS[d.status],
      brief: briefed ? store.influencer.deliverableBrief(d.id) : null,
      latestSubmission: submissionDto(store.influencer.latestSubmission(d.id)),
      waitingFor: waitingFor(store, d),
      postUrl: d.status === 'Published' ? safeUrl(d.contentUrl) : null,
      results: d.status === 'Published' ? resultsDto(store, d.id) : null,
    }));
  return {
    id: assignment.id,
    status,
    campaign: { name: campaign.name, brand, startDate: iso(campaign.startDate), endDate: iso(campaign.endDate) },
    agreedRate: assignment.agreedRate ?? null,
    currency,
    brief: briefed ? store.influencer.campaignBrief(campaign.id).influencerBrief : null,
    deliverables,
    respondedAt: store.influencer.responseTo(assignment.id)?.createdAt ?? null,
  };
}
