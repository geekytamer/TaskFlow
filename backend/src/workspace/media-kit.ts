import type Database from 'better-sqlite3';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { Contact } from '../types';
import type { Owner } from './workspace-store';

/**
 * The influencer's media kit: a public page brands can be sent to. It shows
 * only what the influencer chose (headline, bio, contact email, the brands they
 * pick, their numbers) and only once published. Numbers from a connected
 * account are shown as verified and replace typed ones for that platform.
 */

export const KIT_PLATFORMS = ['Instagram', 'TikTok', 'Snapchat', 'Facebook', 'YouTube', 'X', 'Other'] as const;
export interface ManualStat { platform: (typeof KIT_PLATFORMS)[number]; handle: string | null; followers: number | null; engagementRate: number | null }
export interface MediaKit {
  slug: string; published: boolean; headline: string | null; bio: string | null; contactEmail: string | null;
  featuredContactIds: string[]; manualStats: ManualStat[]; updatedAt: string | null;
}

const SLUG = /^[a-z0-9][a-z0-9-]{2,39}$/;

export class MediaKitStore {
  constructor(private readonly db: Database.Database) {}

  get(o: Owner): MediaKit | undefined {
    const row = this.db.prepare('SELECT * FROM ws_media_kits WHERE companyId = ? AND ownerContactId = ?').get(o.companyId, o.ownerContactId) as Record<string, unknown> | undefined;
    return row ? decode(row) : undefined;
  }

  bySlug(companyId: string, slug: string): (MediaKit & { ownerContactId: string }) | undefined {
    const row = this.db.prepare('SELECT * FROM ws_media_kits WHERE companyId = ? AND slug = ?').get(companyId, slug) as Record<string, unknown> | undefined;
    return row ? { ...decode(row), ownerContactId: String(row.ownerContactId) } : undefined;
  }

  save(o: Owner, kit: MediaKit): void {
    this.db.prepare(
      `INSERT INTO ws_media_kits (companyId, ownerContactId, slug, published, headline, bio, contactEmail, featuredContactIds, manualStats, updatedAt)
       VALUES (@companyId, @ownerContactId, @slug, @published, @headline, @bio, @contactEmail, @featured, @stats, @updatedAt)
       ON CONFLICT (companyId, ownerContactId) DO UPDATE SET slug = excluded.slug, published = excluded.published, headline = excluded.headline,
         bio = excluded.bio, contactEmail = excluded.contactEmail, featuredContactIds = excluded.featuredContactIds,
         manualStats = excluded.manualStats, updatedAt = excluded.updatedAt`,
    ).run({
      ...o, slug: kit.slug, published: kit.published ? 1 : 0, headline: kit.headline, bio: kit.bio, contactEmail: kit.contactEmail,
      featured: JSON.stringify(kit.featuredContactIds), stats: JSON.stringify(kit.manualStats), updatedAt: new Date().toISOString(),
    });
  }
}

const decode = (row: Record<string, unknown>): MediaKit => ({
  slug: String(row.slug), published: Boolean(row.published), headline: (row.headline as string) ?? null, bio: (row.bio as string) ?? null,
  contactEmail: (row.contactEmail as string) ?? null, featuredContactIds: JSON.parse(String(row.featuredContactIds)),
  manualStats: JSON.parse(String(row.manualStats)), updatedAt: (row.updatedAt as string) ?? null,
});

/** A free slug from the influencer's name: "Lina Haddad" → "lina-haddad", then "lina-haddad-2"… */
export function suggestSlug(store: DataStore, companyId: string, name: string): string {
  const base = name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'creator';
  const padded = base.length < 3 ? `${base}-kit` : base;
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? padded : `${padded}-${n}`;
    if (!store.mediaKits.bySlug(companyId, candidate)) return candidate;
  }
}

/** The kit as its owner edits it: saved, or a suggested draft. */
export function ownKit(store: DataStore, o: Owner, contact: Contact): MediaKit {
  return store.mediaKits.get(o) ?? {
    slug: suggestSlug(store, o.companyId, contact.name), published: false, headline: null, bio: null, contactEmail: null,
    featuredContactIds: [], manualStats: [], updatedAt: null,
  };
}

