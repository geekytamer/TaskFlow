import { notFound } from 'next/navigation';
import { getHost } from './audience';
import { publicFetch } from './backend';
import { portalFetch } from './client-api';

export type GameStatus = 'scheduled' | 'live' | 'ended';

export interface GameSummary {
  slug: string;
  name: string;
  nameAr: string | null;
  status: GameStatus;
  startsAt: string;
  endsAt: string;
  prize: string | null;
  prizeAr: string | null;
}

export interface GameDetail extends GameSummary {
  rules: string | null;
  rulesAr: string | null;
  metrics: Array<{ key: string; label: { en: string; ar: string } | null; weight: number; params: Record<string, number | boolean> }>;
  frozen: boolean;
  audience: 'followers' | 'creators';
  tag: string | null;
  playOn: Array<{ kind: 'comment' | 'like' | 'tag'; url: string; handle: string | null }>;
  updatedAt: string | null;
  players: number;
  board: Array<{ rank: number; platform: string; handle: string; points: number }>;
  /** Present when a handle was looked up; null when it has no points. */
  you?: { rank: number; handle: string; points: number } | null;
}

export interface MyStanding {
  participating: boolean;
  connected?: boolean;
  tag?: string | null;
  rank?: number | null;
  points?: number;
  stats?: { posts: number; views: number; shares: number; engagement: number; followerGrowth: number; updatedAt: string } | null;
}

/**
 * The lobby reads the public API on the lobby host and the portal API (which
 * adds restricted games the visitor may see) inside the portals.
 */
async function read<T>(path: string): Promise<{ status: number; data: T }> {
  return getHost() === 'lobby' ? publicFetch<T>(path) : portalFetch<T>(path);
}

export async function getGames(): Promise<GameSummary[]> {
  const res = await read<GameSummary[]>('/games');
  if (res.status !== 200) throw new Error(`The games API answered ${res.status}.`);
  return res.data;
}

export async function getGame(slug: string, handle?: string): Promise<GameDetail> {
  const query = handle ? `?handle=${encodeURIComponent(handle)}` : '';
  const res = await read<GameDetail>(`/games/${encodeURIComponent(slug)}${query}`);
  if (res.status === 404) notFound();
  if (res.status !== 200) throw new Error(`The games API answered ${res.status}.`);
  // An API from before live metrics (mid-deploy, or a cached answer) lacks these.
  return { audience: 'followers', tag: null, playOn: [], updatedAt: null, players: res.data.board?.length ?? 0, ...res.data };
}

/** The signed-in influencer's own figures in a creators game; null anywhere else. */
export async function getMyStanding(slug: string): Promise<MyStanding | null> {
  if (getHost() !== 'influencer') return null;
  const res = await portalFetch<MyStanding>(`/games/${encodeURIComponent(slug)}/me`);
  return res.status === 200 ? res.data : null;
}
