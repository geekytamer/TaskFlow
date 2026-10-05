/**
 * Who liked a post. Meta's API gives likes only as a count, so likers come from
 * an outside fetcher: a self-hosted worker or an Apify actor. Either returns a
 * window of the most recent likers, newest first, and may stop short; callers
 * treat every result as partial.
 */
export interface LikersResult {
  /** Lower-case handles, newest like first. */
  handles: string[];
  /** True only when the fetcher saw the whole list. */
  complete: boolean;
}

export interface LikersFetcher {
  fetch(permalink: string, max: number): Promise<LikersResult>;
}

const handleOf = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/^@+/, '').toLowerCase() : '');
const valid = (h: string) => /^[a-z0-9._]{1,30}$/.test(h);
const clean = (list: unknown[]) => [...new Set(list.map(handleOf).filter(valid))];

type Fetch = typeof fetch;

/**
 * A self-hosted worker: POST {postUrl, maxResults} with a shared secret,
 * answering {handles: string[] (newest first), complete: boolean}.
 */
export class WorkerLikersFetcher implements LikersFetcher {
  constructor(private readonly url: string, private readonly secret: string, private readonly http: Fetch = fetch) {}

  async fetch(permalink: string, max: number): Promise<LikersResult> {
    const res = await this.http(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.secret}` },
      body: JSON.stringify({ postUrl: permalink, maxResults: max }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Likers worker answered ${res.status}.`);
    const body = (await res.json()) as { handles?: unknown[]; complete?: boolean };
    return { handles: clean(body.handles ?? []).slice(0, max), complete: body.complete === true };
  }
}

/**
 * An Apify actor run synchronously; dataset items carry `username` and
 * `position` (1 = newest). Billed per result, so callers ask for small windows.
 */
export class ApifyLikersFetcher implements LikersFetcher {
  constructor(private readonly token: string, private readonly actorId: string, private readonly http: Fetch = fetch) {}

  async fetch(permalink: string, max: number): Promise<LikersResult> {
    const actor = encodeURIComponent(this.actorId.replace('/', '~'));
    const res = await this.http(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?format=json&clean=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ postCode: permalink, maxResults: max }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`Apify answered ${res.status}.`);
    const items = (await res.json()) as Array<{ username?: unknown; position?: unknown }>;
    const ordered = [...items].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
    return { handles: clean(ordered.map((i) => i.username)).slice(0, max), complete: false };
  }
}

/** From the environment: the worker if set, else Apify if set, else none. */
export function likersFetcherFromEnv(env = process.env): LikersFetcher | undefined {
  if (env.LIKERS_WORKER_URL && env.LIKERS_WORKER_SECRET) return new WorkerLikersFetcher(env.LIKERS_WORKER_URL, env.LIKERS_WORKER_SECRET);
  if (env.APIFY_TOKEN && env.APIFY_LIKERS_ACTOR) return new ApifyLikersFetcher(env.APIFY_TOKEN, env.APIFY_LIKERS_ACTOR);
  return undefined;
}
