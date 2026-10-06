import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { DataStore } from '../data/store';

/**
 * Cold-chain monitoring. A warehouse with storage conditions (a temperature
 * range, optionally a humidity ceiling) is monitored: each reading outside
 * the range is an excursion and alerts inventory managers at once, naming the
 * batches stored there; a monitored store with no reading for its interval is
 * flagged by the hourly sweep. Readings are entered by staff (no sensors).
 */

export interface StorageConditions {
  warehouseId: string;
  companyId: string;
  tempMin: number;
  tempMax: number;
  humidityMax: number | null;
  readingIntervalHours: number;
}

export interface StorageReading {
  id: string;
  warehouseId: string;
  recordedAt: string;
  temperature: number;
  humidity: number | null;
  excursion: boolean;
  note: string | null;
  recordedByName: string | null;
}

export class ColdChainStore {
  constructor(private readonly db: Database.Database) {}

  conditions(warehouseId: string): StorageConditions | undefined {
    const row = this.db.prepare('SELECT * FROM storage_conditions WHERE warehouseId = ?').get(warehouseId) as any;
    return row ? { ...row, humidityMax: row.humidityMax ?? null } : undefined;
  }

  monitored(): StorageConditions[] {
    return (this.db.prepare('SELECT * FROM storage_conditions').all() as any[]).map((r) => ({ ...r, humidityMax: r.humidityMax ?? null }));
  }

  setConditions(c: StorageConditions | { warehouseId: string; clear: true }): void {
    if ('clear' in c) { this.db.prepare('DELETE FROM storage_conditions WHERE warehouseId = ?').run(c.warehouseId); return; }
    this.db.prepare(
      `INSERT INTO storage_conditions (warehouseId, companyId, tempMin, tempMax, humidityMax, readingIntervalHours)
       VALUES (@warehouseId, @companyId, @tempMin, @tempMax, @humidityMax, @readingIntervalHours)
       ON CONFLICT (warehouseId) DO UPDATE SET tempMin = excluded.tempMin, tempMax = excluded.tempMax,
         humidityMax = excluded.humidityMax, readingIntervalHours = excluded.readingIntervalHours`,
    ).run(c);
  }

  readings(warehouseId: string, limit = 100): StorageReading[] {
    return (this.db.prepare('SELECT * FROM storage_readings WHERE warehouseId = ? ORDER BY recordedAt DESC LIMIT ?').all(warehouseId, limit) as any[])
      .map((r) => ({ ...r, excursion: r.excursion === 1, humidity: r.humidity ?? null, note: r.note ?? null, recordedByName: r.recordedByName ?? null }));
  }

  /** Out-of-range readings in a company since a moment, with the store's name. */
  excursionsSince(companyId: string, sinceIso: string): Array<{ warehouseId: string; warehouseName: string; recordedAt: string }> {
    return this.db.prepare(
      `SELECT r.warehouseId, w.name AS warehouseName, r.recordedAt FROM storage_readings r JOIN warehouses w ON w.id = r.warehouseId
        WHERE r.companyId = ? AND r.excursion = 1 AND r.recordedAt >= ? ORDER BY r.recordedAt DESC`,
    ).all(companyId, sinceIso) as Array<{ warehouseId: string; warehouseName: string; recordedAt: string }>;
  }

  lastReadingAt(warehouseId: string): string | null {
    const row = this.db.prepare('SELECT MAX(recordedAt) AS at FROM storage_readings WHERE warehouseId = ?').get(warehouseId) as { at: string | null };
    return row.at;
  }

  insertReading(r: Omit<StorageReading, 'id'> & { companyId: string }): StorageReading {
    const record = { ...r, id: uuid() };
    this.db.prepare(
      `INSERT INTO storage_readings (id, companyId, warehouseId, recordedAt, temperature, humidity, excursion, note, recordedByName)
       VALUES (@id, @companyId, @warehouseId, @recordedAt, @temperature, @humidity, @excursion, @note, @recordedByName)`,
    ).run({ ...record, excursion: record.excursion ? 1 : 0 });
    const { companyId: _c, ...reading } = record;
    return reading;
  }
}

