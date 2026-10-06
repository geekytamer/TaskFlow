import { runDueRecurring } from '../finance/recurring-runner';
import type { RecurringDocument, RecurringFrequency, RecurringKind, RecurringMode } from '../finance/recurring';
import { HttpError } from '../http';
import { asRecord, enumValue, optionalNumber, optionalString, requiredDateInput, requiredString } from '../validation';
import type { RouteContext } from './context';
import { companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/** Recurring invoices and bills. */
export function registerRecurringRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles, withActor, ensureClientBelongsToCompany, parseInvoiceLineItems } = ctx;

  const recurringFrequencies: RecurringFrequency[] = ['weekly', 'monthly', 'quarterly', 'yearly'];
  const parseRecurring = (companyId: string, body: Record<string, unknown>, existing?: RecurringDocument) => {
    const kind: RecurringKind = existing?.kind ?? enumValue(body.kind, 'kind', ['invoice', 'bill'] as RecurringKind[]);
    const partyId = body.partyId !== undefined ? requiredString(body.partyId, 'partyId') : existing?.partyId;
    if (!partyId) throw new HttpError(400, 'partyId is required.');
    if (kind === 'invoice') ensureClientBelongsToCompany(partyId, companyId);
    else {
      const supplier = store.getSupplierById(partyId);
      if (!supplier || supplier.companyId !== companyId) throw new HttpError(400, 'Supplier does not belong to this company.');
    }
    let content = existing?.content;
    if (body.content !== undefined) {
      const raw = asRecord(body.content, 'content');
      if (kind === 'invoice') {
        const lineItems = parseInvoiceLineItems(raw.lineItems);
        if (!lineItems.length) throw new HttpError(400, 'An invoice needs at least one line.');
        const templateId = optionalString(raw.templateId);
        if (templateId) {
          const template = store.getInvoiceTemplateById(templateId);
          if (!template || template.companyId !== companyId) throw new HttpError(400, 'Invoice template does not belong to this company.');
        }
        content = { lineItems, taxRate: optionalNumber(raw.taxRate), currency: optionalString(raw.currency), notes: optionalString(raw.notes), templateId };
      } else {
        const amount = optionalNumber(raw.amount);
        if (!amount || amount <= 0) throw new HttpError(400, 'A bill needs an amount above zero.');
        const expenseAccountId = optionalString(raw.expenseAccountId);
        if (expenseAccountId && !store.listLedgerAccounts(companyId).some((a) => a.id === expenseAccountId)) {
          throw new HttpError(400, 'Expense account does not belong to this company.');
        }
        content = { amount, taxRate: optionalNumber(raw.taxRate), expenseAccountId, notes: optionalString(raw.notes) };
      }
    }
    if (!content) throw new HttpError(400, 'content is required.');
    const day = (value: unknown, field: string) => requiredDateInput(value, field).slice(0, 10);
    const startDate = body.startDate !== undefined ? day(body.startDate, 'startDate') : existing?.startDate;
    if (!startDate) throw new HttpError(400, 'startDate is required.');
    const endDate = body.endDate === null || body.endDate === '' ? null : body.endDate !== undefined ? day(body.endDate, 'endDate') : existing?.endDate ?? null;
    if (endDate && endDate < startDate) throw new HttpError(400, 'The end date is before the start date.');
    const paymentTermsDays = body.paymentTermsDays !== undefined ? Number(body.paymentTermsDays) : existing?.paymentTermsDays ?? 30;
    if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0 || paymentTermsDays > 365) throw new HttpError(400, 'paymentTermsDays must be 0 to 365.');
    return {
      kind, partyId, content, startDate, endDate, paymentTermsDays,
      name: body.name !== undefined ? requiredString(body.name, 'name', { min: 2 }) : existing?.name ?? '',
      frequency: body.frequency !== undefined ? enumValue(body.frequency, 'frequency', recurringFrequencies) : existing?.frequency ?? 'monthly',
      mode: (body.mode !== undefined ? enumValue(body.mode, 'mode', ['draft', 'issue'] as RecurringMode[]) : existing?.mode ?? 'draft') as RecurringMode,
    };
  };

  app.get(
    '/companies/:companyId/recurring-documents',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.recurring.list(req.params.companyId).map((r) => ({ ...r, lastRuns: store.recurring.runs(r.id, 3) })));
    }),
  );

  app.post(
    '/companies/:companyId/recurring-documents',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const parsed = parseRecurring(req.params.companyId, asRecord(req.body, 'body'));
      if (!parsed.name) throw new HttpError(400, 'name is required.');
      const record = store.recurring.create({ ...parsed, companyId: req.params.companyId, createdByUserId: req.user!.id });
      withActor(req, () => store.createActivityEvent({ companyId: record.companyId, entityType: 'recurring_document', entityId: record.id, action: 'created', summary: `Recurring ${record.kind} "${record.name}" scheduled ${record.frequency} from ${record.startDate}.` }));
      runDueRecurring(store, new Date(), { id: record.id });
      res.status(201).json(store.recurring.get(record.id));
    }),
  );

  app.put(
    '/recurring-documents/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.recurring.get(req.params.id);
      if (!existing) throw new HttpError(404, 'Recurring document not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const parsed = parseRecurring(existing.companyId, body, existing);
      const active = body.active !== undefined ? Boolean(body.active) : existing.active;
      store.recurring.update(existing.id, { ...parsed, active });
      if (active) runDueRecurring(store, new Date(), { id: existing.id });
      res.json(store.recurring.get(existing.id));
    }),
  );

  app.delete(
    '/recurring-documents/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.recurring.get(req.params.id);
      if (!existing) throw new HttpError(404, 'Recurring document not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      store.recurring.remove(existing.id);
      res.status(204).end();
    }),
  );
}
