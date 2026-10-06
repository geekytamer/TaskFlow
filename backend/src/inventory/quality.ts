import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { DataStore } from '../data/store';

/**
 * Quality control. Batches of items that require QC arrive in quarantine and
 * cannot be shipped or used until an inspection passes them; a failed
 * inspection rejects the batch. Shipping records which batches went on which
 * delivery, so any batch can be traced from its supplier to its customers.
 */

export type InspectionStage = 'incoming' | 'in_process' | 'final';
export const INSPECTION_STAGES: InspectionStage[] = ['incoming', 'in_process', 'final'];

export interface InspectionCheck {
  name: string;
  /** What was expected, e.g. "≤ 5 °C" or "no damage". */
  expected?: string;
  /** What was found. */
  actual?: string;
  pass: boolean;
}

export interface Inspection {
  id: string;
  companyId: string;
  lotId: string;
  stage: InspectionStage;
  result: 'pass' | 'fail';
  checks: InspectionCheck[];
  notes: string | null;
  inspectedByUserId: string | null;
  inspectedByName: string | null;
  inspectedAt: string;
}

export interface LotAllocation { deliveryId: string; lineIndex: number; lotId: string; quantity: number }

export class QualityStore {
  constructor(private readonly db: Database.Database) {}

  inspections(lotId: string): Inspection[] {
    return (this.db.prepare('SELECT * FROM qc_inspections WHERE lotId = ? ORDER BY inspectedAt DESC').all(lotId) as any[])
      .map((r) => ({ ...r, checks: JSON.parse(r.checks || '[]'), notes: r.notes ?? null }));
  }

  recordInspection(input: Omit<Inspection, 'id' | 'inspectedAt'> & { inspectedAt?: string }): Inspection {
    const record: Inspection = { ...input, id: uuid(), inspectedAt: input.inspectedAt ?? new Date().toISOString() };
    this.db.prepare(
      `INSERT INTO qc_inspections (id, companyId, lotId, stage, result, checks, notes, inspectedByUserId, inspectedByName, inspectedAt)
       VALUES (@id, @companyId, @lotId, @stage, @result, @checks, @notes, @inspectedByUserId, @inspectedByName, @inspectedAt)`,
    ).run({ ...record, checks: JSON.stringify(record.checks) });
    return record;
  }

  recordAllocations(rows: LotAllocation[]): void {
    const insert = this.db.prepare('INSERT INTO delivery_lot_allocations (deliveryId, lineIndex, lotId, quantity) VALUES (?, ?, ?, ?)');
    rows.forEach((r) => insert.run(r.deliveryId, r.lineIndex, r.lotId, r.quantity));
  }

  allocationsForDelivery(deliveryId: string): LotAllocation[] {
    return this.db.prepare('SELECT * FROM delivery_lot_allocations WHERE deliveryId = ?').all(deliveryId) as LotAllocation[];
  }

  allocationsForLot(lotId: string): LotAllocation[] {
    return this.db.prepare('SELECT * FROM delivery_lot_allocations WHERE lotId = ?').all(lotId) as LotAllocation[];
  }

  removeAllocations(deliveryId: string): void {
    this.db.prepare('DELETE FROM delivery_lot_allocations WHERE deliveryId = ?').run(deliveryId);
  }
}


/**
 * Records an inspection. A pass releases a quarantined batch for use; a fail
 * rejects it, whatever its state, so it can never ship. Inspections of a batch
 * already in use (in-process, final) are kept for the record and only a fail
 * changes its status.
 */
export function inspectLot(store: DataStore, lotId: string, input: {
  stage: InspectionStage; checks: InspectionCheck[]; notes?: string; actor?: { id: string; name: string };
}): Inspection {
  const lot = store.getInventoryLotById(lotId);
  if (!lot) throw new Error('Batch not found.');
  if (lot.status === 'Rejected') throw new Error('This batch was rejected. Receive a new one instead.');
  if (input.checks.length === 0) throw new Error('Record at least one check.');
  const result: 'pass' | 'fail' = input.checks.every((c) => c.pass) ? 'pass' : 'fail';
  return store.transaction(() => {
    const record = store.quality.recordInspection({
      companyId: lot.companyId, lotId, stage: input.stage, result, checks: input.checks, notes: input.notes?.trim() || null,
      inspectedByUserId: input.actor?.id ?? null, inspectedByName: input.actor?.name ?? null,
    });
    if (result === 'fail') store.setInventoryLotStatus(lotId, 'Rejected');
    else if (lot.status === 'Quarantine') store.setInventoryLotStatus(lotId, lot.quantity > 0 ? 'Active' : 'Depleted');
    return record;
  });
}

export interface LotTrace {
  lot: ReturnType<DataStore['getInventoryLotById']>;
  item: { id: string; name: string; sku: string; unit: string } | null;
  supplier: { id: string; name: string } | null;
  inspections: Inspection[];
  shipments: Array<{ deliveryId: string; deliveryNumber: string; status: string; dispatchedAt: string | null; quantity: number; salesOrderNumber: string | null; clientId: string | null; clientName: string | null }>;
  /** Stock movements on this batch other than shipments: receipt, issues, adjustments. */
  movements: Array<{ at: string; type: string; quantity: number; note: string | null }>;
}

/** Where a batch came from and everywhere it went. */
export function traceLot(store: DataStore, lotId: string): LotTrace {
  const lot = store.getInventoryLotById(lotId);
  if (!lot) throw new Error('Batch not found.');
  const item = store.getInventoryItemById(lot.inventoryItemId);
  const supplier = lot.supplierId ? store.getSupplierById(lot.supplierId) : undefined;
  const shipments = store.quality.allocationsForLot(lotId).map((a) => {
    const delivery = store.getDeliveryById(a.deliveryId);
    const order = delivery ? store.getSalesOrderById(delivery.salesOrderId) : undefined;
    const client = order ? store.getClientById(order.clientId) : undefined;
    return {
      deliveryId: a.deliveryId, deliveryNumber: delivery?.deliveryNumber ?? '—', status: delivery?.status ?? 'Unknown',
      dispatchedAt: delivery?.dispatchedAt ? new Date(delivery.dispatchedAt).toISOString() : null, quantity: a.quantity,
      salesOrderNumber: order?.orderNumber ?? null, clientId: client?.id ?? null, clientName: client?.name ?? null,
    };
  });
  const movements = store.listStockMovements(lot.companyId, lot.inventoryItemId)
    .filter((m) => m.lotId === lotId)
    .map((m) => ({ at: new Date(m.createdAt).toISOString(), type: m.movementType, quantity: m.quantityChange, note: m.note ?? null }));
  return {
    lot,
    item: item ? { id: item.id, name: item.name, sku: item.sku, unit: item.unit } : null,
    supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
    inspections: store.quality.inspections(lotId),
    shipments,
    movements,
  };
}
