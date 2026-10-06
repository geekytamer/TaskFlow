import { HttpError } from '../http';
import { asRecord, enumValue, requiredNumber, requiredString } from '../validation';
import type { RouteContext } from './context';
import { type AuthedRequest, companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/** Budgets. */
export function registerBudgetRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles, withActor } = ctx;

  const parseBudgetLines = (value: unknown): { accountId: string; amount: number }[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new HttpError(400, 'lines must be an array.');
    return value.map((raw) => {
      const line = asRecord(raw, 'line');
      return {
        accountId: requiredString(line.accountId, 'accountId'),
        amount: requiredNumber(line.amount, 'amount'),
      };
    });
  };

  app.get(
    '/companies/:companyId/budgets',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listBudgets(req.params.companyId));
    }),
  );

  app.post(
    '/companies/:companyId/budgets',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      try {
        const budget = withActor(req, () =>
          store.createBudget({
            companyId: req.params.companyId,
            name: requiredString(body.name, 'name', { min: 1 }),
            fiscalYear: requiredNumber(body.fiscalYear, 'fiscalYear'),
            status: body.status !== undefined
              ? (enumValue(body.status, 'status', ['draft', 'active', 'archived']) as any)
              : undefined,
            lines: parseBudgetLines(body.lines),
          }),
        );
        res.status(201).json(budget);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not create budget.');
      }
    }),
  );

  const loadBudgetForWrite = (req: AuthedRequest) => {
    const budget = store.getBudgetById(req.params.id);
    if (!budget) throw new HttpError(404, 'Budget not found.');
    requireCompanyRoles(req, budget.companyId, companyManagementRoles);
    return budget;
  };

  app.get(
    '/budgets/:id',
    authMiddleware,
    handler((req, res) => {
      const budget = loadBudgetForWrite(req);
      res.json(budget);
    }),
  );

  app.get(
    '/budgets/:id/variance',
    authMiddleware,
    handler((req, res) => {
      loadBudgetForWrite(req);
      const report = store.getBudgetVariance(req.params.id);
      if (!report) throw new HttpError(404, 'Budget not found.');
      res.json(report);
    }),
  );

  app.put(
    '/budgets/:id',
    authMiddleware,
    handler((req, res) => {
      loadBudgetForWrite(req);
      const body = asRecord(req.body, 'body');
      try {
        const budget = withActor(req, () =>
          store.updateBudget(req.params.id, {
            name: body.name !== undefined ? requiredString(body.name, 'name', { min: 1 }) : undefined,
            fiscalYear: body.fiscalYear !== undefined ? requiredNumber(body.fiscalYear, 'fiscalYear') : undefined,
            status: body.status !== undefined
              ? (enumValue(body.status, 'status', ['draft', 'active', 'archived']) as any)
              : undefined,
            lines: body.lines !== undefined ? parseBudgetLines(body.lines) : undefined,
          }),
        );
        res.json(budget);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not update budget.');
      }
    }),
  );

  app.delete(
    '/budgets/:id',
    authMiddleware,
    handler((req, res) => {
      loadBudgetForWrite(req);
      store.deleteBudget(req.params.id);
      res.status(204).end();
    }),
  );
}
