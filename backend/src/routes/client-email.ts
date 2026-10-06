import { DEFAULT_REMINDER_DAYS, emailInvoice } from '../finance/client-email';
import { HttpError } from '../http';
import { asRecord, optionalString } from '../validation';
import type { RouteContext } from './context';
import { companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/** Email to clients. */
export function registerClientEmailRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles, withActor } = ctx;

  app.post(
    '/invoices/:id/email',
    authMiddleware,
    handler(async (req, res) => {
      const invoice = store.getInvoiceById(req.params.id);
      if (!invoice) throw new HttpError(404, 'Invoice not found.');
      requireCompanyRoles(req, invoice.companyId, companyManagementRoles);
      const body = asRecord(req.body ?? {}, 'body');
      const to = optionalString(body.to) ?? store.getClientById(invoice.clientId)?.email;
      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new HttpError(400, 'The client has no valid email address; enter one.');
      const result = await emailInvoice(store, invoice, { to, message: optionalString(body.message) });
      // emailConfigured only describes a send that reached the provider step; a refusal is about the invoice.
      if (!result.sent) throw new HttpError(409, result.error ?? 'The email was not sent.', 'refused' in result ? undefined : { emailConfigured: Boolean(process.env.RESEND_API_KEY) });
      withActor(req, () => store.createActivityEvent({ companyId: invoice.companyId, entityType: 'invoice', entityId: invoice.id, action: 'emailed', summary: `Invoice ${invoice.invoiceNumber} emailed to ${to}.` }));
      res.json({ sent: true, to });
    }),
  );

  app.get(
    '/companies/:companyId/client-reminders',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json({ ...store.clientEmail.settings(req.params.companyId), emailConfigured: Boolean(process.env.RESEND_API_KEY) });
    }),
  );

  app.put(
    '/companies/:companyId/client-reminders',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const days = body.days === undefined ? DEFAULT_REMINDER_DAYS : (Array.isArray(body.days) ? body.days : []).map((d) => Number(d));
      if (!days.length || days.length > 8 || days.some((d) => !Number.isInteger(d) || d < 1 || d > 365)) throw new HttpError(400, 'Reminder days are 1 to 365, up to 8 of them.');
      store.clientEmail.setSettings(req.params.companyId, body.enabled === true, [...new Set(days)].sort((a, b) => a - b));
      res.json({ ...store.clientEmail.settings(req.params.companyId), emailConfigured: Boolean(process.env.RESEND_API_KEY) });
    }),
  );
}
