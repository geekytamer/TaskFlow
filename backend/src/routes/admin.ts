import { isSwitchableModule } from '../permissions/company-modules';
import { type NumberingEntityType } from '../types';
import { HttpError, getAccessibleCompanyIds } from '../http';
import { asRecord, enumValue, optionalNumber, optionalString, requiredDateInput, requiredNumber, requiredString } from '../validation';
import type { RouteContext } from './context';
import { handler } from './shared';
import type { Express } from 'express';


const numberingEntityTypes = [
  'client',
  'supplier',
  'inventory_item',
  'purchase_order',
  'sales_order',
  'sales_invoice',
  'vendor_invoice',
] as const;

/** Admin panel, companies and company-wide settings. */
export function registerAdminRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyAccess, requireCompanyRoles, requireSuperAdmin, uploadedImage, snapshotAuthz, publishAuthzChange } = ctx;

  app.get('/admin/overview', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    res.json(store.getAdminOverview());
  }));

  app.get('/admin/companies', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    res.json(store.listAdminCompanies());
  }));

  app.get('/admin/users', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    res.json(store.listAdminUsers());
  }));

  app.get('/admin/activity', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    const q = req.query as Record<string, string | undefined>;
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    if (from && Number.isNaN(from.getTime())) throw new HttpError(400, 'Invalid from date');
    if (to && Number.isNaN(to.getTime())) throw new HttpError(400, 'Invalid to date');
    res.json(store.listAdminActivity({
      companyId: q.companyId || undefined,
      entityType: q.entityType || undefined,
      actorUserId: q.actorUserId || undefined,
      action: q.action || undefined,
      from,
      to,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    }));
  }));

  app.get('/admin/health', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    res.json(store.getAdminHealth());
  }));

  // Tools
  app.post('/admin/tools/sweep-overdue-all', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    res.json({ created: store.sweepOverdueInvoiceFollowupsAll() });
  }));

  app.post('/admin/tools/recompute-commissions-all', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    res.json({ recomputed: store.recomputeCommissionsAll() });
  }));

  app.post('/admin/tools/refresh-invoice-statuses', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    res.json({ refreshed: store.refreshAllInvoiceStatuses() });
  }));

  app.get('/admin/tools/backup', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    const bytes = store.readDatabaseFile();
    if (!bytes) throw new HttpError(500, 'Could not read database file.');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="taskflow-${stamp}.db"`);
    res.send(bytes);
  }));

  // Impersonation — Admin steps into another user's session.
  // Frontend stores the original admin token in localStorage and swaps to
  // the returned token; "Exit" restores the original token client-side.
  app.post('/admin/impersonate/:userId', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    const target = store.getUserById(req.params.userId);
    if (!target) throw new HttpError(404, 'User not found.');
    const token = store.issueToken(target.id);
    // Audit
    store.createActivityEvent({
      companyId: target.companyIds[0] ?? 'system',
      entityType: 'contact',     // no admin entity type; piggyback on contact
      entityId: target.id,
      action: 'admin_impersonate_start',
      summary: `Admin ${req.user!.name} started impersonating ${target.name}.`,
      metadata: { adminUserId: req.user!.id, targetUserId: target.id },
    });
    res.json({ token, user: target });
  }));

  /** Validates a list of modules to switch off; undefined when absent. */
  const parseDisabledModules = (value: unknown): string[] | undefined => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      throw new HttpError(400, 'disabledModules must be a list of module keys.');
    }
    const invalid = (value as string[]).filter((key) => !isSwitchableModule(key));
    if (invalid.length) {
      throw new HttpError(400, `These modules cannot be switched off: ${invalid.join(', ')}.`);
    }
    return value as string[];
  };

  app.get(
    '/companies',
    authMiddleware,
    handler((req, res) => {
      // Practice companies are visible only to their own trainee, super admins included.
      const companies = store.listCompanies().filter((c) => !c.isTraining || c.trainingOwnerUserId === req.user!.id);
      if (req.user!.isSuperAdmin) {
        return res.json(companies);
      }
      const accessible = new Set(getAccessibleCompanyIds(req.user!));
      res.json(companies.filter((company) => accessible.has(company.id)));
    }),
  );

  app.get(
    '/companies/:id',
    authMiddleware,
    handler((req, res) => {
      requireCompanyAccess(req, req.params.id);
      const company = store.getCompanyById(req.params.id);
      if (!company) throw new HttpError(404, 'Company not found.');
      res.json(company);
    }),
  );

  app.post(
    '/companies',
    authMiddleware,
    handler(async (req, res) => {
      requireSuperAdmin(req);
      const body = asRecord(req.body, 'body');
      const company = store.createCompany({
        name: requiredString(body.name, 'name', { min: 2 }),
        website: optionalString(body.website),
        address: optionalString(body.address),
        logoUrl: optionalString(body.logoUrl),
        disabledModules: parseDisabledModules(body.disabledModules),
      });
      // A new company had no tuples, so everything it has now is the delta.
      await publishAuthzChange(new Map([[company.id, []]]));
      res.status(201).json(company);
    }),
  );

  app.put(
    '/companies/:id',
    authMiddleware,
    handler((req, res) => {
      // Super-admins manage any company; company Admins/Managers manage their own.
      if (!req.user?.isSuperAdmin) {
        requireCompanyRoles(req, req.params.id, ['Admin', 'Manager']);
      }
      const body = asRecord(req.body, 'body');
      if (body.disabledModules !== undefined && !req.user?.isSuperAdmin) {
        throw new HttpError(403, 'Only the platform administrator can switch modules on or off.');
      }
      const optionalText = (value: unknown) => (value !== undefined ? String(value || '') : undefined);
      const company = store.updateCompany(req.params.id, {
        name: body.name !== undefined ? requiredString(body.name, 'name', { min: 2 }) : undefined,
        website: optionalText(body.website),
        address: optionalText(body.address),
        logoUrl: body.logoUrl !== undefined ? uploadedImage(body.logoUrl, 'logoUrl') : undefined,
        legalName: optionalText(body.legalName),
        taxNumber: optionalText(body.taxNumber),
        registrationNumber: optionalText(body.registrationNumber),
        phone: optionalText(body.phone),
        email: optionalText(body.email),
        city: optionalText(body.city),
        country: optionalText(body.country),
        taxDetails: optionalText(body.taxDetails),
        payrollAccount: optionalText(body.payrollAccount)?.replace(/\s+/g, '').toUpperCase(),
        payrollBankCode: optionalText(body.payrollBankCode)?.trim().toUpperCase(),
        disabledModules: body.disabledModules !== undefined ? parseDisabledModules(body.disabledModules) : undefined,
      });
      if (!company) throw new HttpError(404, 'Company not found.');
      res.json(company);
    }),
  );

  app.delete(
    '/companies/:id',
    authMiddleware,
    handler(async (req, res) => {
      requireSuperAdmin(req);
      const cascade = req.query.cascade === 'true' || req.query.cascade === '1';
      const authzBefore = snapshotAuthz([req.params.id]);
      store.deleteCompany(req.params.id, { cascade });
      await publishAuthzChange(authzBefore);
      res.json({ success: true });
    }),
  );

  app.get(
    '/companies/:companyId/numbering-settings',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager']);
      res.json(store.listCompanyNumberingSettings(req.params.companyId));
    }),
  );

  app.put(
    '/companies/:companyId/numbering-settings/:entityType',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager']);
      const entityType = enumValue(
        req.params.entityType,
        'entityType',
        numberingEntityTypes,
      ) as NumberingEntityType;
      const body = asRecord(req.body, 'body');
      try {
        const setting = store.updateCompanyNumberingSetting(req.params.companyId, entityType, {
          prefix: body.prefix !== undefined ? requiredString(body.prefix, 'prefix') : undefined,
          padLength: body.padLength !== undefined ? requiredNumber(body.padLength, 'padLength') : undefined,
          nextNumber: body.nextNumber !== undefined ? requiredNumber(body.nextNumber, 'nextNumber') : undefined,
        });
        res.json(setting);
      } catch (error: any) {
        throw new HttpError(400, error?.message || 'Could not update numbering setting.');
      }
    }),
  );

  app.get(
    '/companies/:companyId/finance/settings',
    authMiddleware,
    handler((req, res) => {
      // Readable by any company member: the currency code (and other operational
      // settings) drive UI formatting for everyone, not just finance roles.
      // Mutating these still requires Admin/Manager (the PUT below).
      requireCompanyAccess(req, req.params.companyId);
      res.json(store.getCompanyFinanceSettings(req.params.companyId));
    }),
  );

  app.put(
    '/companies/:companyId/finance/settings',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager']);
      const body = asRecord(req.body, 'body');
      const lockedThroughDate =
        body.lockedThroughDate === null
          ? null
          : body.lockedThroughDate !== undefined
            ? new Date(requiredDateInput(body.lockedThroughDate, 'lockedThroughDate'))
            : undefined;
      try {
        res.json(
          store.updateCompanyFinanceSettings(req.params.companyId, {
            fiscalYearStartMonth:
              body.fiscalYearStartMonth !== undefined
                ? requiredNumber(body.fiscalYearStartMonth, 'fiscalYearStartMonth')
                : undefined,
            lockedThroughDate,
            gratuityEnabled: body.gratuityEnabled !== undefined ? Boolean(body.gratuityEnabled) : undefined,
            gratuityDaysFirstTier: optionalNumber(body.gratuityDaysFirstTier),
            gratuityTierYears: optionalNumber(body.gratuityTierYears),
            gratuityDaysAfterTier: optionalNumber(body.gratuityDaysAfterTier),
            gratuityMinServiceMonths: optionalNumber(body.gratuityMinServiceMonths),
            currencyCode:
              body.currencyCode !== undefined
                ? requiredString(body.currencyCode, 'currencyCode', { min: 3 })
                : undefined,
            poApprovalThreshold:
              body.poApprovalThreshold !== undefined
                ? requiredNumber(body.poApprovalThreshold, 'poApprovalThreshold')
                : undefined,
          }),
        );
      } catch (error: any) {
        throw new HttpError(400, error?.message || 'Could not update finance settings.');
      }
    }),
  );
}
