import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { DataStore } from '../data/store';

/**
 * Import and export shipments: containers on the way, their documents, and
 * where they are. A shipment cannot be marked cleared while a document on its
 * checklist is missing (customs would not clear it either); the hourly sweep
 * flags shipments whose ETA has passed without arrival and documents still
 * missing close to arrival.
 */

export type ShipmentDirection = 'import' | 'export';
export type ShipmentMode = 'sea' | 'air' | 'land';
export type ShipmentStatus = 'planned' | 'in_transit' | 'arrived' | 'cleared' | 'delivered' | 'cancelled';
export const SHIPMENT_STATUSES: ShipmentStatus[] = ['planned', 'in_transit', 'arrived', 'cleared', 'delivered', 'cancelled'];
const ORDER: ShipmentStatus[] = ['planned', 'in_transit', 'arrived', 'cleared', 'delivered'];

export interface ShipmentDocument { key: string; name: string; received: boolean; receivedAt: string | null }

export interface Shipment {
  id: string;
  companyId: string;
  reference: string;
  direction: ShipmentDirection;
  mode: ShipmentMode;
  carrier: string | null;
  containers: string[];
  origin: string | null;
  destination: string | null;
  /** YYYY-MM-DD */
  etd: string | null;
  eta: string | null;
  status: ShipmentStatus;
  purchaseOrderId: string | null;
  salesOrderId: string | null;
  documents: ShipmentDocument[];
  notes: string | null;
  statusChangedAt: string;
  createdAt: string;
}

/** The usual paperwork, by direction and mode. Anything that does not apply can be removed. */
export function defaultDocuments(direction: ShipmentDirection, mode: ShipmentMode): ShipmentDocument[] {
  const transport = mode === 'air' ? 'Air waybill' : mode === 'land' ? 'Road consignment note (CMR)' : 'Bill of lading';
  const names = direction === 'import'
    ? [transport, 'Commercial invoice', 'Packing list', 'Certificate of origin', 'Health certificate', 'Customs declaration']
    : ['Commercial invoice', 'Packing list', 'Certificate of origin', 'Health certificate', 'Export declaration', transport];
  return names.map((name) => ({ key: name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), name, received: false, receivedAt: null }));
}

export class ShipmentStore {
  constructor(private readonly db: Database.Database) {}

  private decode(row: any): Shipment {
    return {
      ...row, containers: JSON.parse(row.containers || '[]'), documents: JSON.parse(row.documents || '[]'),
      carrier: row.carrier ?? null, origin: row.origin ?? null, destination: row.destination ?? null, etd: row.etd ?? null, eta: row.eta ?? null,
      purchaseOrderId: row.purchaseOrderId ?? null, salesOrderId: row.salesOrderId ?? null, notes: row.notes ?? null,
    };
  }

  list(companyId: string): Shipment[] {
    return (this.db.prepare('SELECT * FROM shipments WHERE companyId = ? ORDER BY COALESCE(eta, etd, createdAt) DESC').all(companyId) as any[]).map((r) => this.decode(r));
  }

  open(): Shipment[] {
    return (this.db.prepare("SELECT * FROM shipments WHERE status IN ('planned', 'in_transit', 'arrived')").all() as any[]).map((r) => this.decode(r));
  }

  get(id: string): Shipment | undefined {
    const row = this.db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
    return row ? this.decode(row) : undefined;
  }

  insert(input: Omit<Shipment, 'id' | 'reference' | 'status' | 'statusChangedAt' | 'createdAt'>): Shipment {
    const seq = Number((this.db.prepare('SELECT COUNT(*) AS c FROM shipments WHERE companyId = ?').get(input.companyId) as any).c) + 1;
    const now = new Date().toISOString();
    const record: Shipment = { ...input, id: uuid(), reference: `SHP-${String(seq).padStart(4, '0')}`, status: 'planned', statusChangedAt: now, createdAt: now };
    this.db.prepare(
      `INSERT INTO shipments (id, companyId, reference, direction, mode, carrier, containers, origin, destination, etd, eta, status, purchaseOrderId, salesOrderId, documents, notes, statusChangedAt, createdAt)
       VALUES (@id, @companyId, @reference, @direction, @mode, @carrier, @containers, @origin, @destination, @etd, @eta, @status, @purchaseOrderId, @salesOrderId, @documents, @notes, @statusChangedAt, @createdAt)`,
    ).run({ ...record, containers: JSON.stringify(record.containers), documents: JSON.stringify(record.documents) });
    return record;
  }

