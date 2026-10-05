import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Instagram API with Instagram Login (Business and Creator accounts). Graph API v26. */

export const GRAPH_VERSION = 'v26.0';
export const SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights'] as const;

export type AccountType = 'BUSINESS' | 'MEDIA_CREATOR' | 'PERSONAL';
export interface Demographics { country: Record<string, number>; age: Record<string, number>; gender: Record<string, number> }
export interface MediaFigures { views: number; likes: number; comments: number; saves: number; shares: number }

export interface MetaClient {
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string; expiresAt: Date; userId: string }>;
  refresh(token: string): Promise<{ accessToken: string; expiresAt: Date }>;
  profile(token: string): Promise<{ id: string; username: string; accountType: AccountType; followers: number; mediaCount: number }>;
  accountInsights(token: string, userId: string): Promise<{ views: number; reach: number; engagedAccounts: number; demographics: Demographics | null }>;
  mediaByPermalink(token: string, userId: string, permalink: string): Promise<{ id: string } | null>;
  mediaInsights(token: string, mediaId: string): Promise<MediaFigures>;
  /** Every comment and reply on one of the account's posts, flattened, oldest pages first. */
  mediaComments(token: string, mediaId: string): Promise<Listing<CommentRow>>;
  /** Posts by others that tag the account (how a repost of a game post is seen). */
  taggedMedia(token: string, userId: string): Promise<Listing<TaggedRow>>;
  /** The account's own posts since a date. */
  recentMedia(token: string, userId: string, since: Date): Promise<MediaRow[]>;
}

/** A list read from Meta; `truncated` when paging stopped at the cap before the end. */
export type Listing<T> = T[] & { truncated?: boolean };

export interface CommentRow { id: string; text: string; timestamp: Date; username: string; userId: string | null; parentId: string | null }
export interface TaggedRow { id: string; username: string; timestamp: Date; permalink: string; caption: string }
export interface MediaRow { id: string; permalink: string; timestamp: Date; caption: string }

type RawComment = { id: string; text?: string; timestamp: string; username?: string; from?: { id?: string; username?: string }; replies?: { data?: RawComment[] } };
const MAX_PAGES = 20;

/** Comments with their replies, flattened in order, replies right after their parent. */
const flattenComments = (rows: RawComment[]): CommentRow[] => rows.flatMap((c) => [
  { id: c.id, text: c.text ?? '', timestamp: new Date(c.timestamp), username: c.from?.username ?? c.username ?? '', userId: c.from?.id ?? null, parentId: null },
  ...(c.replies?.data ?? []).map((r) => ({ id: r.id, text: r.text ?? '', timestamp: new Date(r.timestamp), username: r.from?.username ?? r.username ?? '', userId: r.from?.id ?? null, parentId: c.id })),
]);
const toTagged = (rows: Array<{ id: string; username?: string; timestamp: string; permalink?: string; caption?: string }>): TaggedRow[] =>
  rows.map((m) => ({ id: m.id, username: m.username ?? '', timestamp: new Date(m.timestamp), permalink: m.permalink ?? '', caption: m.caption ?? '' }));
const toMedia = (rows: Array<{ id: string; permalink?: string; timestamp: string; caption?: string }>): MediaRow[] =>
  rows.map((m) => ({ id: m.id, permalink: m.permalink ?? '', timestamp: new Date(m.timestamp), caption: m.caption ?? '' }));

/** The token is invalid, expired or revoked: the account needs reconnecting. */
export class MetaAuthError extends Error {}
/** Throttled: try again on a later sweep. */
export class MetaRateLimitError extends Error {}

/** Same post, whatever the host or trailing slash or query string. */
export const samePermalink = (a: string, b: string) => {
  const norm = (u: string) => { try { const x = new URL(u); return x.pathname.replace(/\/+$/, '').toLowerCase(); } catch { return ''; } };
  return norm(a) !== '' && norm(a) === norm(b);
};

type GraphRow = { name: string; total_value?: { value?: number; breakdowns?: Array<{ results: Array<{ dimension_values: string[]; value: number }> }> }; values?: Array<{ value: number }> };
const valueOf = (rows: GraphRow[], name: string) => {
  const row = rows.find((r) => r.name === name);
  return Number(row?.total_value?.value ?? row?.values?.[0]?.value ?? 0);
};
const breakdown = (rows: GraphRow[]): Record<string, number> =>
  Object.fromEntries((rows[0]?.total_value?.breakdowns?.[0]?.results ?? []).map((r) => [r.dimension_values[0], r.value]));
