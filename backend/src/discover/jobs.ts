import type { DataStore } from '../data/store';
import type { DiscoverScraper } from './apify';
import type { DiscoverRun } from './discover-store';
import { omaniSignal, parseHandleList } from './discover';
import type { Contact } from '../types';

/** The directory holds at most this many listed and candidate profiles. */
export const DIRECTORY_LIMIT = 200;
/** A profile is fetched again once its figures are this old. */
export const REFRESH_DAYS = 7;
/** Discovery runs on its own this often. */
export const DISCOVERY_DAYS = 30;
/** At most this many new accounts are looked up per discovery run. */
const MAX_LOOKUPS = 100;

export interface JobOptions {
  /** Apify results allowed per calendar month; a run that would pass it is refused. */
  monthlyCap: number;
  now?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function refuse(store: DataStore, companyId: string, kind: DiscoverRun['kind'], message: string): DiscoverRun {
  const run = store.discover.startRun(companyId, kind);
  store.discover.finishRun(run.id, 'refused', 0, message);
  return store.discover.runs(companyId, 1)[0];
}

const budgetMessage = (used: number, need: number, cap: number) =>
  `This would pass the monthly Apify budget: ${used} of ${cap} results used, ${need} needed. It runs again next month, or raise DISCOVER_MONTHLY_RESULTS.`;

/** A roster influencer's Instagram handle: their Instagram account, else a single-platform Instagram record. */
export function instagramHandleOf(contact: Contact): string | null {
  const fromAccount = contact.influencerAccounts?.find((a) => a.platform === 'Instagram' && (a.handle || a.url));
  const raw = fromAccount ? (fromAccount.handle || fromAccount.url) : contact.influencerPlatform === 'Instagram' ? contact.influencerHandle : null;
  return raw ? parseHandleList(raw).handles[0] ?? null : null;
}

/** Influencers whose Instagram connection works: Meta keeps their figures, so they are never scraped. */
export function connectedContactIds(store: DataStore, companyId: string): Set<string> {
  return new Set(store.social.activeAccounts(companyId).filter((a) => a.tokenSealed).map((a) => a.contactId));
}

/**
 * Keeps Peak's own influencers in the directory: every influencer of the
 * company with an Instagram handle gets a linked entry, and an entry whose
 * influencer left the roster or changed handle is unlinked. Database only.
 */
export function syncRoster(store: DataStore, companyId: string): { linked: number; unlinked: number } {
  const connected = connectedContactIds(store, companyId);
  const handles = new Map<string, string>();
  for (const contact of store.listContacts(companyId, 'Influencer')) {
    const handle = instagramHandleOf(contact);
    if (handle) handles.set(contact.id, handle);
  }
  let unlinked = 0;
  for (const p of store.discover.rosterProfiles(companyId)) {
    if (!p.contactId || handles.get(p.contactId) !== p.username) { store.discover.unlinkRoster(p.id); unlinked += 1; }
  }
  for (const [contactId, handle] of handles) {
    store.discover.linkRoster(companyId, handle, contactId);
    // Already fetched (e.g. it was in the directory before joining the roster): write back now, not next week.
    // A connected influencer's record follows the connection instead.
    const p = store.discover.byUsername(companyId, handle);
    if (p?.followers != null && p.lastFetchedAt && !connected.has(contactId)) {
      store.syncInfluencerInstagram(contactId, handle, { followers: p.followers, engagementRate: p.engagementRate }, p.lastFetchedAt);
    }
  }
  return { linked: handles.size, unlinked };
}

/** Fetches every listed or candidate profile not fetched for a week. Null when nothing is due. */
export async function refreshDue(store: DataStore, scraper: DiscoverScraper, companyId: string, opts: JobOptions): Promise<DiscoverRun | null> {
  const now = opts.now ?? new Date();
  if (store.discover.running(companyId)) return null;
  syncRoster(store, companyId);
  const connected = connectedContactIds(store, companyId);
  // Connected influencers: the directory takes the connection's latest followers instead of scraping.
  for (const p of store.discover.rosterProfiles(companyId)) {
    if (!p.contactId || !connected.has(p.contactId)) continue;
    const figure = store.social.verifiedFor(companyId, p.contactId).find((v) => v.username.toLowerCase() === p.username);
    if (figure && (!p.lastFetchedAt || p.lastFetchedAt.slice(0, 10) < figure.asOf)) store.discover.saveFromConnection(p.id, figure.followers, `${figure.asOf}T00:00:00.000Z`);
  }
  const due = store.discover.dueForRefresh(companyId, REFRESH_DAYS, DIRECTORY_LIMIT, now, [...connected]);
  if (due.length === 0) return null;
  const used = store.discover.resultsThisMonth(companyId, now);
  if (used + due.length > opts.monthlyCap) return refuse(store, companyId, 'refresh', budgetMessage(used, due.length, opts.monthlyCap));

  const run = store.discover.startRun(companyId, 'refresh');
  try {
    const fetched = await scraper.profiles(due.map((p) => p.username));
    const byName = new Map(fetched.map((p) => [p.username, p]));
    for (const profile of due) {
      const found = byName.get(profile.username);
      if (!found) { store.discover.markMissing(profile.id, 'Not found: the account may be renamed, private or deleted.', now); continue; }
      const photo = found.photoUrl ? await scraper.photo(found.photoUrl) : null;
      const saved = store.discover.saveFetched(companyId, found, photo, { status: profile.status, source: profile.source }, now);
      // Peak's own influencers: the fresh figures go onto their record too.
      if (saved.isRoster && saved.contactId) {
        store.syncInfluencerInstagram(saved.contactId, saved.username, { followers: found.followers, engagementRate: saved.engagementRate }, now.toISOString());
      }
    }
    store.discover.finishRun(run.id, 'done', fetched.length, `${fetched.length} of ${due.length} profiles updated.`);
  } catch (error) {
    store.discover.finishRun(run.id, 'failed', 0, (error as Error).message.slice(0, 300));
  }
  return store.discover.runs(companyId, 1)[0];
}

/**
 * Finds new Omani accounts: recent posts under the configured hashtags, their
 * owners looked up, and those public, over the follower threshold and with an
 * Omani signal saved as candidates for staff to approve. Known handles,
 * including removed and rejected ones, are never looked up again.
 */
export async function discoverNew(store: DataStore, scraper: DiscoverScraper, companyId: string, opts: JobOptions): Promise<DiscoverRun> {
  const now = opts.now ?? new Date();
  if (store.discover.running(companyId)) return refuse(store, companyId, 'discovery', 'Another run is in progress.');
  const room = DIRECTORY_LIMIT - store.discover.countActive(companyId);
  if (room <= 0) return refuse(store, companyId, 'discovery', `The directory is full (${DIRECTORY_LIMIT} profiles). Remove some to find new ones.`);
  const settings = store.discover.settings(companyId);
  if (settings.hashtags.length === 0) return refuse(store, companyId, 'discovery', 'Add at least one hashtag in the settings.');
  const used = store.discover.resultsThisMonth(companyId, now);
  const postResults = settings.hashtags.length * settings.perHashtag;
  if (used + postResults + 1 > opts.monthlyCap) return refuse(store, companyId, 'discovery', budgetMessage(used, postResults, opts.monthlyCap));

  const run = store.discover.startRun(companyId, 'discovery');
  let results = 0;
  try {
    const owners = await scraper.hashtagOwners(settings.hashtags, settings.perHashtag);
    results += owners.length;
    const known = store.discover.knownUsernames(companyId);
    const remaining = Math.max(0, opts.monthlyCap - used - results);
    const lookups = [...new Set(owners)].filter((h) => !known.has(h)).slice(0, Math.min(MAX_LOOKUPS, remaining));
    const profiles = await scraper.profiles(lookups);
    results += profiles.length;
    let added = 0;
    for (const p of profiles) {
      if (added >= room) break;
      if (p.isPrivate || p.followers < settings.minFollowers || !omaniSignal(p)) continue;
      const photo = p.photoUrl ? await scraper.photo(p.photoUrl) : null;
      store.discover.saveFetched(companyId, p, photo, { status: 'candidate', source: 'discovery' }, now);
      added += 1;
    }
    store.discover.finishRun(run.id, 'done', results, `${added} new candidates from ${lookups.length} accounts looked up.`);
  } catch (error) {
    store.discover.finishRun(run.id, 'failed', results, (error as Error).message.slice(0, 300));
  }
  return store.discover.runs(companyId, 1)[0];
}

/** The daily check: refresh what is due, and discover when the last discovery is a month old. */
export async function discoverTick(store: DataStore, scraper: DiscoverScraper, companyId: string, opts: JobOptions): Promise<DiscoverRun[]> {
  const now = opts.now ?? new Date();
  const out: DiscoverRun[] = [];
  const refreshed = await refreshDue(store, scraper, companyId, opts);
  if (refreshed) out.push(refreshed);
  const last = store.discover.lastRun(companyId, 'discovery');
  const discoveryDue = !last || now.getTime() - Date.parse(last.startedAt) >= DISCOVERY_DAYS * DAY_MS;
  if (discoveryDue && store.discover.countActive(companyId) < DIRECTORY_LIMIT) out.push(await discoverNew(store, scraper, companyId, opts));
  return out;
}
