import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { DataStore } from '../data/store';

/**
 * Fixed assets: equipment, vehicles, furniture. Straight-line depreciation by
 * month, from the month of purchase, down to the salvage value; the last month
 * takes the rounding so the total lands exactly. Posting is something an
 * accountant does ("post depreciation through September"), never a timer, so
 * nothing lands in books that were not looked at. Each asset-month posts once.
 */

export const ACCUMULATED_DEPRECIATION = '1590';
export const DEPRECIATION_EXPENSE = '5600';
export const DISPOSAL_GAIN = '4200';
export const DISPOSAL_LOSS = '5960';

export interface FixedAsset {
  id: string;
  companyId: string;
  name: string;
  category: string | null;
  assetAccountId: string;
  cost: number;
  salvageValue: number;
  /** YYYY-MM-DD */
  acquiredOn: string;
  usefulLifeMonths: number;
  status: 'active' | 'disposed';
  disposedOn: string | null;
  disposalProceeds: number | null;
  acquisitionEntryId: string | null;
  disposalEntryId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AssetView extends FixedAsset {
  accumulated: number;
  bookValue: number;
  /** Last month depreciated, YYYY-MM, or null. */
  depreciatedThrough: string | null;
  monthly: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
export const monthOf = (date: string) => date.slice(0, 7);
export const addMonths = (period: string, n: number) => {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const lastDayOf = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0, 12));
};

/** The depreciation for each month of an asset's life, summing to cost − salvage. */
export function schedule(asset: Pick<FixedAsset, 'cost' | 'salvageValue' | 'acquiredOn' | 'usefulLifeMonths'>): Array<{ period: string; amount: number }> {
  const base = r3(asset.cost - asset.salvageValue);
  if (!(base > 0) || !(asset.usefulLifeMonths > 0)) return [];
  const monthly = r3(base / asset.usefulLifeMonths);
  const start = monthOf(asset.acquiredOn);
  const rows: Array<{ period: string; amount: number }> = [];
  let total = 0;
  for (let i = 0; i < asset.usefulLifeMonths; i += 1) {
    const amount = i === asset.usefulLifeMonths - 1 ? r3(base - total) : monthly;
    rows.push({ period: addMonths(start, i), amount });
    total = r3(total + amount);
  }
  return rows;
}

export class FixedAssetStore {
  constructor(private readonly db: Database.Database) {}

  private decode(row: any): FixedAsset {
    return { ...row, category: row.category ?? null, disposedOn: row.disposedOn ?? null, disposalProceeds: row.disposalProceeds ?? null, acquisitionEntryId: row.acquisitionEntryId ?? null, disposalEntryId: row.disposalEntryId ?? null, notes: row.notes ?? null };
  }

  list(companyId: string): FixedAsset[] {
    return (this.db.prepare('SELECT * FROM fixed_assets WHERE companyId = ? ORDER BY acquiredOn DESC, createdAt DESC').all(companyId) as any[]).map((r) => this.decode(r));
  }

  get(id: string): FixedAsset | undefined {
    const row = this.db.prepare('SELECT * FROM fixed_assets WHERE id = ?').get(id);
    return row ? this.decode(row) : undefined;
  }

  insert(asset: Omit<FixedAsset, 'id' | 'status' | 'disposedOn' | 'disposalProceeds' | 'disposalEntryId' | 'createdAt'>): FixedAsset {
    const record: FixedAsset = { ...asset, id: uuid(), status: 'active', disposedOn: null, disposalProceeds: null, disposalEntryId: null, createdAt: new Date().toISOString() };
    this.db.prepare(
      `INSERT INTO fixed_assets (id, companyId, name, category, assetAccountId, cost, salvageValue, acquiredOn, usefulLifeMonths, status, acquisitionEntryId, notes, createdAt)
       VALUES (@id, @companyId, @name, @category, @assetAccountId, @cost, @salvageValue, @acquiredOn, @usefulLifeMonths, 'active', @acquisitionEntryId, @notes, @createdAt)`,
    ).run(record);
    return record;
  }

  update(id: string, patch: Partial<Pick<FixedAsset, 'name' | 'category' | 'notes' | 'cost' | 'salvageValue' | 'acquiredOn' | 'usefulLifeMonths' | 'assetAccountId'>>): void {
    const current = this.get(id)!;
    const next = { ...current, ...patch };
    this.db.prepare(
      `UPDATE fixed_assets SET name = @name, category = @category, notes = @notes, cost = @cost, salvageValue = @salvageValue,
       acquiredOn = @acquiredOn, usefulLifeMonths = @usefulLifeMonths, assetAccountId = @assetAccountId WHERE id = @id`,
    ).run(next);
  }

  posted(assetId: string): Array<{ period: string; amount: number; journalEntryId: string }> {
    return this.db.prepare('SELECT period, amount, journalEntryId FROM asset_depreciation WHERE assetId = ? ORDER BY period').all(assetId) as Array<{ period: string; amount: number; journalEntryId: string }>;
  }

  recordPosting(assetId: string, period: string, amount: number, journalEntryId: string): void {
    this.db.prepare('INSERT INTO asset_depreciation (assetId, period, amount, journalEntryId) VALUES (?, ?, ?, ?)').run(assetId, period, amount, journalEntryId);
  }

  markDisposed(id: string, disposedOn: string, proceeds: number, entryId: string): void {
    this.db.prepare("UPDATE fixed_assets SET status = 'disposed', disposedOn = ?, disposalProceeds = ?, disposalEntryId = ? WHERE id = ?").run(disposedOn, proceeds, entryId, id);
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM fixed_assets WHERE id = ?').run(id);
  }