const toProfile = (me: Record<string, unknown>) => ({
  id: String(me.user_id ?? me.id), username: String(me.username), accountType: String(me.account_type) as AccountType,
  followers: Number(me.followers_count ?? 0), mediaCount: Number(me.media_count ?? 0),
});
const toFigures = (rows: GraphRow[]): MediaFigures => ({
  views: valueOf(rows, 'views'), likes: valueOf(rows, 'likes'), comments: valueOf(rows, 'comments'),
  saves: valueOf(rows, 'saved'), shares: valueOf(rows, 'shares'),
});

type FetchLike = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class HttpMetaClient implements MetaClient {
  constructor(private readonly config: { appId: string; appSecret: string; fetch?: FetchLike }) {}

  private async call<T>(url: string, init?: Parameters<FetchLike>[1]): Promise<T> {
    const res = await (this.config.fetch ?? (fetch as unknown as FetchLike))(url, init);
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: number; message?: string } };
    if (body.error) {
      const code = body.error.code;
      if (code === 190 || code === 102 || res.status === 401) throw new MetaAuthError(body.error.message ?? 'Token rejected.');
      if (code === 4 || code === 17 || code === 32 || code === 613) throw new MetaRateLimitError(body.error.message ?? 'Rate limited.');
      throw new Error(`Meta API error ${code}: ${body.error.message ?? ''}`);
    }
    if (!res.ok) throw new Error(`Meta API answered ${res.status}.`);
    return body as T;
  }

  private graph(pathAndQuery: string, token: string) {
    const sep = pathAndQuery.includes('?') ? '&' : '?';
    return `https://graph.instagram.com/${GRAPH_VERSION}/${pathAndQuery}${sep}access_token=${encodeURIComponent(token)}`;
  }

  authorizeUrl(state: string, redirectUri: string) {
    const u = new URL('https://www.instagram.com/oauth/authorize');
    u.searchParams.set('client_id', this.config.appId);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', SCOPES.join(','));
    u.searchParams.set('state', state);
    return u.toString();
  }

  async exchangeCode(code: string, redirectUri: string) {
    const form = new URLSearchParams({ client_id: this.config.appId, client_secret: this.config.appSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code });
    const short = await this.call<{ access_token: string; user_id: string | number }>('https://api.instagram.com/oauth/access_token', {
      method: 'POST', body: form.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    // Short-lived (1 hour) to long-lived (60 days).
    const long = await this.call<{ access_token: string; expires_in: number }>(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(this.config.appSecret)}&access_token=${encodeURIComponent(short.access_token)}`,
    );
    return { accessToken: long.access_token, expiresAt: new Date(Date.now() + long.expires_in * 1000), userId: String(short.user_id) };
  }

  async refresh(token: string) {
    const r = await this.call<{ access_token: string; expires_in: number }>(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`,
    );
    return { accessToken: r.access_token, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
  }

  async profile(token: string) {
    return toProfile(await this.call(this.graph('me?fields=user_id,username,account_type,followers_count,media_count', token)));
  }

  async accountInsights(token: string, userId: string) {
    const totals = await this.call<{ data: GraphRow[] }>(this.graph(`${userId}/insights?metric=views,reach,accounts_engaged&period=day&metric_type=total_value`, token));
    const demo = async (by: 'country' | 'age' | 'gender') =>
      breakdown((await this.call<{ data: GraphRow[] }>(this.graph(`${userId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=${by}`, token))).data);
    let demographics: Demographics | null = null;
    try {
      demographics = { country: await demo('country'), age: await demo('age'), gender: await demo('gender') };
    } catch (error) {
      if (error instanceof MetaAuthError || error instanceof MetaRateLimitError) throw error;
      // Fewer than 100 followers: Meta has no demographics to give.
    }
    return { views: valueOf(totals.data, 'views'), reach: valueOf(totals.data, 'reach'), engagedAccounts: valueOf(totals.data, 'accounts_engaged'), demographics };
  }

  async mediaByPermalink(token: string, userId: string, permalink: string) {
    const list = await this.call<{ data: Array<{ id: string; permalink: string }> }>(this.graph(`${userId}/media?fields=id,permalink&limit=100`, token));
    const hit = list.data.find((m) => samePermalink(m.permalink, permalink));
    return hit ? { id: hit.id } : null;
  }

  async mediaInsights(token: string, mediaId: string) {
    return toFigures((await this.call<{ data: GraphRow[] }>(this.graph(`${mediaId}/insights?metric=views,likes,comments,saved,shares`, token))).data);
  }

  /** Follows `paging.next` up to MAX_PAGES so a busy post cannot run forever. */
  private async pages<T>(first: string): Promise<{ rows: T[]; truncated: boolean }> {
    const rows: T[] = [];
    let url: string | undefined = first;
    for (let i = 0; url && i < MAX_PAGES; i += 1) {
      const page: { data?: T[]; paging?: { next?: string } } = await this.call(url);
      rows.push(...(page.data ?? []));
      url = page.paging?.next;
    }
    return { rows, truncated: Boolean(url) };
  }

  async mediaComments(token: string, mediaId: string): Promise<Listing<CommentRow>> {
    const { rows, truncated } = await this.pages<RawComment>(this.graph(`${mediaId}/comments?fields=id,text,timestamp,username,from,replies{id,text,timestamp,username,from}&limit=50`, token));
    return Object.assign(flattenComments(rows), { truncated });
  }

  async taggedMedia(token: string, userId: string): Promise<Listing<TaggedRow>> {
    const { rows, truncated } = await this.pages<{ id: string; username?: string; timestamp: string; permalink?: string; caption?: string }>(this.graph(`${userId}/tags?fields=id,username,timestamp,permalink,caption&limit=50`, token));
    return Object.assign(toTagged(rows), { truncated });
  }

  async recentMedia(token: string, userId: string, since: Date) {
    const { rows } = await this.pages<{ id: string; permalink?: string; timestamp: string; caption?: string }>(this.graph(`${userId}/media?fields=id,permalink,timestamp,caption&limit=50&since=${Math.floor(since.getTime() / 1000)}`, token));
    return toMedia(rows).filter((m) => m.timestamp >= since);
  }
}

/** Recorded responses, for tests and local development without a Meta app. */
export class FixtureMetaClient implements MetaClient {
  constructor(private readonly dir: string) {}
  private read<T>(name: string): T { return JSON.parse(readFileSync(path.join(this.dir, name), 'utf8')) as T; }
  authorizeUrl(state: string, redirectUri: string) {
    return `${redirectUri}?code=fixture-code&state=${encodeURIComponent(state)}`;
  }
  async exchangeCode() { return { accessToken: 'fixture-token', expiresAt: new Date(Date.now() + 60 * 86400_000), userId: toProfile(this.read('me.json')).id }; }
  async refresh() { return { accessToken: 'fixture-token-refreshed', expiresAt: new Date(Date.now() + 60 * 86400_000) }; }
  async profile() { return toProfile(this.read('me.json')); }
  async accountInsights() {
    const country = breakdown(this.read<{ data: GraphRow[] }>('demographics-country.json').data);
    return {
      views: valueOf(this.read<{ data: GraphRow[] }>('insights-account.json').data, 'views'),
      reach: valueOf(this.read<{ data: GraphRow[] }>('insights-account.json').data, 'reach'),
      engagedAccounts: valueOf(this.read<{ data: GraphRow[] }>('insights-account.json').data, 'accounts_engaged'),
      demographics: { country, age: {}, gender: {} },
    };
  }
  async mediaByPermalink(_t: string, _u: string, permalink: string) {
    const hit = this.read<{ data: Array<{ id: string; permalink: string }> }>('media-list.json').data.find((m) => samePermalink(m.permalink, permalink));
    return hit ? { id: hit.id } : null;
  }
  async mediaInsights() { return toFigures(this.read<{ data: GraphRow[] }>('insights-media.json').data); }
  async mediaComments() { return flattenComments(this.read<{ data: RawComment[] }>('comments.json').data); }
  async taggedMedia() { return toTagged(this.read<{ data: Array<{ id: string; username?: string; timestamp: string; permalink?: string; caption?: string }> }>('tags.json').data); }
  async recentMedia(_t: string, _u: string, since: Date) {
    return toMedia(this.read<{ data: Array<{ id: string; permalink?: string; timestamp: string; caption?: string }> }>('recent-media.json').data).filter((m) => m.timestamp >= since);
  }
}
