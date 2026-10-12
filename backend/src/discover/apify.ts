/**
 * Where the directory's figures come from: Apify's maintained Instagram
 * scrapers, run with Peak's token. TaskFlow starts a run, waits for it and
 * reads its dataset; Apify does the collecting. Billed per result, so callers
 * count results against a monthly budget.
 */

export interface ScrapedProfile {
  username: string;
  fullName: string | null;
  bio: string | null;
  externalUrl: string | null;
  followers: number;
  following: number;
  posts: number;
  verified: boolean;
  isBusiness: boolean;
  isPrivate: boolean;
  category: string | null;
  photoUrl: string | null;
  /** Likes and comments of the latest posts (up to 12). */
  recentPosts: Array<{ likes: number; comments: number }>;
}

export interface DiscoverScraper {
  /** Public profiles for these handles; missing or private accounts are simply absent. */
  profiles(usernames: string[]): Promise<ScrapedProfile[]>;
  /** Owners of recent posts under these hashtags (lower-case handles, may repeat). */
  hashtagOwners(hashtags: string[], perHashtag: number): Promise<string[]>;
  /** Image bytes for a profile photo, or null when it cannot be fetched. */
  photo(url: string): Promise<{ bytes: Buffer; type: string } | null>;
}

export const PROFILE_ACTOR = 'apify/instagram-profile-scraper';
export const HASHTAG_ACTOR = 'apify/instagram-hashtag-scraper';

type Fetch = typeof fetch;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const handle = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/^@+/, '').toLowerCase() : '');
const MAX_PHOTO_BYTES = 400_000;

