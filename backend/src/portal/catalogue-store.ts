import type Database from 'better-sqlite3';

export type PricingMode = 'markup' | 'retainer';
export const pricingModes: readonly PricingMode[] = ['markup', 'retainer'];

export interface PriceRange { belowPercent: number; abovePercent: number }
export const DEFAULT_PRICE_RANGE: PriceRange = { belowPercent: 30, abovePercent: 30 };

export interface PricingProfile {
  contactId: string;
  companyId: string;
  mode: PricingMode;
  /** Only meaningful for `markup`; always null for `retainer`. */
  markupPercent: number | null;
  updatedByUserId?: string;
  updatedAt: string;
}

/**
 * Which influencers are hidden from the client catalogue, each influencer's
 * price range, and each client's pricing terms. Both live in their own tables so the shared contact model
 * never learns about the portal.
 */
export class PortalCatalogueStore {
  constructor(private readonly db: Database.Database) {}

  /** Influencers Peak has hidden from clients. Everyone else with the Influencer role is shown. */
  hiddenIds(companyId: string): Set<string> {
    return new Set((this.db
      .prepare('SELECT contactId FROM portal_catalogue_hidden WHERE companyId = ?')
      .all(companyId) as Array<{ contactId: string }>).map((row) => row.contactId));
  }

  /** Shown to clients: true unless hidden. The caller checks the contact is this company's influencer. */
  isListed(companyId: string, contactId: string): boolean {
    return !this.db
      .prepare('SELECT 1 FROM portal_catalogue_hidden WHERE companyId = ? AND contactId = ?')
      .get(companyId, contactId);
  }

  /** Show to clients again. */
  list(companyId: string, contactId: string): void {
    this.db.prepare('DELETE FROM portal_catalogue_hidden WHERE companyId = ? AND contactId = ?').run(companyId, contactId);
  }

  /** Hide from clients. */
  unlist(companyId: string, contactId: string, hiddenByUserId?: string): void {
    this.db
      .prepare('INSERT OR IGNORE INTO portal_catalogue_hidden (companyId, contactId, hiddenByUserId, hiddenAt) VALUES (?, ?, ?, ?)')
      .run(companyId, contactId, hiddenByUserId ?? null, new Date().toISOString());
  }

  /** How far below and above the client's price the shown range goes, in percent. */
  priceRange(contactId: string): PriceRange {
    const row = this.db.prepare('SELECT belowPercent, abovePercent FROM portal_price_ranges WHERE contactId = ?')
      .get(contactId) as PriceRange | undefined;
    return row ?? { ...DEFAULT_PRICE_RANGE };
  }

  setPriceRange(input: { companyId: string; contactId: string; belowPercent: number; abovePercent: number; updatedByUserId?: string }): PriceRange {
    this.db.prepare(
      `INSERT INTO portal_price_ranges (contactId, companyId, belowPercent, abovePercent, updatedByUserId, updatedAt)
       VALUES (@contactId, @companyId, @belowPercent, @abovePercent, @updatedByUserId, @updatedAt)
       ON CONFLICT(contactId) DO UPDATE SET belowPercent = excluded.belowPercent, abovePercent = excluded.abovePercent,
         updatedByUserId = excluded.updatedByUserId, updatedAt = excluded.updatedAt`,
    ).run({ ...input, updatedByUserId: input.updatedByUserId ?? null, updatedAt: new Date().toISOString() });
    return this.priceRange(input.contactId);
  }

  getPricingProfile(contactId: string): PricingProfile | undefined {
    const row = this.db
      .prepare('SELECT * FROM client_pricing_profiles WHERE contactId = ?')
      .get(contactId) as (Omit<PricingProfile, 'updatedByUserId'> & { updatedByUserId: string | null }) | undefined;
    if (!row) return undefined;
    return { ...row, updatedByUserId: row.updatedByUserId ?? undefined };
  }

  setPricingProfile(input: {
    contactId: string;
    companyId: string;
    mode: PricingMode;
    markupPercent: number | null;
    updatedByUserId?: string;
  }): PricingProfile {
    const markupPercent = input.mode === 'markup' ? input.markupPercent : null;
    this.db
      .prepare(
        `INSERT INTO client_pricing_profiles (contactId, companyId, mode, markupPercent, updatedByUserId, updatedAt)
         VALUES (@contactId, @companyId, @mode, @markupPercent, @updatedByUserId, @updatedAt)
         ON CONFLICT(contactId) DO UPDATE SET mode = excluded.mode, markupPercent = excluded.markupPercent,
           updatedByUserId = excluded.updatedByUserId, updatedAt = excluded.updatedAt`,
      )
      .run({
        contactId: input.contactId,
        companyId: input.companyId,
        mode: input.mode,
        markupPercent,
        updatedByUserId: input.updatedByUserId ?? null,
        updatedAt: new Date().toISOString(),
      });
    return this.getPricingProfile(input.contactId)!;
  }
}
