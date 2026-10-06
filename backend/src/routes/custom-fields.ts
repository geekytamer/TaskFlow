import { customFieldEntityTypes, customFieldTypes } from '../types';
import { HttpError } from '../http';
import { asRecord, enumValue, optionalBoolean, optionalNumber, optionalString, requiredString } from '../validation';
import type { RouteContext } from './context';
import { handler } from './shared';
import type { Express } from 'express';

/** Custom field definitions. */
export function registerCustomFieldRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles } = ctx;

  app.get(
    '/companies/:companyId/custom-fields',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
      const entityType =
        req.query.entityType !== undefined
          ? enumValue(req.query.entityType, 'entityType', customFieldEntityTypes)
          : undefined;
      res.json(store.listCustomFieldDefinitions(req.params.companyId, entityType));
    }),
  );

  app.post(
    '/companies/:companyId/custom-fields',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager']);
      const body = asRecord(req.body, 'body');
      try {
        const def = store.createCustomFieldDefinition({
          companyId: req.params.companyId,
          entityType: enumValue(body.entityType, 'entityType', customFieldEntityTypes),
          label: requiredString(body.label, 'label', { min: 1 }),
          fieldType: enumValue(body.fieldType, 'fieldType', customFieldTypes),
          key: optionalString(body.key),
          options: Array.isArray(body.options) ? body.options.map((o) => String(o)) : undefined,
          required: optionalBoolean(body.required) ?? false,
          sortOrder: optionalNumber(body.sortOrder),
        });
        res.status(201).json(def);
      } catch (error: any) {
        throw new HttpError(400, error?.message || 'Could not create custom field.');
      }
    }),
  );

  app.put(
    '/custom-fields/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getCustomFieldDefinitionById(req.params.id);
      if (!existing) throw new HttpError(404, 'Custom field not found.');
      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager']);
      const body = asRecord(req.body, 'body');
      try {
        const def = store.updateCustomFieldDefinition(req.params.id, {
          label: body.label !== undefined ? requiredString(body.label, 'label', { min: 1 }) : undefined,
          options: Array.isArray(body.options) ? body.options.map((o) => String(o)) : undefined,
          required: body.required !== undefined ? optionalBoolean(body.required) : undefined,
          sortOrder: body.sortOrder !== undefined ? optionalNumber(body.sortOrder) : undefined,
        });
        if (!def) throw new HttpError(404, 'Custom field not found.');
        res.json(def);
      } catch (error: any) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, error?.message || 'Could not update custom field.');
      }
    }),
  );

  app.delete(
    '/custom-fields/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getCustomFieldDefinitionById(req.params.id);
      if (!existing) throw new HttpError(404, 'Custom field not found.');
      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager']);
      store.deleteCustomFieldDefinition(req.params.id);
      res.json({ success: true });
    }),
  );
}
