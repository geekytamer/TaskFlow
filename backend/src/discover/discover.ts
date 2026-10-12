/**
 * Pure rules for the influencer directory: no clock, network or database.
 * Callers pass `now` where time matters, so every rule is testable as is.
 */

export type Tier = 'nano' | 'micro' | 'mid' | 'macro' | 'mega';
export const TIERS: Tier[] = ['nano', 'micro', 'mid', 'macro', 'mega'];

/** Follower bands: Nano < 10k ≤ Micro < 100k ≤ Mid < 500k ≤ Macro < 1M ≤ Mega. */
export function tierOf(followers: number): Tier {
  if (followers >= 1_000_000) return 'mega';
  if (followers >= 500_000) return 'macro';
  if (followers >= 100_000) return 'mid';
  if (followers >= 10_000) return 'micro';
  return 'nano';
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Growth needs a snapshot at least this old; the one nearest 90 days ago is the base. */
const MIN_HISTORY_DAYS = 75;

/**
 * Percent change in followers over about three months, one decimal, or null
 * when there is no snapshot old enough (the card then says "New").
 */
export function growthOver3Months(snapshots: Array<{ followers: number; takenAt: string }>, now = new Date()): number | null {
  if (snapshots.length < 2) return null;
  const sorted = [...snapshots].sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt));
  const latest = sorted[sorted.length - 1];
  const ageDays = (s: { takenAt: string }) => (now.getTime() - Date.parse(s.takenAt)) / DAY_MS;
  const old = sorted.filter((s) => ageDays(s) >= MIN_HISTORY_DAYS);
  if (old.length === 0) return null;
  const base = old.reduce((best, s) => (Math.abs(ageDays(s) - 90) < Math.abs(ageDays(best) - 90) ? s : best));
  if (!(base.followers > 0)) return null;
  return Math.round(((latest.followers - base.followers) / base.followers) * 1000) / 10;
}

/** Average likes plus comments of the recent posts, as a percent of followers, two decimals. */
export function engagementRate(followers: number, posts: Array<{ likes: number; comments: number }>): number | null {
  if (!(followers > 0) || posts.length === 0) return null;
  const avg = posts.reduce((sum, p) => sum + (p.likes || 0) + (p.comments || 0), 0) / posts.length;
  return Math.round((avg / followers) * 10_000) / 100;
}

/** Omani places as people write them, in English and Arabic, with the name shown on cards. */
const PLACES: Array<{ name: string; words: RegExp }> = [
  { name: 'Muscat', words: /\bmuscat\b|\bmasqat\b|مسقط/i },
  { name: 'Salalah', words: /\bsalalah\b|صلالة/i },
  { name: 'Sohar', words: /\bsohar\b|صحار/i },
  { name: 'Nizwa', words: /\bnizwa\b|نزوى/i },
  { name: 'Sur', words: /\bsur\b(?!f)|صور/i },
  { name: 'Ibri', words: /\bibri\b|عبري/i },
  { name: 'Barka', words: /\bbarka\b|بركاء/i },
  { name: 'Rustaq', words: /\brustaq\b|الرستاق/i },
  { name: 'Duqm', words: /\bduqm\b|الدقم/i },
  { name: 'Khasab', words: /\bkhasab\b|خصب/i },
  { name: 'Shinas', words: /\bshinas\b|شناص/i },
  { name: 'Ibra', words: /\bibra\b|إبراء/i },
];

const OMAN = /🇴🇲|\boman\b|\bomani\b|عمان|عُمان|عماني|عمانية|\+?968[\s-]?\d/i;

/** True when the name or bio says the account is Omani: the flag, Oman, an Omani place, or a +968 number. */
export function omaniSignal(profile: { bio?: string | null; fullName?: string | null }): boolean {
  const text = `${profile.fullName ?? ''}\n${profile.bio ?? ''}`;
  return OMAN.test(text) || PLACES.some((p) => p.words.test(text));
}

/** The first Omani place a bio names, for the location filter; staff can change it. */
export function locationFromBio(bio: string | null | undefined): string | null {
  if (!bio) return null;
  return PLACES.find((p) => p.words.test(bio))?.name ?? null;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// +968 then 8 digits, or a bare Omani 8-digit number starting 2, 7 or 9 (mobiles and landlines).
const PHONE = /(?:\+?968[\s-]?)?(?<![\d])[279]\d{3}[\s-]?\d{4}(?![\d])/g;

/** Emails and phone numbers written in a bio. Peak staff only: clients never see them. */
export function bioContacts(bio: string | null | undefined): { emails: string[]; phones: string[] } {
  if (!bio) return { emails: [], phones: [] };
  const emails = [...new Set((bio.match(EMAIL) ?? []).map((e) => e.toLowerCase()))];
  const phones = [...new Set((bio.match(PHONE) ?? []).map((p) => {
    const digits = p.replace(/[^\d+]/g, '');
    return digits.startsWith('968') ? `+${digits}` : digits;
  }))];
  return { emails, phones };
}

const HANDLE = /^[a-z0-9._]{1,30}$/;

/** Handles from pasted text: one per line or comma, with or without @, or as profile links. */
export function parseHandleList(raw: string): { handles: string[]; skipped: string[] } {
  const handles = new Set<string>();
  const skipped: string[] = [];
  for (const piece of raw.split(/[\n,]+/)) {
    const line = piece.trim();
    if (!line) continue;
    const fromLink = line.match(/instagram\.com\/([A-Za-z0-9._]+)/i)?.[1];
    const candidate = (fromLink ?? line).replace(/^@+/, '').replace(/\/+$/, '').toLowerCase();
    if (HANDLE.test(candidate)) handles.add(candidate);
    else skipped.push(line);
  }
  return { handles: [...handles], skipped };
}

/**
 * The bio as clients see it: emails, phone numbers, WhatsApp and Snapchat
 * contact lines hidden, so every deal goes through Peak.
 */
export function maskContacts(bio: string | null | undefined): string | null {
  if (!bio) return null;
  return bio
    .replace(EMAIL, '•••')
    .replace(PHONE, '•••')
    .replace(/(?:\+?\d[\d\s-]{6,}\d)/g, '•••');
}
