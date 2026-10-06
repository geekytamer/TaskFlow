import { type DeliveryStatus } from '../types';
import { HttpError } from '../http';
import { asRecord, enumValue, optionalString } from '../validation';
import type { RouteContext } from './context';
import { companyManagementRoles, handler } from './shared';
import type { Express } from 'express';


const deliveryStatuses: DeliveryStatus[] = ['Pending', 'Shipped', 'Delivered', 'Cancelled'];

/** Deliveries and fulfillment. */
export function registerDeliveryRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles, withActor } = ctx;

  app.get(
    '/companies/:companyId/deliveries',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listDeliveries(req.params.companyId));
    }),
  );

  app.get(
    '/sales-orders/:id/deliveries',
    authMiddleware,
    handler((req, res) => {
      const order = store.getSalesOrderById(req.params.id);
      if (!order) throw new HttpError(404, 'Sales order not found.');
      requireCompanyRoles(req, order.companyId, companyManagementRoles);
      res.json(store.listDeliveriesForSalesOrder(order.id));
    }),
  );

  app.post(
    '/sales-orders/:id/deliveries',
    authMiddleware,
    handler((req, res) => {
      const order = store.getSalesOrderById(req.params.id);
      if (!order) throw new HttpError(404, 'Sales order not found.');
      requireCompanyRoles(req, order.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const itemsRaw = Array.isArray(body.items) ? body.items : [];
      const items = itemsRaw.map((row, index) => {
        const record = asRecord(row, `items[${index}]`);
        return {
          salesOrderLineIndex: Number(record.salesOrderLineIndex ?? record.lineIndex ?? 0),
          quantity: Number(record.quantity ?? 0),
          location: optionalString(record.location),
        };
      });
      try {
        const delivery = withActor(req, () =>
          store.createDelivery({
            salesOrderId: order.id,
            items,
            templateId: optionalString(body.templateId),
            carrier: optionalString(body.carrier),
            trackingNumber: optionalString(body.trackingNumber),
            notes: optionalString(body.notes),
            scheduledFor: body.scheduledFor ? new Date(String(body.scheduledFor)) : undefined,
          }),
        );
        res.status(201).json(delivery);
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not create delivery.');
      }
    }),
  );

  app.patch(
    '/deliveries/:id/status',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getDeliveryById(req.params.id);
      if (!existing) throw new HttpError(404, 'Delivery not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const nextStatus = enumValue(body.status, 'status', deliveryStatuses);
      const occurredAt = body.occurredAt ? new Date(String(body.occurredAt)) : undefined;
      try {
        let updated;
        if (nextStatus === 'Shipped') {
          updated = withActor(req, () => store.markDeliveryShipped(existing.id, occurredAt));
        } else if (nextStatus === 'Delivered') {
          updated = withActor(req, () => store.markDeliveryDelivered(existing.id, occurredAt));
        } else if (nextStatus === 'Cancelled') {
          updated = withActor(req, () =>
            store.cancelDelivery(existing.id, optionalString(body.reason) ?? undefined),
          );
        } else {
          throw new HttpError(400, 'Use a specific status transition (Shipped, Delivered, or Cancelled).');
        }
        res.json(updated);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not update delivery status.');
      }
    }),
  );

  app.post(
    '/deliveries/:id/cancel',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getDeliveryById(req.params.id);
      if (!existing) throw new HttpError(404, 'Delivery not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      const body = asRecord(req.body ?? {}, 'body');
      try {
        const updated = withActor(req, () =>
          store.cancelDelivery(existing.id, optionalString(body.reason) ?? undefined),
        );
        res.json(updated);
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not cancel delivery.');
      }
    }),
  );
}
