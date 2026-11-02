import { randomUUID } from 'node:crypto';
import type { DataStore } from '../data/store';
import { normalizeNiches } from '../niches';
import { influencerPlatforms, type Contact, type InfluencerAccount, type InfluencerPlatform } from '../types';
import { accountKeys, handleForPlatform, keyOf } from './handles';

/** One handle column and one followers column per platform: `instagram`, `instagramFollowers`, … */
const PLATFORM_COLUMNS: Array<[string, InfluencerPlatform]> = [
  ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['snapchat', 'Snapchat'], ['youtube', 'YouTube'], ['x', 'X'], ['facebook', 'Facebook'],
];

/** Columns of the influencer CSV — shared by export, import and the download template. */
export const INFLUENCER_CSV_COLUMNS = [
  'name', 'email', 'phone',
  ...PLATFORM_COLUMNS.flatMap(([col]) => [col, `${col}Followers`]),
  'niche', 'engagementRate', 'rateCard', 'location', 'languages', 'availability',
];

type Row = Record<string, unknown>;
type CreateInput = Parameters<DataStore['createContact']>[0];
type UpdateInput = Parameters<DataStore['updateContact']>[1];

const text = (v: unknown): string | undefined => {
  const s = v === undefined || v === null ? '' : String(v).trim();
  return s ? s : undefined;
};
const num = (v: unknown, column: string): number | undefined => {
  const s = text(v)?.replace(/[,\s]/g, '');
  if (s === undefined) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`${column} must be a number.`);
  return n;
};

/** The accounts a row names: one per platform column, plus the old `platform, handle, followers` columns. */
function rowAccounts(row: Row): Array<{ platform: InfluencerPlatform; handle: string; followers?: number }> {
  const out: Array<{ platform: InfluencerPlatform; handle: string; followers?: number }> = [];
  for (const [col, platform] of PLATFORM_COLUMNS) {
    const raw = text(row[col]);
    if (!raw) continue;
    const handle = handleForPlatform(platform, raw);
    if (!handle) throw new Error(`${col}: "${raw}" is not a ${platform} handle or profile link.`);
    out.push({ platform, handle, followers: num(row[`${col}Followers`], `${col}Followers`) });
  }
  const oldPlatform = influencerPlatforms.find((p) => p.toLowerCase() === text(row.platform)?.toLowerCase());
  const oldHandle = text(row.handle);
  if (oldPlatform && oldHandle && oldPlatform !== 'Other' && !out.some((a) => a.platform === oldPlatform)) {
    const handle = handleForPlatform(oldPlatform, oldHandle);
    if (handle) out.push({ platform: oldPlatform, handle, followers: num(row.followers, 'followers') });
  }
  return out;
}

/** The record's fields a row sets; empty cells set nothing. */
function rowFields(row: Row): UpdateInput {
  const languages = text(row.languages)?.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  const fields: UpdateInput = {
    name: text(row.name),
    email: text(row.email),
    phone: text(row.phone),
    influencerNiche: normalizeNiches(text(row.niche)) ?? undefined,
    engagementRate: num(row.engagementRate, 'engagementRate'),
    rateCardAmount: num(row.rateCard, 'rateCard'),
    location: text(row.location),
    languages: languages?.length ? languages : undefined,
    availabilityStatus: text(row.availability),
  };
  const oldPlatform = text(row.platform);
  if (oldPlatform) fields.influencerPlatform = oldPlatform;
  if (text(row.handle)) fields.influencerHandle = text(row.handle);
  const followers = num(row.followers, 'followers');
  if (followers !== undefined) fields.followerCount = followers;
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as UpdateInput;
}

/** The row's accounts merged into the record's: a platform already there is updated in place, others are added. */
function mergeAccounts(existing: InfluencerAccount[], incoming: ReturnType<typeof rowAccounts>): InfluencerAccount[] {
  const merged = existing.map((a) => ({ ...a }));
  for (const a of incoming) {
    const same = merged.find((m) => m.platform === a.platform);
    if (same) {
      if (same.handle?.replace(/^@/, '').toLowerCase() !== a.handle) { same.handle = a.handle; same.url = undefined; }
      if (a.followers !== undefined) same.followers = a.followers;
    } else {
      merged.push({ id: randomUUID(), platform: a.platform, handle: a.handle, ...(a.followers !== undefined ? { followers: a.followers } : {}) });
    }
  }
  return merged;
}

