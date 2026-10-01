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

export interface Assignment {
  id: string;
  status: AssignmentStatus;
  campaign: { name: string; brand: string | null; startDate: string | null; endDate: string | null };
  agreedRate: number | null;
  currency: string;
  brief: string | null;
  deliverables: Array<{ id: string; title: string; platform: string | null; dueDate: string | null; status: InfluencerDeliverableStatus; brief: string | null }>;
  respondedAt: string | null;
}