/** What is wrong with a reading, or null when it is within the conditions. */
export function excursionOf(c: Pick<StorageConditions, 'tempMin' | 'tempMax' | 'humidityMax'>, temperature: number, humidity: number | null): string | null {
  if (temperature < c.tempMin) return `${temperature} °C is below the minimum of ${c.tempMin} °C`;
  if (temperature > c.tempMax) return `${temperature} °C is above the maximum of ${c.tempMax} °C`;
  if (c.humidityMax !== null && humidity !== null && humidity > c.humidityMax) return `humidity ${humidity}% is above ${c.humidityMax}%`;
  return null;
}

export function recordReading(store: DataStore, warehouseId: string, input: { temperature: number; humidity?: number | null; recordedAt?: Date; note?: string; actorName?: string }): StorageReading {
  const warehouse = store.getWarehouseById(warehouseId);
  if (!warehouse) throw new Error('Warehouse not found.');
  const conditions = store.coldChain.conditions(warehouseId);
  if (!conditions) throw new Error('Set the storage conditions for this warehouse first.');
  const humidity = input.humidity ?? null;
  const problem = excursionOf(conditions, input.temperature, humidity);
  const reading = store.coldChain.insertReading({
    companyId: warehouse.companyId, warehouseId, recordedAt: (input.recordedAt ?? new Date()).toISOString(),
    temperature: input.temperature, humidity, excursion: Boolean(problem), note: input.note?.trim() || null, recordedByName: input.actorName ?? null,
  });
  if (problem) {
    const lots = store.listInventoryLots(warehouse.companyId).filter((l) => l.location === warehouse.name && l.quantity > 0 && l.status !== 'Depleted');
    const names = lots.slice(0, 5).map((l) => l.lotNumber).join(', ');
    store.notify({
      companyId: warehouse.companyId,
      userIds: store.listUserIdsWithPermission(warehouse.companyId, 'inventory:write', ['Admin', 'Manager']),
      type: 'storage_excursion',
      title: `${warehouse.name}: ${problem}`,
      body: lots.length ? `Batches stored there: ${names}${lots.length > 5 ? ` and ${lots.length - 5} more` : ''}. Check them before they are used or shipped.` : 'No batches are stored there right now.',
      link: `/inventory/warehouses/${warehouse.id}`, entityType: 'warehouse', entityId: warehouse.id,
      data: {
        tKey: 'notif.storageExcursion.t', bKey: lots.length ? 'notif.storageExcursion.b' : 'notif.storageExcursion.bEmpty',
        warehouse: warehouse.name,
        reading: humidity !== null && conditions.humidityMax !== null && humidity > conditions.humidityMax && input.temperature >= conditions.tempMin && input.temperature <= conditions.tempMax ? `${humidity}%` : `${input.temperature} °C`,
        range: `${conditions.tempMin} to ${conditions.tempMax} °C${conditions.humidityMax !== null ? `, ≤ ${conditions.humidityMax}%` : ''}`,
        lots: `${names}${lots.length > 5 ? ` +${lots.length - 5}` : ''}`,
      },
    });
  }
  return reading;
}

/** Monitored stores with no reading for longer than their interval: one reminder per store per interval. */
export function sweepOverdueReadings(store: DataStore, now: Date = new Date()): number {
  let sent = 0;
  for (const c of store.coldChain.monitored()) {
    const warehouse = store.getWarehouseById(c.warehouseId);
    if (!warehouse || !warehouse.isActive) continue;
    const last = store.coldChain.lastReadingAt(c.warehouseId);
    const dueMs = c.readingIntervalHours * 3600_000;
    if (last && now.getTime() - Date.parse(last) < dueMs) continue;
    sent += store.notify({
      companyId: c.companyId,
      userIds: store.listUserIdsWithPermission(c.companyId, 'inventory:write', ['Admin', 'Manager']),
      type: 'storage_reading_due',
      title: last ? `${warehouse.name}: no temperature reading for ${Math.floor((now.getTime() - Date.parse(last)) / 3600_000)} hours` : `${warehouse.name}: no temperature reading recorded yet`,
      data: last
        ? { tKey: 'notif.storageReadingDue.t', warehouse: warehouse.name, hours: Math.floor((now.getTime() - Date.parse(last)) / 3600_000) }
        : { tKey: 'notif.storageReadingDue.tNever', warehouse: warehouse.name },
      link: `/inventory/warehouses/${warehouse.id}`, entityType: 'warehouse', entityId: warehouse.id,
      dedupeWithinMs: dueMs,
    }).length;
  }
  return sent;
}