  save(s: Shipment): void {
    this.db.prepare(
      `UPDATE shipments SET mode = @mode, carrier = @carrier, containers = @containers, origin = @origin, destination = @destination,
       etd = @etd, eta = @eta, status = @status, purchaseOrderId = @purchaseOrderId, salesOrderId = @salesOrderId,
       documents = @documents, notes = @notes, statusChangedAt = @statusChangedAt WHERE id = @id`,
    ).run({ ...s, containers: JSON.stringify(s.containers), documents: JSON.stringify(s.documents) });
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM shipments WHERE id = ?').run(id);
  }
}

/**
 * Moves a shipment along. Steps may be skipped forward (a shipment can be
 * logged on arrival) but never backward; cancelling is allowed until it is
 * cleared. Clearing needs every document on the checklist.
 */
export function moveShipment(store: DataStore, shipment: Shipment, next: ShipmentStatus): Shipment {
  if (next === shipment.status) return shipment;
  if (shipment.status === 'cancelled' || shipment.status === 'delivered') throw new Error(`A ${shipment.status} shipment does not move.`);
  if (next === 'cancelled') {
    if (ORDER.indexOf(shipment.status) >= ORDER.indexOf('cleared')) throw new Error('A cleared shipment cannot be cancelled.');
  } else if (ORDER.indexOf(next) < ORDER.indexOf(shipment.status)) {
    throw new Error(`A shipment that is ${shipment.status.replace('_', ' ')} cannot go back to ${next.replace('_', ' ')}.`);
  }
  if ((next === 'cleared' || next === 'delivered') && ORDER.indexOf(shipment.status) < ORDER.indexOf('cleared')) {
    const missing = shipment.documents.filter((d) => !d.received).map((d) => d.name);
    if (missing.length) throw new Error(`Still missing: ${missing.join(', ')}.`);
  }
  const updated = { ...shipment, status: next, statusChangedAt: new Date().toISOString() };
  store.shipments.save(updated);
  return updated;
}

/** Overdue arrivals and documents still missing three days before arrival: one reminder per shipment per day. */
export function sweepShipments(store: DataStore, now: Date = new Date()): number {
  const today = now.toISOString().slice(0, 10);
  const soon = new Date(now.getTime() + 3 * 86400_000).toISOString().slice(0, 10);
  let sent = 0;
  for (const s of store.shipments.open()) {
    const recipients = store.listUserIdsWithPermission(s.companyId, 'inventory:write', ['Admin', 'Manager']);
    if (s.eta && s.eta < today && (s.status === 'planned' || s.status === 'in_transit')) {
      sent += store.notify({
        companyId: s.companyId, userIds: recipients, type: 'shipment_due',
        title: `${s.reference} was due on ${s.eta} and has not arrived`,
        link: '/shipments', entityType: 'shipment', entityId: s.id, dedupeWithinMs: 20 * 3600_000,
        data: { tKey: 'notif.shipmentOverdue.t', reference: s.reference, eta: s.eta },
      }).length;
    }
    const missing = s.documents.filter((d) => !d.received);
    if (s.eta && s.eta <= soon && missing.length && s.status !== 'cancelled') {
      sent += store.notify({
        companyId: s.companyId, userIds: recipients, type: 'shipment_due',
        title: `${s.reference}: ${missing.length} document(s) still missing`,
        body: missing.map((d) => d.name).join(', '),
        link: '/shipments', entityType: 'shipment_documents', entityId: s.id, dedupeWithinMs: 20 * 3600_000,
        data: { tKey: 'notif.shipmentDocs.t', reference: s.reference, count: missing.length },
      }).length;
    }
  }
  return sent;
}
