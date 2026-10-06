import { recordReading } from '../inventory/cold-chain';
import { HttpError } from '../http';
import { asRecord, optionalString, requiredDateInput, requiredNumber } from '../validation';
import type { RouteContext } from './context';
import { type AuthedRequest, companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/** Cold-chain monitoring. */
export function registerColdChainRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles } = ctx;

  const warehouseFor = (req: AuthedRequest) => {
    const warehouse = store.getWarehouseById(req.params.id);
    if (!warehouse) throw new HttpError(404, 'Warehouse not found.');
    return warehouse;
  };

  app.get(
    '/warehouses/:id/storage',
    authMiddleware,
    handler((req, res) => {
      const warehouse = warehouseFor(req);
      requireCompanyRoles(req, warehouse.companyId, companyManagementRoles);
      res.json({ conditions: store.coldChain.conditions(warehouse.id) ?? null, readings: store.coldChain.readings(warehouse.id) });
    }),
  );

  app.put(
    '/warehouses/:id/storage',
    authMiddleware,
    handler((req, res) => {
      const warehouse = warehouseFor(req);
      requireCompanyRoles(req, warehouse.companyId, ['Admin', 'Manager']);
      const body = asRecord(req.body, 'body');
      if (body.monitored === false) {
        store.coldChain.setConditions({ warehouseId: warehouse.id, clear: true });
        return res.json({ conditions: null, readings: store.coldChain.readings(warehouse.id) });
      }
      const tempMin = requiredNumber(body.tempMin, 'tempMin');
      const tempMax = requiredNumber(body.tempMax, 'tempMax');
      if (tempMin >= tempMax) throw new HttpError(400, 'The minimum must be below the maximum.');
      const humidityMax = body.humidityMax === null || body.humidityMax === '' || body.humidityMax === undefined ? null : requiredNumber(body.humidityMax, 'humidityMax');
      if (humidityMax !== null && (humidityMax <= 0 || humidityMax > 100)) throw new HttpError(400, 'Humidity is a percentage, 1 to 100.');
      const readingIntervalHours = body.readingIntervalHours === undefined ? 12 : requiredNumber(body.readingIntervalHours, 'readingIntervalHours');
      if (!Number.isInteger(readingIntervalHours) || readingIntervalHours < 1 || readingIntervalHours > 168) throw new HttpError(400, 'Readings are due every 1 to 168 hours.');
      store.coldChain.setConditions({ warehouseId: warehouse.id, companyId: warehouse.companyId, tempMin, tempMax, humidityMax, readingIntervalHours });
      res.json({ conditions: store.coldChain.conditions(warehouse.id), readings: store.coldChain.readings(warehouse.id) });
    }),
  );

  app.post(
    '/warehouses/:id/readings',
    authMiddleware,
    handler((req, res) => {
      const warehouse = warehouseFor(req);
      requireCompanyRoles(req, warehouse.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const temperature = requiredNumber(body.temperature, 'temperature');
      if (temperature < -80 || temperature > 80) throw new HttpError(400, 'That temperature looks wrong (−80 to 80 °C).');
      const humidity = body.humidity === null || body.humidity === undefined || body.humidity === '' ? null : requiredNumber(body.humidity, 'humidity');
      if (humidity !== null && (humidity < 0 || humidity > 100)) throw new HttpError(400, 'Humidity is a percentage, 0 to 100.');
      const recordedAt = body.recordedAt ? new Date(requiredDateInput(body.recordedAt, 'recordedAt')) : new Date();
      if (recordedAt.getTime() > Date.now() + 5 * 60_000) throw new HttpError(400, 'A reading cannot be in the future.');
      try {
        res.status(201).json(recordReading(store, warehouse.id, { temperature, humidity, recordedAt, note: optionalString(body.note), actorName: req.user?.name }));
      } catch (error) {
        throw new HttpError(409, error instanceof Error ? error.message : 'Could not record the reading.');
      }
    }),
  );
}
