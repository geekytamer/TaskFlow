import { API_BASE_URL, ApiError, apiFetch, getStoredToken } from '@/lib/api-client';

export type ProfileStatus = 'candidate' | 'listed' | 'rejected' | 'removed';
export type Tier = 'nano' | 'micro' | 'mid' | 'macro' | 'mega';

export interface DiscoverProfile {
  id: string;
  username: string;
  fullName: string | null;
  bio: string | null;
  externalUrl: string | null;
  followers: number | null;
  verified: boolean;
  isPrivate: boolean;
  category: string | null;
  engagementRate: number | null;
  hasPhoto: boolean;
  location: string | null;
  gender: 'female' | 'male' | null;
  niche: string | null;
  status: ProfileStatus;
  source: 'discovery' | 'manual';
  contactId: string | null;
  contactName: string | null;
  isRoster: boolean;
  emails: string[];
  phones: string[];
  lastFetchedAt: string | null;
  fetchError: string | null;
  tier: Tier | null;
  growth3m: number | null;
  requests: number;
}

export interface DiscoverRun {
  id: string;
  kind: 'refresh' | 'discovery';
  status: 'running' | 'done' | 'failed' | 'refused';
  startedAt: string;
  finishedAt: string | null;
  results: number;
  message: string | null;
}

export interface DiscoverSettings { hashtags: string[]; minFollowers: number; perHashtag: number }

export interface DiscoverSummary {
  counts: Record<ProfileStatus, number>;
  rosterCount: number;
  limit: number;
  resultsThisMonth: number;
  monthlyCap: number;
  apifyConfigured: boolean;
  running: DiscoverRun | null;
  runs: DiscoverRun[];
  settings: DiscoverSettings;
}

const base = (companyId: string) => `/companies/${encodeURIComponent(companyId)}/discover`;

/** Null where the directory does not exist (another company) or this user may not run it. */
export async function getDiscoverOrNull(companyId: string, status?: ProfileStatus): Promise<{ profiles: DiscoverProfile[]; summary: DiscoverSummary } | null> {
  try {
    return await apiFetch(`${base(companyId)}${status ? `?status=${status}` : ''}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) return null;
    throw error;
  }
}

export const addDiscoverHandles = (companyId: string, text: string) =>
  apiFetch<{ added: string[]; alreadyThere: string[]; skipped: string[] }>(`${base(companyId)}/handles`, { method: 'POST', body: JSON.stringify({ text }) });

export const refreshDiscover = (companyId: string) => apiFetch<DiscoverSummary>(`${base(companyId)}/refresh`, { method: 'POST' });
export const findDiscover = (companyId: string) => apiFetch<DiscoverSummary>(`${base(companyId)}/find`, { method: 'POST' });
export const saveDiscoverSettings = (companyId: string, settings: DiscoverSettings) =>
  apiFetch<DiscoverSettings>(`${base(companyId)}/settings`, { method: 'PUT', body: JSON.stringify(settings) });

export const updateDiscoverProfile = (id: string, patch: Partial<Pick<DiscoverProfile, 'status' | 'location' | 'gender' | 'niche' | 'contactId'>>) =>
  apiFetch<DiscoverProfile>(`/discover-profiles/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const addPastFollowers = (id: string, followers: number, takenAt: string) =>
  apiFetch<DiscoverProfile>(`/discover-profiles/${encodeURIComponent(id)}/history`, { method: 'POST', body: JSON.stringify({ followers, takenAt }) });

/** The stored photo as an object URL (the API needs the sign-in header, which an <img> cannot send). */
export async function discoverPhotoUrl(id: string): Promise<string | null> {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE_URL}/discover-profiles/${encodeURIComponent(id)}/photo`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}