const optional = (value: unknown, field: string, max: number): string | null => {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return null;
  if (typeof value !== 'string' || value.trim().length > max) throw new HttpError(400, `${field} can be at most ${max} characters.`);
  return value.trim();
};

/** Applies the fields present in `body` to the kit, checking each. */
export function applyKitChanges(store: DataStore, o: Owner, current: MediaKit, body: Record<string, unknown>): MediaKit {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const next = { ...current };
  if (has('slug')) {
    if (typeof body.slug !== 'string' || !SLUG.test(body.slug)) throw new HttpError(400, 'The address can use 3 to 40 lowercase letters, digits and dashes, starting with a letter or digit.');
    const holder = store.mediaKits.bySlug(o.companyId, body.slug);
    if (holder && holder.ownerContactId !== o.ownerContactId) throw new HttpError(409, 'That address is taken. Try another.');
    next.slug = body.slug;
  }
  if (has('published')) next.published = body.published === true;
  if (has('headline')) next.headline = optional(body.headline, 'headline', 120);
  if (has('bio')) next.bio = optional(body.bio, 'bio', 1500);
  if (has('contactEmail')) {
    next.contactEmail = optional(body.contactEmail, 'contactEmail', 200);
    if (next.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.contactEmail)) throw new HttpError(400, 'contactEmail is not a valid address.');
  }
  if (has('featuredContactIds')) {
    const ids = Array.isArray(body.featuredContactIds) ? body.featuredContactIds : null;
    if (!ids || ids.length > 30 || ids.some((id) => typeof id !== 'string' || !store.workspace.contact(o, id))) {
      throw new HttpError(400, 'Choose brands from your own contacts.');
    }
    next.featuredContactIds = [...new Set(ids as string[])];
  }
  if (has('manualStats')) {
    const rows = Array.isArray(body.manualStats) ? body.manualStats : null;
    if (!rows || rows.length > 10) throw new HttpError(400, 'manualStats must be a list of at most 10 platforms.');
    next.manualStats = rows.map((raw, i) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      if (!(KIT_PLATFORMS as readonly unknown[]).includes(r.platform)) throw new HttpError(400, `manualStats[${i}].platform is not a platform.`);
      const num = (v: unknown, max: number) => {
        if (v === undefined || v === null || v === '') return null;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > max) throw new HttpError(400, `manualStats[${i}] has a number out of range.`);
        return n;
      };
      return { platform: r.platform as ManualStat['platform'], handle: optional(r.handle, 'handle', 60), followers: num(r.followers, 1e10), engagementRate: num(r.engagementRate, 100) };
    });
  }
  return next;
}

/** The numbers a kit shows: verified Instagram first (it replaces a typed Instagram row), then typed ones. */
export function kitStats(store: DataStore, o: Owner, kit: MediaKit) {
  const verified = store.social.verifiedFor(o.companyId, o.ownerContactId).map((v) => ({
    platform: 'Instagram', handle: `@${v.username}`, followers: v.followers, engagementRate: null as number | null, verified: true, asOf: v.asOf,
  }));
  const covered = new Set(verified.map((v) => v.platform));
  return [
    ...verified,
    ...kit.manualStats.filter((s) => !covered.has(s.platform)).map((s) => ({ ...s, verified: false, asOf: null as string | null })),
  ];
}

/** What anyone with the link sees. Undefined when there is no published kit at that address. */
export function publicKit(store: DataStore, companyId: string, slug: string) {
  const kit = store.mediaKits.bySlug(companyId, slug);
  if (!kit || !kit.published) return undefined;
  const contact = store.getContactById(kit.ownerContactId);
  if (!contact || contact.companyId !== companyId) return undefined;
  const o: Owner = { companyId, ownerContactId: contact.id };
  return {
    name: contact.name,
    headline: kit.headline,
    bio: kit.bio,
    contactEmail: kit.contactEmail,
    brands: kit.featuredContactIds.map((id) => store.workspace.contact(o, id)?.name).filter((n): n is string => Boolean(n)),
    stats: kitStats(store, o, kit),
  };
}
