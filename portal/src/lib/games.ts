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
  board: Array<{ rank: number; platform: string; handle: string; points: number }>;
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

export async function getGame(slug: string): Promise<GameDetail> {
  const res = await read<GameDetail>(`/games/${encodeURIComponent(slug)}`);
  if (res.status === 404) notFound();
  if (res.status !== 200) throw new Error(`The games API answered ${res.status}.`);
  return res.data;
}
