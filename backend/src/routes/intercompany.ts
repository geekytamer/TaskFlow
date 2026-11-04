import { HttpError } from '../http';
import { asRecord, enumValue, requiredString } from '../validation';
import type { RouteContext } from './context';
import { companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/**
 * Intercompany (group stage 4; spec 2026-11-04-intercompany-design): sister
 * companies as partners, balances both sides agree on, and payments to match.
 */
export function registerIntercompanyRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles, withActor } = ctx;

  /** Sisters (with this company's client and supplier records for them), balances, and payments to match. */
  app.get('/companies/:companyId/intercompany', authMiddleware, handler((req, res) => {
    const { companyId } = req.params;
    requireCompanyRoles(req, companyId, companyManagementRoles, 'finance.view');
    const sisters = store.sisterCompanyIds(companyId).map((id) => {
      const company = store.getCompanyById(id);
      return {
        id, name: company?.name ?? id, parentCompanyId: company?.parentCompanyId ?? null,
        currency: store.getCompanyFinanceSettings(id).currencyCode,
        clientId: store.intercompanyRecord(companyId, id, 'client'), supplierId: store.intercompanyRecord(companyId, id, 'supplier'),
      };
    });
    res.json({ sisters, balances: store.intercompanyBalances(companyId), toMatch: store.intercompanyToMatch(companyId) });
  }));

  /** This company's client or supplier record for a sister (made once; afterwards it is in the usual pickers). */
  app.post('/companies/:companyId/intercompany/partners', authMiddleware, handler((req, res) => {
    const { companyId } = req.params;
    requireCompanyRoles(req, companyId, companyManagementRoles, 'contacts.manage');
    const body = asRecord(req.body, 'body');
    const kind = enumValue(body.kind, 'kind', ['client', 'supplier'] as const) as 'client' | 'supplier';
    res.status(201).json(withActor(req, () => store.ensureIntercompanyPartner(companyId, requiredString(body.sisterId, 'sisterId'), kind)));
  }));

  /** Seller: record the receipt for a sister's payment of its bill. */
  app.post('/companies/:companyId/intercompany/match-receipt', authMiddleware, handler((req, res) => {
    const { companyId } = req.params;
    requireCompanyRoles(req, companyId, companyManagementRoles, 'invoices.pay');
    const paymentId = requiredString(asRecord(req.body, 'body').paymentId, 'paymentId');
    res.json(withActor(req, () => store.matchIntercompanyPayment(companyId, 'bill_payment', paymentId)));
  }));

  /** Buyer: record the payment for a sister's receipt on its invoice (held when payments need approval). */
  app.post('/companies/:companyId/intercompany/match-payment', authMiddleware, handler((req, res) => {
    const { companyId } = req.params;
    requireCompanyRoles(req, companyId, companyManagementRoles, 'vendor-bills.pay');
    const paymentId = requiredString(asRecord(req.body, 'body').paymentId, 'paymentId');
    const result = withActor(req, () => store.matchIntercompanyPayment(companyId, 'invoice_payment', paymentId));
    res.status(result.hold ? 202 : 200).json(result);
  }));

  /** Makes the sister's bill for an issued invoice when it didn't happen at issue. */
  app.post('/invoices/:id/intercompany-bill', authMiddleware, handler((req, res) => {
    const invoice = store.getInvoiceById(req.params.id);
    if (!invoice) throw new HttpError(404, 'Invoice not found.');
    requireCompanyRoles(req, invoice.companyId, companyManagementRoles, 'invoices.edit');
    res.json(withActor(req, () => store.mirrorInvoiceToBill(invoice.id)));
  }));

  /** Makes the sister's sales order for an ordered purchase order when it didn't happen at ordering. */
  app.post('/purchase-orders/:id/intercompany-order', authMiddleware, handler((req, res) => {
    const order = store.getPurchaseOrderById(req.params.id);
    if (!order) throw new HttpError(404, 'Purchase order not found.');
    requireCompanyRoles(req, order.companyId, companyManagementRoles, 'purchasing.edit');
    if (order.status === 'Draft') throw new HttpError(409, 'Order it first.');
    res.json(withActor(req, () => store.mirrorPurchaseOrderToSalesOrder(order.id)));
  }));
}
