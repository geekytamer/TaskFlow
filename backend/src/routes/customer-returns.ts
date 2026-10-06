import { HttpError } from '../http';
import { asRecord, optionalString, requiredDateInput, requiredString } from '../validation';
import type { RouteContext } from './context';
import { companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/** Customer returns (RMA). */
export function registerCustomerReturnRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles, withActor } = ctx;

  app.get(
    '/companies/:companyId/customer-returns',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listCustomerReturns(req.params.companyId));
    }),
  );

  app.post(
    '/companies/:companyId/customer-returns',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      if (!Array.isArray(body.items)) throw new HttpError(400, 'items must be a list.');
      try {
        const record = withActor(req, () => store.createCustomerReturn({
          companyId: req.params.companyId,
          deliveryId: requiredString(body.deliveryId, 'deliveryId'),
          reason: optionalString(body.reason),
          items: (body.items as unknown[]).map((raw) => {
            const item = asRecord(raw, 'item');
            return { deliveryLineIndex: Number(item.deliveryLineIndex), quantity: Number(item.quantity), condition: item.condition === 'Scrap' ? 'Scrap' : 'Restock' };
          }),
        }));
        res.status(201).json(record);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not create the return.');
      }
    }),
  );

  app.post(
    '/customer-returns/:id/receipt',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getCustomerReturnById(req.params.id);
      if (!existing) throw new HttpError(404, 'Return not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      const body = asRecord(req.body ?? {}, 'body');
      try {
        res.json(withActor(req, () => store.receiveCustomerReturn(existing.id, {
          receivedAt: body.receivedAt ? new Date(requiredDateInput(body.receivedAt, 'receivedAt')) : undefined,
          issueCredit: body.issueCredit === true,
        })));
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(409, error instanceof Error ? error.message : 'Could not receive the return.');
      }
    }),
  );

  app.post(
    '/customer-returns/:id/cancel',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getCustomerReturnById(req.params.id);
      if (!existing) throw new HttpError(404, 'Return not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      try {
        res.json(withActor(req, () => store.cancelCustomerReturn(existing.id)));
      } catch (error) {
        throw new HttpError(409, error instanceof Error ? error.message : 'Could not cancel the return.');
      }
    }),
  );
}
