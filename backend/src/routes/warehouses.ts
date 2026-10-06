import { HttpError } from '../http';
import { asRecord, optionalBoolean, optionalString, requiredString } from '../validation';
import type { RouteContext } from './context';
import { handler } from './shared';
import type { Express } from 'express';

/** Warehouses. */
export function registerWarehouseRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles } = ctx;

  app.get(
    '/companies/:companyId/warehouses',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Accountant']);
      res.json(store.listWarehouses(req.params.companyId));
    }),
  );

  app.post(
    '/companies/:companyId/warehouses',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager']);
      const body = asRecord(req.body, 'body');
      try {
        const warehouse = store.createWarehouse({
          companyId: req.params.companyId,
          name: requiredString(body.name, 'name', { min: 1 }),
          code: optionalString(body.code),
          address: optionalString(body.address),
          isDefault: optionalBoolean(body.isDefault) ?? false,
          isActive: optionalBoolean(body.isActive) ?? true,
        });
        res.status(201).json(warehouse);
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not create warehouse.');
      }
    }),
  );

  app.put(
    '/warehouses/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getWarehouseById(req.params.id);
      if (!existing) throw new HttpError(404, 'Warehouse not found.');
      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager']);
      const body = asRecord(req.body, 'body');
      try {
        const warehouse = store.updateWarehouse(req.params.id, {
          name: body.name !== undefined ? requiredString(body.name, 'name', { min: 1 }) : undefined,
          code: body.code !== undefined ? optionalString(body.code) : undefined,
          address: body.address !== undefined ? optionalString(body.address) : undefined,
          isDefault: body.isDefault !== undefined ? optionalBoolean(body.isDefault) : undefined,
          isActive: body.isActive !== undefined ? optionalBoolean(body.isActive) : undefined,
        });
        res.json(warehouse);
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not update warehouse.');
      }
    }),
  );

  app.delete(
    '/warehouses/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getWarehouseById(req.params.id);
      if (!existing) throw new HttpError(404, 'Warehouse not found.');
      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager']);
      try {
        store.deleteWarehouse(req.params.id);
        res.json({ success: true });
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not delete warehouse.');
      }
    }),
  );
}
