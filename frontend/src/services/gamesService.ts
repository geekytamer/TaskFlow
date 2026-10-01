import { ApiError, apiFetch } from '@/lib/api-client';

export type GameStatus = 'draft' | 'scheduled' | 'live' | 'ended' | 'archived';

export interface Game {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  rules: string | null;
  rulesAr: string | null;
  prize: string | null;
  prizeAr: string | null;
  visibility: 'public' | 'restricted';
  startsAt: string;
  endsAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
  frozenAt: string | null;
  status: GameStatus;
  metrics: Array<{ metricKey: string; weight: number; params: Record<string, unknown> }>;
  availableMetrics: Array<{ key: string; label: { en: string; ar: string } }>;
}

export interface GameInput {
  slug?: string;
  name: string;
  nameAr?: string;
  rules?: string;
  rulesAr?: string;
  prize?: string;
  prizeAr?: string;
  visibility: 'public' | 'restricted';
  startsAt: string;
  endsAt: string;
}

export interface BoardRow {
  rank: number | null;
  platform: string;
  handle: string;
  actorKey: string;
  points: number;
  excluded: 'exclude' | 'disqualify' | null;
  excludedReason: string | null;
}

export interface AwardRow { id: string; actorKey: string; actorHandle: string; points: number; reason: string; by: string | null; createdAt: string }

const base = (companyId: string) => `/companies/${companyId}/games`;
const send = <T>(path: string, method: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

/** Null when games are not available here: not the portal company (404) or not an admin (403). */
export async function listGamesOrNull(companyId: string): Promise<Game[] | null> {
  try {
    return await apiFetch<Game[]>(base(companyId));
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) return null;
    throw error;
  }
}

export const createGame = (companyId: string, input: GameInput) => send<Game>(base(companyId), 'POST', input);
export const updateGame = (companyId: string, id: string, input: Partial<GameInput>) => send<Game>(`${base(companyId)}/${id}`, 'PATCH', input);
export const setGameMetrics = (companyId: string, id: string, metrics: Array<{ metricKey: string; weight: number; params: Record<string, unknown> }>) =>
  send<Game>(`${base(companyId)}/${id}/metrics`, 'PUT', metrics);
export const publishGame = (companyId: string, id: string) => send<Game>(`${base(companyId)}/${id}/publish`, 'POST');
export const archiveGame = (companyId: string, id: string) => send<Game>(`${base(companyId)}/${id}/archive`, 'POST');
export const reopenGame = (companyId: string, id: string, reason: string, endsAt: string) => send<Game>(`${base(companyId)}/${id}/reopen`, 'POST', { reason, endsAt });
export const awardPoints = (companyId: string, id: string, body: { platform: string; handle: string; points: number; reason: string }) =>
  send<AwardRow>(`${base(companyId)}/${id}/awards`, 'POST', body);
export const listAwards = (companyId: string, id: string) => apiFetch<AwardRow[]>(`${base(companyId)}/${id}/awards`);
export const setActorRule = (companyId: string, id: string, body: { platform: string; handle: string; kind: 'exclude' | 'disqualify'; reason: string }) =>
  send<{ actorKey: string }>(`${base(companyId)}/${id}/actor-rules`, 'POST', body);
export const removeActorRule = (companyId: string, id: string, actorKey: string) =>
  apiFetch<void>(`${base(companyId)}/${id}/actor-rules/${encodeURIComponent(actorKey)}`, { method: 'DELETE' });
export const getScoreboard = (companyId: string, id: string) => apiFetch<BoardRow[]>(`${base(companyId)}/${id}/scoreboard`);
