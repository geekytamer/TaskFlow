import { HttpError } from '../http';
import { asRecord, optionalString, requiredNumber, requiredString } from '../validation';
import type { RouteContext } from './context';
import { type AuthedRequest, companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/** Manufacturing: recipes and work orders. */
export function registerManufacturingRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles, withActor } = ctx;

  const parseRecipeComponents = (value: unknown) => {
    if (!Array.isArray(value)) throw new HttpError(400, 'components must be an array.');
    return value.map((raw) => {
      const c = asRecord(raw, 'component');
      return { componentItemId: requiredString(c.componentItemId, 'componentItemId'), quantity: requiredNumber(c.quantity, 'quantity') };
    });
  };
  const loadRecipe = (req: AuthedRequest) => {
    const recipe = store.getRecipeById(req.params.id);
    if (!recipe) throw new HttpError(404, 'Recipe not found.');
    requireCompanyRoles(req, recipe.companyId, companyManagementRoles);
    return recipe;
  };
  app.get('/companies/:companyId/recipes', authMiddleware, handler((req, res) => {
    requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
    res.json(store.listRecipes(req.params.companyId));
  }));
  app.post('/companies/:companyId/recipes', authMiddleware, handler((req, res) => {
    requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
    const body = asRecord(req.body, 'body');
    try {
      const recipe = withActor(req, () => store.createRecipe(req.params.companyId, {
        name: requiredString(body.name, 'name', { min: 1 }),
        outputItemId: requiredString(body.outputItemId, 'outputItemId'),
        outputQuantity: requiredNumber(body.outputQuantity, 'outputQuantity'),
        components: parseRecipeComponents(body.components),
        notes: optionalString(body.notes),
      }));
      res.status(201).json(recipe);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, error instanceof Error ? error.message : 'Could not create recipe.');
    }
  }));
  app.get('/recipes/:id', authMiddleware, handler((req, res) => { res.json(loadRecipe(req)); }));
  app.put('/recipes/:id', authMiddleware, handler((req, res) => {
    loadRecipe(req);
    const body = asRecord(req.body, 'body');
    try {
      res.json(store.updateRecipe(req.params.id, {
        name: body.name !== undefined ? requiredString(body.name, 'name', { min: 1 }) : undefined,
        outputItemId: optionalString(body.outputItemId),
        outputQuantity: body.outputQuantity !== undefined ? requiredNumber(body.outputQuantity, 'outputQuantity') : undefined,
        components: body.components !== undefined ? parseRecipeComponents(body.components) : undefined,
        notes: optionalString(body.notes),
      }));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, error instanceof Error ? error.message : 'Could not update recipe.');
    }
  }));
  app.delete('/recipes/:id', authMiddleware, handler((req, res) => {
    loadRecipe(req);
    try { store.deleteRecipe(req.params.id); res.status(204).end(); }
    catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Could not delete recipe.'); }
  }));

  const loadWorkOrder = (req: AuthedRequest) => {
    const wo = store.getWorkOrderById(req.params.id);
    if (!wo) throw new HttpError(404, 'Work order not found.');
    requireCompanyRoles(req, wo.companyId, companyManagementRoles);
    return wo;
  };
  app.get('/companies/:companyId/work-orders', authMiddleware, handler((req, res) => {
    requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
    res.json(store.listWorkOrders(req.params.companyId));
  }));
  app.post('/companies/:companyId/work-orders', authMiddleware, handler((req, res) => {
    requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
    const body = asRecord(req.body, 'body');
    try {
      const wo = withActor(req, () => store.createWorkOrder(req.params.companyId, {
        recipeId: requiredString(body.recipeId, 'recipeId'),
        batches: requiredNumber(body.batches, 'batches'),
        notes: optionalString(body.notes),
      }));
      res.status(201).json(wo);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, error instanceof Error ? error.message : 'Could not create work order.');
    }
  }));
  app.put('/work-orders/:id', authMiddleware, handler((req, res) => {
    const wo = loadWorkOrder(req);
    requireCompanyRoles(req, wo.companyId, companyManagementRoles);
    if (wo.status !== 'planned') throw new HttpError(409, 'Only a planned work order can be edited.');
    const body = asRecord(req.body, 'body');
    res.json(withActor(req, () => store.updateWorkOrder(wo.id, {
      batches: body.batches !== undefined ? requiredNumber(body.batches, 'batches') : undefined,
      notes: body.notes !== undefined ? optionalString(body.notes) ?? null : undefined,
    })));
  }));
  app.get('/work-orders/:id', authMiddleware, handler((req, res) => { res.json(loadWorkOrder(req)); }));
  app.get('/work-orders/:id/material-availability', authMiddleware, handler((req, res) => {
    loadWorkOrder(req);
    res.json(store.getWorkOrderMaterialAvailability(req.params.id));
  }));
  app.post('/work-orders/:id/complete', authMiddleware, handler((req, res) => {
    loadWorkOrder(req);
    const body = asRecord(req.body, 'body');
    try {
      res.json(withActor(req, () => store.completeWorkOrder(req.params.id, body.producedQuantity !== undefined ? requiredNumber(body.producedQuantity, 'producedQuantity') : undefined)));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, error instanceof Error ? error.message : 'Could not complete work order.');
    }
  }));
  app.post('/work-orders/:id/cancel', authMiddleware, handler((req, res) => {
    loadWorkOrder(req);
    try { res.json(store.cancelWorkOrder(req.params.id)); }
    catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Could not cancel work order.'); }
  }));
  app.delete('/work-orders/:id', authMiddleware, handler((req, res) => {
    loadWorkOrder(req);
    try { store.deleteWorkOrder(req.params.id); res.status(204).end(); }
    catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Could not delete work order.'); }
  }));
}
