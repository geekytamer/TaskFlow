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
  audience: 'followers' | 'creators';
  tag: string | null;
  reconciledAt: string | null;
  /** The brand the game was run for; its client portal users read the report. */
  clientContactId: string | null;
  clientName: string | null;
  /** Instagram is configured on the server, so sources can be read. */
  instagram: boolean;
  /** A likers fetcher is configured on the server. */
  likersFetcher: boolean;
  trackedAccounts: string[];
  sources: GameSource[];
  participants: GameParticipant[];
  metrics: Array<{ metricKey: string; weight: number; params: Record<string, unknown> }>;
  availableMetrics: Array<{ key: string; label: { en: string; ar: string } }>;
}

export interface GameSource {
  id: string;
  kind: 'post' | 'tags' | 'import';
  accountId: string | null;
  username: string | null;
  accountStatus: 'active' | 'needs_reconnect' | 'revoked' | null;
  permalink: string | null;
  lastCollectedAt: string | null;
  lastError: string | null;
  interactions: number;
  autoAdded: boolean;
  postedAt: string | null;
  /** A likers list on a connected post: fetched at a pace set by like speed. */
  paced: boolean;
  likeCount: number | null;
  likersFetchedAt: string | null;
  nextLikersAt: string | null;
  likersWindow: number;
  likersMissed: number;
}

export interface GameParticipant {
  contactId: string;
  name: string | null;
  username: string | null;
  accountStatus: 'active' | 'needs_reconnect' | null;
  stats: { posts: number; views: number; shares: number; engagement: number; followerGrowth: number; updatedAt: string } | null;
}

export interface GameAccount { id: string; username: string; status: 'active' | 'needs_reconnect'; contactId: string; contactName: string | null }

export interface ImportResult { total: number; added: number; removed: number; skipped: string[]; skippedCount: number }

export interface GameInput {
  slug?: string;
  name: string;
  nameAr?: string;
  rules?: string;
  rulesAr?: string;
  prize?: string;
  prizeAr?: string;
  visibility: 'public' | 'restricted';
  audience?: 'followers' | 'creators';
  tag?: string;
  startsAt: string;
  endsAt: string;
}

export interface BoardRow {
  rank: number | null;
  platform: string;
  handle: string;
  actorKey: string;
  points: number;
  breakdown?: Record<string, number>;
  /** Signals for review, never applied automatically. */
  flags?: Array<'same_text' | 'burst'>;
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
export const setGameClient = (companyId: string, id: string, contactId: string | null) => send<Game>(`${base(companyId)}/${id}/client`, 'PUT', { contactId });
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
export const listGameAccounts = (companyId: string) => apiFetch<GameAccount[]>(`/companies/${companyId}/game-accounts`);
export const addGameSource = (companyId: string, id: string, body: { kind: GameSource['kind']; accountId?: string; permalink?: string }) =>
  send<Game>(`${base(companyId)}/${id}/sources`, 'POST', body);
export const removeGameSource = (companyId: string, id: string, sourceId: string) => send<Game>(`${base(companyId)}/${id}/sources/${sourceId}`, 'DELETE');
export const importLikers = (companyId: string, id: string, sourceId: string, text: string) =>
  send<Game & { imported: ImportResult }>(`${base(companyId)}/${id}/sources/${sourceId}/likers`, 'POST', { text });
export const setParticipants = (companyId: string, id: string, contactIds: string[]) => send<Game>(`${base(companyId)}/${id}/participants`, 'PUT', contactIds);
export const collectNow = (companyId: string, id: string) => send<Game & { errors: string[] }>(`${base(companyId)}/${id}/collect`, 'POST');
export const setTrackedAccounts = (companyId: string, id: string, accountIds: string[]) => send<Game>(`${base(companyId)}/${id}/tracked-accounts`, 'PUT', accountIds);
export const fetchLikersNow = (companyId: string, id: string, sourceId: string) => send<Game>(`${base(companyId)}/${id}/sources/${sourceId}/fetch-likers`, 'POST');