export interface ImportOutcome {
  created: number;
  updated: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
}

/**
 * Applies influencer CSV rows in order. A row updates the influencer it
 * matches — by any of its handles, else by email — and otherwise creates one.
 * A row whose handles point at two influencers fails, naming both.
 */
export function importInfluencerRows(
  store: DataStore,
  companyId: string,
  rows: unknown[],
  write: { create(input: CreateInput): Contact; update(id: string, input: UpdateInput): Contact },
): ImportOutcome {
  const out: ImportOutcome = { created: 0, updated: 0, failed: 0, errors: [] };
  rows.forEach((raw, index) => {
    try {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid row.');
      const row = raw as Row;
      const accounts = rowAccounts(row);
      const fields = rowFields(row);
      const influencers = store.listContacts(companyId, 'Influencer');
      const keys = new Set(accounts.map((a) => keyOf(a.platform, a.handle)));
      const byHandle = influencers.filter((c) => [...accountKeys(c)].some((k) => keys.has(k)));
      if (byHandle.length > 1) throw new Error(`These handles belong to ${byHandle.length} influencers: ${byHandle.map((c) => c.name).join(', ')}.`);
      const email = fields.email?.toLowerCase();
      const match = byHandle[0] ?? (email ? influencers.find((c) => c.email?.trim().toLowerCase() === email) : undefined);

      if (match) {
        write.update(match.id, {
          ...fields,
          ...(accounts.length ? { influencerAccounts: mergeAccounts(match.influencerAccounts ?? [], accounts) } : {}),
        });
        out.updated += 1;
        return;
      }
      if (!fields.name) throw new Error('A new influencer needs a name.');
      const first = accounts[0];
      write.create({
        ...(fields as Omit<UpdateInput, 'name'>),
        companyId,
        kind: 'Person',
        name: fields.name,
        roles: ['Influencer'],
        influencerPlatform: fields.influencerPlatform ?? first?.platform,
        influencerHandle: fields.influencerHandle ?? first?.handle,
        influencerAccounts: accounts.length ? mergeAccounts([], accounts) : undefined,
      } as CreateInput);
      out.created += 1;
    } catch (error) {
      out.failed += 1;
      if (out.errors.length < 50) out.errors.push({ row: index + 1, error: error instanceof Error ? error.message : 'Invalid row' });
    }
  });
  return out;
}

/** A record's account on a platform: from its accounts, else its single-platform fields. */
function accountOn(c: Contact, platform: InfluencerPlatform): { handle?: string; followers?: number } | undefined {
  const a = c.influencerAccounts?.find((x) => x.platform === platform && (x.handle || x.url));
  if (a) return { handle: a.handle || a.url, followers: a.followers };
  if (c.influencerPlatform === platform && c.influencerHandle) return { handle: c.influencerHandle, followers: c.followerCount };
  return undefined;
}

/** One export row, in `columns` order (the rate card column is left out for people who may not see pricing). */
export function influencerCsvRow(c: Contact, columns: string[]): unknown[] {
  const cells: Record<string, unknown> = {
    name: c.name, email: c.email ?? '', phone: c.phone ?? '', niche: c.influencerNiche ?? '',
    engagementRate: c.engagementRate ?? '', rateCard: c.rateCardAmount ?? '', location: c.location ?? '',
    languages: (c.languages ?? []).join('; '), availability: c.availabilityStatus ?? '',
  };
  for (const [col, platform] of PLATFORM_COLUMNS) {
    const account = accountOn(c, platform);
    cells[col] = account?.handle ?? '';
    cells[`${col}Followers`] = account?.followers ?? '';
  }
  return columns.map((col) => cells[col] ?? '');
}