/** A profile picture's bytes, or null when it cannot be fetched or is not a reasonable image. */
export async function downloadImage(url: string, http: Fetch = fetch): Promise<{ bytes: Buffer; type: string } | null> {
  try {
    const res = await http(url, { signal: AbortSignal.timeout(30_000) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return bytes.length > 0 && bytes.length <= MAX_PHOTO_BYTES ? { bytes, type } : null;
  } catch {
    return null;
  }
}

/** One profile scraper item in our shape; null when it is not a usable public profile. */
export function toScrapedProfile(item: Record<string, unknown>): ScrapedProfile | null {
  const username = handle(item.username);
  if (!username || item.error) return null;
  const posts = Array.isArray(item.latestPosts) ? (item.latestPosts as Array<Record<string, unknown>>) : [];
  return {
    username,
    fullName: str(item.fullName),
    bio: str(item.biography),
    externalUrl: str(item.externalUrl),
    followers: num(item.followersCount),
    following: num(item.followsCount),
    posts: num(item.postsCount),
    verified: item.verified === true,
    isBusiness: item.isBusinessAccount === true,
    isPrivate: item.private === true,
    category: str(item.businessCategoryName),
    photoUrl: str(item.profilePicUrlHD) ?? str(item.profilePicUrl),
    recentPosts: posts.slice(0, 12).map((p) => ({ likes: Math.max(0, num(p.likesCount)), comments: Math.max(0, num(p.commentsCount)) })),
  };
}

export class ApifyScraper implements DiscoverScraper {
  constructor(
    private readonly token: string,
    private readonly http: Fetch = fetch,
    private readonly pollMs = 5_000,
    private readonly maxWaitMs = 20 * 60_000,
  ) {}

  private headers() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` };
  }

  /** Starts an actor run, waits for it to finish and returns its dataset items. */
  private async run(actor: string, input: unknown): Promise<Array<Record<string, unknown>>> {
    const id = encodeURIComponent(actor.replace('/', '~'));
    const started = await this.http(`https://api.apify.com/v2/acts/${id}/runs`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(input), signal: AbortSignal.timeout(60_000),
    });
    if (!started.ok) throw new Error(`Apify did not start ${actor} (${started.status}).`);
    let run = ((await started.json()) as { data: { id: string; status: string; defaultDatasetId: string } }).data;
    const deadline = Date.now() + this.maxWaitMs;
    while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
      if (Date.now() > deadline) throw new Error(`Apify run of ${actor} did not finish in time.`);
      await new Promise((r) => setTimeout(r, this.pollMs));
      const res = await this.http(`https://api.apify.com/v2/actor-runs/${run.id}`, { headers: this.headers(), signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`Apify run status unavailable (${res.status}).`);
      run = ((await res.json()) as { data: typeof run }).data;
    }
    if (run.status !== 'SUCCEEDED') throw new Error(`Apify run of ${actor} ended ${run.status}.`);
    const items = await this.http(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?clean=true&format=json`, {
      headers: this.headers(), signal: AbortSignal.timeout(120_000),
    });
    if (!items.ok) throw new Error(`Apify results unavailable (${items.status}).`);
    return (await items.json()) as Array<Record<string, unknown>>;
  }

  async profiles(usernames: string[]): Promise<ScrapedProfile[]> {
    if (usernames.length === 0) return [];
    const items = await this.run(PROFILE_ACTOR, { usernames });
    return items.map(toScrapedProfile).filter((p): p is ScrapedProfile => p !== null);
  }

  async hashtagOwners(hashtags: string[], perHashtag: number): Promise<string[]> {
    if (hashtags.length === 0) return [];
    const items = await this.run(HASHTAG_ACTOR, { hashtags, resultsLimit: perHashtag, resultsType: 'posts' });
    return items.map((i) => handle(i.ownerUsername)).filter(Boolean);
  }

  async photo(url: string) {
    return downloadImage(url, this.http);
  }
}

/** A tiny 1x1 PNG, the fixture photo. */
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

/**
 * Local development and tests: a fixed set of Omani accounts and one
 * non-Omani one, so the whole flow runs without an Apify account.
 */
export class FixtureScraper implements DiscoverScraper {
  calls: Array<{ kind: 'profiles' | 'hashtags'; count: number; usernames?: string[] }> = [];
  constructor(private readonly accounts: ScrapedProfile[] = FIXTURE_ACCOUNTS) {}

  async profiles(usernames: string[]) {
    this.calls.push({ kind: 'profiles', count: usernames.length, usernames: [...usernames] });
    const wanted = new Set(usernames);
    return this.accounts.filter((a) => wanted.has(a.username));
  }

  async hashtagOwners(_hashtags: string[], perHashtag: number) {
    this.calls.push({ kind: 'hashtags', count: perHashtag });
    return this.accounts.map((a) => a.username);
  }

  async photo() {
    return { bytes: PIXEL, type: 'image/png' };
  }
}

const fx = (username: string, fullName: string, bio: string, followers: number, likes: number): ScrapedProfile => ({
  username, fullName, bio, externalUrl: null, followers, following: 300, posts: 400, verified: false, isBusiness: true,
  isPrivate: false, category: 'Blogger', photoUrl: `https://example.invalid/${username}.jpg`,
  recentPosts: Array.from({ length: 6 }, (_, i) => ({ likes: likes + i * 10, comments: Math.round(likes / 20) })),
});

export const FIXTURE_ACCOUNTS: ScrapedProfile[] = [
  fx('muscat.eats', 'Muscat Eats', 'Food in Muscat 🇴🇲 | hello@muscateats.om', 248_000, 6_200),
  fx('salalah.travels', 'Salalah Travels', 'Khareef every year 🌿 Salalah', 96_500, 3_100),
  fx('omani.fashion', 'Noor | Fashion', 'عمانية 🇴🇲 أزياء وجمال | +968 9123 4567', 1_180_000, 21_000),
  fx('nizwa.cars', 'Nizwa Cars', 'Cars and reviews from Nizwa', 54_300, 900),
  fx('dubai.lifestyle', 'Dubai Lifestyle', 'Luxury in Dubai', 410_000, 5_000),
];

/** From the environment: fixtures for local development, Apify with a token, else none. */
export function discoverScraperFromEnv(env = process.env): DiscoverScraper | undefined {
  if (env.DISCOVER_FIXTURES === '1') return new FixtureScraper();
  if (env.APIFY_TOKEN) return new ApifyScraper(env.APIFY_TOKEN);
  return undefined;
}