  view(asset: FixedAsset): AssetView {
    const posted = this.posted(asset.id);
    const accumulated = r3(posted.reduce((s, p) => s + p.amount, 0));
    const plan = schedule(asset);
    return {
      ...asset, accumulated, bookValue: r3(asset.cost - accumulated),
      depreciatedThrough: posted.length ? posted[posted.length - 1].period : null,
      monthly: plan[0]?.amount ?? 0,
    };
  }
}

const accountByCode = (store: DataStore, companyId: string, code: string) => {
  const account = store.listLedgerAccounts(companyId).find((a) => a.code === code);
  if (!account) throw new Error(`Account ${code} is missing from the chart of accounts.`);
  return account.id;
};

export interface DepreciationRun { posted: Array<{ period: string; amount: number }>; skipped: Array<{ period: string; reason: string }> }

/**
 * Posts every unposted asset-month up to and including `through` (YYYY-MM),
 * one journal entry per month for all assets. A month that cannot be posted
 * (a locked period) is skipped and reported; later months still post, since
 * each month's entry stands alone. `onlyAssetId` limits the run to one asset.
 */
export function postDepreciation(store: DataStore, companyId: string, through: string, onlyAssetId?: string): DepreciationRun {
  const due = new Map<string, Array<{ asset: FixedAsset; amount: number }>>();
  for (const asset of store.assets.list(companyId)) {
    if (onlyAssetId && asset.id !== onlyAssetId) continue;
    if (asset.status !== 'active') continue;
    const done = new Set(store.assets.posted(asset.id).map((p) => p.period));
    for (const row of schedule(asset)) {
      if (row.period > through) break;
      if (done.has(row.period)) continue;
      due.set(row.period, [...(due.get(row.period) ?? []), { asset, amount: row.amount }]);
    }
  }
  const result: DepreciationRun = { posted: [], skipped: [] };
  const expense = accountByCode(store, companyId, DEPRECIATION_EXPENSE);
  const accumulated = accountByCode(store, companyId, ACCUMULATED_DEPRECIATION);
  for (const period of [...due.keys()].sort()) {
    const items = due.get(period)!;
    const total = r3(items.reduce((s, i) => s + i.amount, 0));
    try {
      const entry = store.createJournalEntry({
        companyId, sourceType: 'depreciation', sourceId: `${companyId}:${period}${onlyAssetId ? `:${onlyAssetId}` : ''}`,
        memo: `Depreciation ${period}`, entryDate: lastDayOf(period),
        lines: [
          { id: uuid(), accountId: expense, description: `Depreciation ${period}`, debit: total, credit: 0 },
          ...items.map((i) => ({ id: uuid(), accountId: accumulated, description: i.asset.name, debit: 0, credit: i.amount })),
        ],
      });
      items.forEach((i) => store.assets.recordPosting(i.asset.id, period, i.amount, entry.id));
      result.posted.push({ period, amount: total });
    } catch (error) {
      result.skipped.push({ period, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

/**
 * Takes an asset off the books: depreciation is brought up to the month
 * before, then cost and accumulated depreciation come out, any proceeds go
 * into `depositAccountId`, and the difference is a gain or a loss.
 */
export function disposeAsset(store: DataStore, asset: FixedAsset, input: { disposedOn: string; proceeds: number; depositAccountId?: string }): void {
  if (input.disposedOn < asset.acquiredOn) throw new Error('An asset cannot be disposed of before it was bought.');
  if (input.proceeds > 0 && !input.depositAccountId) throw new Error('Choose the account the proceeds were paid into.');
  const catchUp = postDepreciation(store, asset.companyId, addMonths(monthOf(input.disposedOn), -1), asset.id);
  if (catchUp.skipped.length) throw new Error(`Depreciation for ${catchUp.skipped.map((s) => s.period).join(', ')} could not be posted: ${catchUp.skipped[0].reason}`);
  const view = store.assets.view(asset);
  const proceeds = r3(input.proceeds);
  const result = r3(proceeds - view.bookValue);
  const lines = [
    ...(view.accumulated > 0 ? [{ id: uuid(), accountId: accountByCode(store, asset.companyId, ACCUMULATED_DEPRECIATION), description: `${asset.name}: accumulated depreciation`, debit: view.accumulated, credit: 0 }] : []),
    ...(proceeds > 0 ? [{ id: uuid(), accountId: input.depositAccountId!, description: `${asset.name}: sale proceeds`, debit: proceeds, credit: 0 }] : []),
    ...(result < 0 ? [{ id: uuid(), accountId: accountByCode(store, asset.companyId, DISPOSAL_LOSS), description: `${asset.name}: loss on disposal`, debit: -result, credit: 0 }] : []),
    { id: uuid(), accountId: asset.assetAccountId, description: `${asset.name}: cost removed`, debit: 0, credit: asset.cost },
    ...(result > 0 ? [{ id: uuid(), accountId: accountByCode(store, asset.companyId, DISPOSAL_GAIN), description: `${asset.name}: gain on disposal`, debit: 0, credit: result }] : []),
  ];
  const entry = store.createJournalEntry({
    companyId: asset.companyId, sourceType: 'asset_disposal', sourceId: asset.id,
    memo: `Disposal of ${asset.name}`, entryDate: new Date(`${input.disposedOn}T12:00:00Z`), lines,
  });
  store.assets.markDisposed(asset.id, input.disposedOn, proceeds, entry.id);
}
