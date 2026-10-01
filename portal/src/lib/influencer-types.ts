/** Safe in the browser: no server imports here. */
export type Availability = 'Available' | 'Partially Available' | 'Unavailable';
export const AVAILABILITY: Availability[] = ['Available', 'Partially Available', 'Unavailable'];
export const PLATFORMS = ['Instagram', 'TikTok', 'Snapchat', 'Facebook', 'YouTube', 'X', 'Other'] as const;

export interface Account {
  id: string;
  platform: string;
  handle: string | null;
  url: string | null;
  followers: number | null;
  engagementRate: number | null;
}

export interface ProfileChanges {
  niche?: string;
  location?: string;
  languages?: string[];
  rateCardAmount?: number;
  accounts?: Array<Partial<Account> & { platform: string }>;
}

export interface Profile {
  name: string;
  niche: string | null;
  location: string | null;
  languages: string[];
  availability: Availability | null;
  accounts: Account[];
  rateCard: { amount: number | null; currency: string };
  pendingChange: { id: string; changes: ProfileChanges; createdAt: string } | null;
  lastDecision: { status: 'approved' | 'rejected'; note: string | null; at: string | null } | null;
}

export type AssignmentStatus = 'awaiting_reply' | 'confirmed' | 'declined' | 'cancelled' | 'completed';
export type InfluencerDeliverableStatus = 'planned' | 'in_progress' | 'submitted' | 'approved' | 'published' | 'cancelled';

export interface SubmissionView {
  id: string;
  version: number;
  contentUrl: string | null;
  caption: string | null;
  submittedAt: string;
  feedback: { decision: 'approved' | 'changes_requested'; comment: string | null } | null;
}

export interface AssignmentDeliverable {
  id: string;
  title: string;
  platform: string | null;
  dueDate: string | null;
  status: InfluencerDeliverableStatus;
  brief: string | null;
  latestSubmission: SubmissionView | null;
  waitingFor: 'team' | 'client' | null;
  postUrl: string | null;
}

export interface Assignment {
  id: string;
  status: AssignmentStatus;
  campaign: { name: string; brand: string | null; startDate: string | null; endDate: string | null };
  agreedRate: number | null;
  currency: string;
  brief: string | null;
  deliverables: AssignmentDeliverable[];
  respondedAt: string | null;
}


export interface Payout {
  id: string;
  number: string;
  kind: 'campaign' | 'referral';
  label: string;
  items: string[];
  amount: number;
  currency: string;
  dueDate: string | null;
  status: 'pending' | 'approved' | 'paid';
  paidAt: string | null;
}
