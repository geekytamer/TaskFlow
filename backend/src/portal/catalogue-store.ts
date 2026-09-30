import type Database from 'better-sqlite3';

export type PricingMode = 'markup' | 'retainer';
export const pricingModes: readonly PricingMode[] = ['markup', 'retainer'];

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
 * Which influencers are listed in the client catalogue, and each client's
 * pricing terms. Both live in their own tables so the shared contact model
 * never learns about the portal.
 */
export class PortalCatalogueStore {
  constructor(private readonly db: Database.Database) {}

  listedIds(companyId: string): string[] {
    return (this.db
      .prepare('SELECT contactId FROM portal_catalogue WHERE companyId = ? ORDER BY addedAt ASC, rowid ASC')
      .all(companyId) as Array<{ contactId: string }>).map((row) => row.contactId);
  }

  isListed(companyId: string, contactId: string): boolean {
    return Boolean(this.db
      .prepare('SELECT 1 FROM portal_catalogue WHERE companyId = ? AND contactId = ?')
      .get(companyId, contactId));
  }

  list(companyId: string, contactId: string, addedByUserId?: string): void {
    this.db
      .prepare('INSERT OR IGNORE INTO portal_catalogue (companyId, contactId, addedByUserId, addedAt) VALUES (?, ?, ?, ?)')
      .run(companyId, contactId, addedByUserId ?? null, new Date().toISOString());
  }

  unlist(companyId: string, contactId: string): void {
    this.db.prepare('DELETE FROM portal_catalogue WHERE companyId = ? AND contactId = ?').run(companyId, contactId);
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
