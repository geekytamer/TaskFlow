import type { Contact, InfluencerAccount, InfluencerPlatform } from '../types';

/** An account read from a pasted link or handle. */
export interface ParsedAccount {
  platform: InfluencerPlatform;
  handle: string;
  url: string;
}

const HANDLE = /^[a-z0-9._-]{1,50}$/;

/** Each platform's site and how its profile links name the account. */
const SITES: Array<{ platform: InfluencerPlatform; hosts: RegExp; handle: RegExp; url: (h: string) => string; notProfiles?: string[] }> = [
  { platform: 'Instagram', hosts: /(^|\.)instagram\.com$/, handle: /^\/([^/?#]+)/, url: (h) => `https://www.instagram.com/${h}/`,
    notProfiles: ['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'direct'] },
  { platform: 'TikTok', hosts: /(^|\.)tiktok\.com$/, handle: /^\/@([^/?#]+)/, url: (h) => `https://www.tiktok.com/@${h}` },
  { platform: 'Snapchat', hosts: /(^|\.)snapchat\.com$/, handle: /^\/(?:add\/|@)([^/?#]+)/, url: (h) => `https://www.snapchat.com/add/${h}` },
  { platform: 'YouTube', hosts: /(^|\.)youtube\.com$/, handle: /^\/@([^/?#]+)/, url: (h) => `https://www.youtube.com/@${h}` },
  { platform: 'X', hosts: /(^|\.)(x|twitter)\.com$/, handle: /^\/([^/?#]+)/, url: (h) => `https://x.com/${h}`,
    notProfiles: ['home', 'i', 'search', 'explore', 'intent', 'share'] },
  { platform: 'Facebook', hosts: /(^|\.)facebook\.com$/, handle: /^\/([^/?#]+)/, url: (h) => `https://www.facebook.com/${h}`,
    notProfiles: ['watch', 'groups', 'events', 'share', 'profile.php', 'reel', 'photo', 'story.php'] },
];

const asUrl = (raw: string): URL | null => {
  try { return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
};

/** The platform whose site the text links to, if any. */
const siteOf = (raw: string) => {
  const host = asUrl(raw)?.hostname.toLowerCase();
  return host ? SITES.find((s) => s.hosts.test(host)) : undefined;
};

/**
 * A profile link of a known platform, or a bare handle (with or without @),
 * which means Instagram: the platform the directory fetches. Post links, other
 * sites and anything that is not a handle give null. Handles can look like
 * domains (omani.fashion), so only a known site's host makes text a link.
 */
export function parseAccountLink(raw: string): ParsedAccount | null {
  const text = raw.trim();
  if (!text) return null;
  const url = asUrl(text);
  const site = siteOf(text);
  if (url && site) {
    const handle = url.pathname.match(site.handle)?.[1]?.toLowerCase();
    if (!handle || site.notProfiles?.includes(handle) || !HANDLE.test(handle)) return null;
    return { platform: site.platform, handle, url: site.url(handle) };
  }
  if (/^https?:\/\//i.test(text)) return null;
  const handle = text.replace(/^@+/, '').toLowerCase();
  if (!handle || !HANDLE.test(handle)) return null;
  return { platform: 'Instagram', handle, url: SITES[0].url(handle) };
}

/**
 * Quick-add text: one influencer per line; the links on a line are that
 * person's accounts and the other words their name. A bare word is a handle
 * only when written with @ or alone on its line, so a name is never read as
 * handles.
 */
export function parseQuickAddText(text: string): Array<{ line: string; name: string | null; accounts: ParsedAccount[] }> {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const tokens = line.split(/[\s,]+/).filter(Boolean);
      const accounts: ParsedAccount[] = [];
      const words: string[] = [];
      for (const token of tokens) {
        const linkLike = tokens.length === 1 || token.startsWith('@') || siteOf(token) !== undefined;
        const account = linkLike ? parseAccountLink(token) : null;
        if (!account) { words.push(token); continue; }
        if (!accounts.some((a) => a.platform === account.platform && a.handle === account.handle)) accounts.push(account);
      }
      const name = accounts.length ? words.join(' ').trim() || null : null;
      return { line, name, accounts };
    });
}

/** `platform:handle`, the identity of an account across records. */
export const keyOf = (platform: string, handle: string) => `${platform.toLowerCase()}:${handle}`;

/** The handle of an account as typed on a record: its handle, else read from its link. */
function handleFrom(platform: string | undefined, handle: string | undefined, url: string | undefined): string | null {
  for (const raw of [handle, url]) {
    if (!raw?.trim()) continue;
    const parsed = parseAccountLink(raw);
    if (parsed && (!platform || platform === 'Other' || parsed.platform === platform || !/[./]/.test(raw))) return parsed.handle;
  }
  return null;
}

type AccountHolder = Pick<Contact, 'influencerPlatform' | 'influencerHandle'> & { influencerAccounts?: Array<Partial<InfluencerAccount>> };

/** The keys of every account on a record: its accounts and its single-platform fields. */
export function accountKeys(contact: AccountHolder): Set<string> {
  const keys = new Set<string>();
  const add = (platform: string | undefined, handle: string | undefined, url?: string) => {
    if (!platform) return;
    const h = handleFrom(platform, handle, url);
    if (h) keys.add(keyOf(platform, h));
  };
  for (const a of contact.influencerAccounts ?? []) add(a.platform, a.handle, a.url);
  add(contact.influencerPlatform, contact.influencerHandle);
  return keys;
}

type Candidate = AccountHolder & { id: string; name: string; roles?: string[] };

/** Another influencer that already has one of these keys, else null. */
export function findHandleClash<T extends Candidate>(contacts: T[], keys: Iterable<string>, exceptId?: string): { contact: T; key: string } | null {
  const wanted = new Set(keys);
  if (wanted.size === 0) return null;
  for (const contact of contacts) {
    if (contact.id === exceptId || !contact.roles?.includes('Influencer')) continue;
    for (const key of accountKeys(contact)) if (wanted.has(key)) return { contact, key };
  }
  return null;
}

const PLATFORM_NAMES: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', snapchat: 'Snapchat', youtube: 'YouTube', x: 'X', facebook: 'Facebook', other: 'another platform' };

/** "@x on Instagram is already on Ahmed's record." */
export function clashMessage(key: string, name: string): string {
  const [platform, handle] = key.split(/:(.*)/s);
  return `@${handle} on ${PLATFORM_NAMES[platform] ?? platform} is already on ${name}'s record.`;
}
