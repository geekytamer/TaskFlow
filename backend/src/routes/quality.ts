import { INSPECTION_STAGES, inspectLot, traceLot, type InspectionCheck, type InspectionStage } from '../inventory/quality';
import { HttpError } from '../http';
import { asRecord, enumValue, optionalString, requiredString } from '../validation';
import type { RouteContext } from './context';
import { type AuthedRequest, companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/** Quality control. */
export function registerQualityRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles, withActor } = ctx;

  const lotFor = (req: AuthedRequest) => {
    const lot = store.getInventoryLotById(req.params.id);
    if (!lot) throw new HttpError(404, 'Batch not found.');
    return lot;
  };

  app.post(
    '/inventory-lots/:id/inspections',
    authMiddleware,
    handler((req, res) => {
      const lot = lotFor(req);
      requireCompanyRoles(req, lot.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      if (!Array.isArray(body.checks) || body.checks.length === 0) throw new HttpError(400, 'Record at least one check.');
      const checks: InspectionCheck[] = (body.checks as unknown[]).map((raw, i) => {
        const c = asRecord(raw, `checks[${i}]`);
        return { name: requiredString(c.name, `checks[${i}].name`, { min: 1 }), expected: optionalString(c.expected), actual: optionalString(c.actual), pass: c.pass === true };
      });
      try {
        const record = inspectLot(store, lot.id, {
          stage: enumValue(body.stage ?? 'incoming', 'stage', INSPECTION_STAGES) as InspectionStage,
          checks, notes: optionalString(body.notes), actor: req.user ? { id: req.user.id, name: req.user.name } : undefined,
        });
        withActor(req, () => store.createActivityEvent({
          companyId: lot.companyId, entityType: 'inventory_item', entityId: lot.inventoryItemId, action: record.result === 'pass' ? 'qc_passed' : 'qc_failed',
          summary: `Batch ${lot.lotNumber} ${record.result === 'pass' ? 'passed' : 'failed'} ${record.stage.replace('_', '-')} inspection.`,
          metadata: { lotId: lot.id, inspectionId: record.id },
        }));
        res.status(201).json({ inspection: record, lot: store.getInventoryLotById(lot.id) });
      } catch (error) {
        throw new HttpError(409, error instanceof Error ? error.message : 'Could not record the inspection.');
      }
    }),
  );

  app.get(
    '/inventory-lots/:id/trace',
    authMiddleware,
    handler((req, res) => {
      const lot = lotFor(req);
      requireCompanyRoles(req, lot.companyId, companyManagementRoles);
      res.json(traceLot(store, lot.id));
    }),
  );
}
