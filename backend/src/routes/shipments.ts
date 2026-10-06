import { defaultDocuments, moveShipment, SHIPMENT_STATUSES, type Shipment, type ShipmentDirection, type ShipmentMode, type ShipmentStatus } from '../logistics/shipments';
import { HttpError } from '../http';
import { asRecord, enumValue, optionalString, requiredDateInput, requiredString } from '../validation';
import type { RouteContext } from './context';
import { type AuthedRequest, companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/** Shipments. */
export function registerShipmentRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles } = ctx;

  const shipmentFor = (req: AuthedRequest) => {
    const shipment = store.shipments.get(req.params.id);
    if (!shipment) throw new HttpError(404, 'Shipment not found.');
    return shipment;
  };
  const day = (value: unknown, field: string) => (value === null || value === '' ? null : requiredDateInput(value, field).slice(0, 10));
  /** Fields a shipment shares on create and edit; links are checked against the company. */
  const parseShipment = (companyId: string, body: Record<string, unknown>, existing?: Shipment) => {
    const has = (k: string) => body[k] !== undefined;
    const text = (k: string, fallback: string | null) => (has(k) ? optionalString(body[k]) ?? null : fallback);
    const purchaseOrderId = text('purchaseOrderId', existing?.purchaseOrderId ?? null);
    if (purchaseOrderId) {
      const po = store.getPurchaseOrderById(purchaseOrderId);
      if (!po || po.companyId !== companyId) throw new HttpError(400, 'Purchase order does not belong to this company.');
    }
    const salesOrderId = text('salesOrderId', existing?.salesOrderId ?? null);
    if (salesOrderId) {
      const so = store.getSalesOrderById(salesOrderId);
      if (!so || so.companyId !== companyId) throw new HttpError(400, 'Sales order does not belong to this company.');
    }
    const etd = has('etd') ? day(body.etd, 'etd') : existing?.etd ?? null;
    const eta = has('eta') ? day(body.eta, 'eta') : existing?.eta ?? null;
    if (etd && eta && eta < etd) throw new HttpError(400, 'Arrival cannot be before departure.');
    const containers = has('containers')
      ? (Array.isArray(body.containers) ? body.containers : String(body.containers ?? '').split(/[\s,]+/)).map((c) => String(c).trim().toUpperCase()).filter(Boolean).slice(0, 50)
      : existing?.containers ?? [];
    let documents = existing?.documents;
    if (has('documents')) {
      if (!Array.isArray(body.documents)) throw new HttpError(400, 'documents must be a list.');
      const now = new Date().toISOString();
      documents = (body.documents as unknown[]).map((raw, i) => {
        const d = asRecord(raw, `documents[${i}]`);
        const name = requiredString(d.name, `documents[${i}].name`, { min: 2 });
        const received = d.received === true;
        const before = existing?.documents.find((x) => x.name === name);
        return { key: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, received, receivedAt: received ? before?.receivedAt ?? now : null };
      });
    }
    return {
      mode: (has('mode') ? enumValue(body.mode, 'mode', ['sea', 'air', 'land'] as ShipmentMode[]) : existing?.mode ?? 'sea') as ShipmentMode,
      carrier: text('carrier', existing?.carrier ?? null), origin: text('origin', existing?.origin ?? null), destination: text('destination', existing?.destination ?? null),
      notes: text('notes', existing?.notes ?? null), purchaseOrderId, salesOrderId, etd, eta, containers, documents,
    };
  };

  app.get(
    '/companies/:companyId/shipments',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.shipments.list(req.params.companyId));
    }),
  );

  app.post(
    '/companies/:companyId/shipments',
    authMiddleware,
    handler((req, res) => {
      const companyId = req.params.companyId;
      requireCompanyRoles(req, companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const direction = enumValue(body.direction, 'direction', ['import', 'export'] as ShipmentDirection[]) as ShipmentDirection;
      const fields = parseShipment(companyId, body);
      const shipment = store.shipments.insert({ companyId, direction, ...fields, documents: fields.documents ?? defaultDocuments(direction, fields.mode) });
      res.status(201).json(shipment);
    }),
  );

  app.put(
    '/shipments/:id',
    authMiddleware,
    handler((req, res) => {
      const shipment = shipmentFor(req);
      requireCompanyRoles(req, shipment.companyId, companyManagementRoles);
      if (shipment.status === 'cancelled' || shipment.status === 'delivered') throw new HttpError(409, `A ${shipment.status} shipment cannot be changed.`);
      const fields = parseShipment(shipment.companyId, asRecord(req.body, 'body'), shipment);
      const updated = { ...shipment, ...fields, documents: fields.documents ?? shipment.documents };
      store.shipments.save(updated);
      res.json(updated);
    }),
  );

  app.post(
    '/shipments/:id/status',
    authMiddleware,
    handler((req, res) => {
      const shipment = shipmentFor(req);
      requireCompanyRoles(req, shipment.companyId, companyManagementRoles);
      const next = enumValue(asRecord(req.body, 'body').status, 'status', SHIPMENT_STATUSES) as ShipmentStatus;
      try {
        res.json(moveShipment(store, shipment, next));
      } catch (error) {
        throw new HttpError(409, error instanceof Error ? error.message : 'Could not change the status.');
      }
    }),
  );

  app.delete(
    '/shipments/:id',
    authMiddleware,
    handler((req, res) => {
      const shipment = shipmentFor(req);
      requireCompanyRoles(req, shipment.companyId, companyManagementRoles);
      if (shipment.status !== 'planned') throw new HttpError(409, 'Only a planned shipment can be deleted; cancel it instead.');
      store.shipments.remove(shipment.id);
      res.status(204).end();
    }),
  );
}
