import type { QuotationStatus } from '../types';
import { HttpError } from '../http';
import { asRecord, enumValue, optionalDateInput, optionalNumber, optionalString, requiredDateInput, requiredString } from '../validation';
import type { RouteContext } from './context';
import { type AuthedRequest, companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/** Quotations. */
export function registerQuotationRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles, withActor, ensureClientBelongsToCompany, parseSalesOrderItems, ensureSalesItemsBelongToCompany } = ctx;

  const quotationStatuses: QuotationStatus[] = ['Draft', 'Sent', 'Accepted', 'Declined', 'Expired'];

  const loadQuotation = (req: AuthedRequest) => {
    const quote = store.getQuotationById(req.params.id);
    if (!quote) throw new HttpError(404, 'Quotation not found.');
    requireCompanyRoles(req, quote.companyId, companyManagementRoles);
    return quote;
  };

  const ensureQuoteTemplate = (templateId: string | undefined, companyId: string) => {
    if (!templateId) return;
    const template = store.getInvoiceTemplateById(templateId);
    if (!template || template.companyId !== companyId || template.docType !== 'quote') {
      throw new HttpError(400, 'Choose a quotation template from this company.');
    }
  };

  const asBadRequest = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, error instanceof Error ? error.message : 'Invalid quotation.');
    }
  };

  app.get(
    '/companies/:companyId/quotations',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const opportunityId = typeof req.query.opportunityId === 'string' ? req.query.opportunityId : undefined;
      res.json(store.listQuotations(req.params.companyId, { opportunityId }));
    }),
  );

  app.post(
    '/companies/:companyId/quotations',
    authMiddleware,
    handler((req, res) => {
      const companyId = req.params.companyId;
      requireCompanyRoles(req, companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const opportunityId = optionalString(body.opportunityId);
      let contactId = optionalString(body.contactId);
      let clientId = optionalString(body.clientId);
      if (opportunityId) {
        const opportunity = store.getOpportunityById(opportunityId);
        if (!opportunity || opportunity.companyId !== companyId) throw new HttpError(400, 'Opportunity does not belong to this company.');
        contactId = contactId ?? opportunity.contactId;
      }
      if (contactId) {
        const contact = store.getContactById(contactId);
        if (!contact || contact.companyId !== companyId) throw new HttpError(400, 'Contact does not belong to this company.');
        clientId = clientId ?? store.getClientById(contactId)?.id ?? contactId;
      }
      if (!clientId) throw new HttpError(400, 'Choose the client this quotation is for.');
      ensureClientBelongsToCompany(clientId, companyId);
      if (!store.getClientById(clientId)) throw new HttpError(400, 'Client not found.');
      const items = parseSalesOrderItems(body.items);
      ensureSalesItemsBelongToCompany(items, companyId);
      const templateId = optionalString(body.templateId);
      ensureQuoteTemplate(templateId, companyId);
      const issueDate = optionalDateInput(body.issueDate) || new Date().toISOString();
      const validUntil = optionalDateInput(body.validUntil)
        || new Date(new Date(issueDate).getTime() + 1000 * 60 * 60 * 24 * 30).toISOString();
      const quote = asBadRequest(() => withActor(req, () =>
        store.createQuotation({
          companyId,
          clientId: clientId!,
          contactId,
          opportunityId,
          issueDate,
          validUntil,
          items,
          taxRate: optionalNumber(body.taxRate),
          currency: optionalString(body.currency),
          exchangeRate: optionalNumber(body.exchangeRate),
          notes: optionalString(body.notes),
          templateId,
        }),
      ));
      res.status(201).json(quote);
    }),
  );

  app.get(
    '/quotations/:id',
    authMiddleware,
    handler((req, res) => {
      res.json(loadQuotation(req));
    }),
  );

  app.put(
    '/quotations/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = loadQuotation(req);
      const body = asRecord(req.body, 'body');
      const clientId = body.clientId !== undefined ? requiredString(body.clientId, 'clientId') : undefined;
      if (clientId) {
        ensureClientBelongsToCompany(clientId, existing.companyId);
        if (!store.getClientById(clientId)) throw new HttpError(400, 'Client not found.');
      }
      const items = body.items !== undefined ? parseSalesOrderItems(body.items) : undefined;
      if (items) ensureSalesItemsBelongToCompany(items, existing.companyId);
      const contactId = body.contactId !== undefined ? optionalString(body.contactId) ?? null : undefined;
      if (contactId) {
        const contact = store.getContactById(contactId);
        if (!contact || contact.companyId !== existing.companyId) throw new HttpError(400, 'Contact does not belong to this company.');
      }
      const templateId = body.templateId !== undefined ? optionalString(body.templateId) ?? null : undefined;
      ensureQuoteTemplate(templateId ?? undefined, existing.companyId);
      const updated = asBadRequest(() => withActor(req, () =>
        store.updateQuotation(existing.id, {
          clientId,
          contactId,
          issueDate: body.issueDate !== undefined ? requiredDateInput(body.issueDate, 'issueDate') : undefined,
          validUntil: body.validUntil !== undefined ? requiredDateInput(body.validUntil, 'validUntil') : undefined,
          items,
          taxRate: optionalNumber(body.taxRate),
          currency: optionalString(body.currency),
          exchangeRate: optionalNumber(body.exchangeRate),
          notes: body.notes !== undefined ? optionalString(body.notes) ?? null : undefined,
          templateId,
        }),
      ));
      if (!updated) throw new HttpError(404, 'Quotation not found.');
      res.json(updated);
    }),
  );

  app.patch(
    '/quotations/:id/status',
    authMiddleware,
    handler((req, res) => {
      const existing = loadQuotation(req);
      const status = enumValue(asRecord(req.body, 'body').status, 'status', quotationStatuses);
      const updated = asBadRequest(() => withActor(req, () => store.setQuotationStatus(existing.id, status)));
      if (!updated) throw new HttpError(404, 'Quotation not found.');
      res.json(updated);
    }),
  );

  app.post(
    '/quotations/:id/sales-order',
    authMiddleware,
    handler((req, res) => {
      const quote = loadQuotation(req);
      if (quote.salesOrderId) {
        const existing = store.getSalesOrderById(quote.salesOrderId);
        if (existing) {
          res.json(existing);
          return;
        }
      }
      if (quote.invoiceId) throw new HttpError(409, 'This quotation was already invoiced directly.');
      if (quote.status !== 'Accepted') throw new HttpError(400, 'Only an accepted quotation becomes a sales order.');
      // Items archived since the quote was written cannot be sold again until restored.
      ensureSalesItemsBelongToCompany(quote.items, quote.companyId);
      const body = asRecord(req.body ?? {}, 'body');
      const expectedDate = optionalDateInput(body.expectedDate);
      const order = asBadRequest(() => withActor(req, () => {
        const created = store.createSalesOrder({
          companyId: quote.companyId,
          clientId: quote.clientId,
          contactId: quote.contactId,
          orderDate: new Date(optionalDateInput(body.orderDate) || new Date().toISOString()),
          expectedDate: expectedDate ? new Date(expectedDate) : undefined,
          status: 'Confirmed',
          items: quote.items,
          notes: optionalString(body.notes) || `Created from quotation ${quote.quoteNumber}.`,
        });
        store.linkQuotation(quote.id, { salesOrderId: created.id });
        return created;
      }));
      res.status(201).json(order);
    }),
  );

  app.post(
    '/quotations/:id/invoice',
    authMiddleware,
    handler((req, res) => {
      const quote = loadQuotation(req);
      if (quote.invoiceId) {
        const existing = store.getInvoiceById(quote.invoiceId);
        if (existing) {
          res.json(existing);
          return;
        }
      }
      if (quote.salesOrderId) throw new HttpError(409, 'This quotation became a sales order. Invoice the sales order instead.');
      if (quote.status !== 'Accepted') throw new HttpError(400, 'Only an accepted quotation can be invoiced.');
      const body = asRecord(req.body ?? {}, 'body');
      const templateId = optionalString(body.templateId);
      if (templateId) {
        const template = store.getInvoiceTemplateById(templateId);
        if (!template || template.companyId !== quote.companyId || (template.docType ?? 'invoice') !== 'invoice') {
          throw new HttpError(400, 'Invoice template does not belong to this company or document type.');
        }
      }
      const issueDate = optionalDateInput(body.issueDate) || new Date().toISOString();
      const dueDate = optionalDateInput(body.dueDate) || new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
      const invoice = asBadRequest(() => withActor(req, () => {
        const created = store.createInvoice({
          companyId: quote.companyId,
          clientId: quote.clientId,
          contactId: quote.contactId,
          templateId,
          issueDate: new Date(issueDate),
          dueDate: new Date(dueDate),
          lineItems: quote.items.map((item) => ({
            itemType: 'Manual',
            sku: item.sku,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            discountType: item.discountType,
            amount: item.lineTotal,
          })),
          total: quote.totalAmount,
          status: 'Draft',
          notes: optionalString(body.notes) || `Created from quotation ${quote.quoteNumber}.`,
          currency: quote.currency,
          exchangeRate: quote.exchangeRate,
          taxRate: quote.taxRate,
        });
        store.linkQuotation(quote.id, { invoiceId: created.id });
        return created;
      }));
      res.status(201).json(invoice);
    }),
  );

  app.delete(
    '/quotations/:id',
    authMiddleware,
    handler((req, res) => {
      const quote = loadQuotation(req);
      try {
        withActor(req, () => store.deleteQuotation(quote.id));
      } catch (error) {
        throw new HttpError(409, error instanceof Error ? error.message : 'Could not delete quotation.');
      }
      res.status(204).end();
    }),
  );
}
