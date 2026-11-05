import type { Express } from 'express';
import type { InventoryItem, UserRole } from '../types';
import { asRecord, optionalNumber, optionalString, requiredString } from '../validation';
import type { RouteContext } from './context';
import { HttpError } from '../http';
import { type AuthedRequest, handler } from './shared';

/**
 * Sales → Services & prices (spec 2026-11-06-documents-hub-design, stage 3).
 * A service is an item that does not track stock, kept behind the sales module so
 * a company without inventory (an agency) still has a price list to quote from.
 * Stocked items are never read or changed through these routes.
 */

const MANAGEMENT: UserRole[] = ['Admin', 'Manager', 'Accountant'];

export function registerServiceRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles, withActor, maskFor } = ctx;

  const price = (value: unknown, required: boolean): number | undefined => {
    const n = optionalNumber(value);
    if (n === undefined) {
      if (required) throw new HttpError(400, 'Enter a price for the service.');
      return undefined;
    }
    if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'The price must be zero or more.');
    return n;
  };

  const text = (value: unknown, field: string, max: number): string | undefined => {
    const s = optionalString(value);
    if (s === undefined) return undefined;
    const trimmed = s.trim().replace(/\s+/g, ' ');
    if (!trimmed) throw new HttpError(400, `${field} cannot be empty.`);
    return trimmed.slice(0, max);
  };

  /** A service of this company, or 404 (a stocked item is not a service). */
  const serviceOf = (req: AuthedRequest, id: string, roles: UserRole[]): InventoryItem => {
    const item = store.getInventoryItemById(id);
    if (!item || item.tracksInventory || item.archivedAt) throw new HttpError(404, 'Service not found.');
    requireCompanyRoles(req, item.companyId, roles);
    return item;
  };

  const show = (req: AuthedRequest, item: InventoryItem) => maskFor(req, item.companyId, 'item', item);

  app.get(
    '/companies/:companyId/services',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, MANAGEMENT);
      const services = store.listInventoryItems(req.params.companyId)
        .filter((item) => !item.tracksInventory)
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json(services.map((item) => show(req, item)));
    }),
  );

  app.post(
    '/companies/:companyId/services',
    authMiddleware,
    handler((req, res) => {
      const companyId = req.params.companyId;
      requireCompanyRoles(req, companyId, MANAGEMENT);
      const body = asRecord(req.body, 'body');
      const name = requiredString(body.name, 'name', { min: 1 }).trim().replace(/\s+/g, ' ').slice(0, 200);
      if (!name) throw new HttpError(400, 'Enter a name for the service.');
      const item = withActor(req, () => store.createInventoryItem({
        companyId,
        name,
        category: text(body.category, 'Category', 80) ?? 'Services',
        unit: text(body.unit, 'Unit', 40) ?? 'service',
        vatApplicable: body.vatApplicable === undefined ? true : Boolean(body.vatApplicable),
        tracksInventory: false,
        onHand: 0,
        reorderPoint: 0,
        unitCost: 0,
        salePrice: price(body.salePrice, true),
      } as Parameters<typeof store.createInventoryItem>[0]));
      res.status(201).json(show(req, item));
    }),
  );

  app.put(
    '/services/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = serviceOf(req, req.params.id, MANAGEMENT);
      const body = asRecord(req.body, 'body');
      const updated = withActor(req, () => store.updateInventoryItem(existing.id, {
        name: body.name === undefined ? undefined : text(body.name, 'Name', 200),
        category: text(body.category, 'Category', 80),
        unit: text(body.unit, 'Unit', 40),
        vatApplicable: body.vatApplicable === undefined ? undefined : Boolean(body.vatApplicable),
        salePrice: body.salePrice === undefined ? undefined : price(body.salePrice, true),
      }));
      res.json(show(req, updated!));
    }),
  );

  // Removed from the price list. A service already on a quotation, order or
  // invoice is archived (the document keeps it), otherwise it is deleted.
  app.delete(
    '/services/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = serviceOf(req, req.params.id, MANAGEMENT);
      const result = withActor(req, () => store.removeInventoryItem(existing.id));
      res.json({ outcome: result.outcome });
    }),
  );
}
