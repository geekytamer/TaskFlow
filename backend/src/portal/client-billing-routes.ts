import type { Request, RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { Contact, Invoice } from '../types';
import {
  balanceAfter,
  clientInvoices,
  isClientInvoice,
  receiptNumber,
  statementTotals,
  toInvoiceDetail,
  toInvoiceSummary,
} from './billing';
import { receiptHtml, statementHtml } from './billing-docs';
import type { PortalSession } from './portal-store';

type SessionRequest = Request & { portal?: PortalSession };

/** Renders documents; injected so tests never need a browser. */
export interface PortalPdfRenderer {
  invoice(url: string, format: 'A4' | 'Letter', landscape: boolean): Promise<Buffer>;
  html(html: string): Promise<Buffer>;
}

const docLang = (req: Request): 'en' | 'ar' => (req.query.lang === 'ar' ? 'ar' : 'en');
const safeName = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, '-');

const sendPdf = (res: Response, pdf: Buffer, fileName: string) => {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${safeName(fileName)}.pdf"`,
    'Content-Length': String(pdf.length),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  res.end(pdf);
};

/** Invoices, receipts and statements for the client audience. Ownership is checked before anything renders. */
export function registerClientBillingRoutes(
  router: Router,
  store: DataStore,
  companyId: string,
  requireClientSession: RequestHandler,
  deps: { pdf: PortalPdfRenderer; appPublicUrl: string },
): void {
  const self = (session: PortalSession): Contact => {
    const contact = store.getContactById(session.contactId);
    if (!contact || contact.companyId !== companyId) throw new HttpError(404, 'Not found.');
    return contact;
  };

  const ownInvoice = (contact: Contact, id: string): Invoice => {
    const invoice = store.getInvoiceById(id);
    if (!invoice || invoice.companyId !== companyId || invoice.status === 'Draft' || !isClientInvoice(invoice, contact)) {
      throw new HttpError(404, 'Not found.');
    }
    return invoice;
  };

  const ownCampaign = (contact: Contact, id: string) => {
    const campaign = store.getCrmCampaignById(id);
    if (!campaign || campaign.companyId !== companyId || campaign.contactId !== contact.id || campaign.archivedAt) throw new HttpError(404, 'Not found.');
    return campaign;
  };

  const company = () => {
    const c = store.getCompanyById(companyId);
    return { name: c?.name ?? '', address: c?.address ?? null };
  };

  router.get('/client/invoices', requireClientSession, (req: SessionRequest, res: Response) => {
    res.json(clientInvoices(store, companyId, self(req.portal!)).map((i) => toInvoiceSummary(store, i)));
  });

  router.get('/client/invoices/:id', requireClientSession, (req: SessionRequest, res: Response) => {
    res.json(toInvoiceDetail(store, ownInvoice(self(req.portal!), req.params.id)));
  });

  router.get('/client/invoices/:id/pdf', requireClientSession, async (req: SessionRequest, res: Response, next) => {
    try {
      const invoice = ownInvoice(self(req.portal!), req.params.id);
      // Same page geometry and page the staff PDF uses, so the two never differ.
      const docPage = (invoice.templateSnapshot as { doc?: { page?: { size?: string; orientation?: string } } } | undefined)?.doc?.page;
      const url = `${deps.appPublicUrl}/invoice/${encodeURIComponent(invoice.id)}?lang=${docLang(req)}`;
      const pdf = await deps.pdf.invoice(url, docPage?.size === 'Letter' ? 'Letter' : 'A4', docPage?.orientation === 'landscape');
      sendPdf(res, pdf, `Invoice-${invoice.invoiceNumber}`);
    } catch (error) {
      next(error);
    }
  });

  router.get('/client/payments/:id/receipt.pdf', requireClientSession, async (req: SessionRequest, res: Response, next) => {
    try {
      const contact = self(req.portal!);
      const payment = store.getPaymentById(req.params.id);
      if (!payment) throw new HttpError(404, 'Not found.');
      const invoice = ownInvoice(contact, payment.invoiceId);
      const number = receiptNumber(invoice, payment);
      const html = receiptHtml({
        lang: docLang(req), company: company(), clientName: contact.name, receiptNumber: number,
        paidAt: payment.paidAt, amount: payment.amount, method: payment.method ?? null, currency: invoice.currency ?? 'USD',
        invoiceNumber: invoice.invoiceNumber, invoiceTotal: invoice.total, balanceAfter: balanceAfter(store, invoice, payment),
      });
      sendPdf(res, await deps.pdf.html(html), `Receipt-${number}`);
    } catch (error) {
      next(error);
    }
  });

  const statementOf = (contact: Contact, campaignId: string) => {
    const campaign = ownCampaign(contact, campaignId);
    const invoices = clientInvoices(store, companyId, contact).filter((i) => i.campaignId === campaign.id).map((i) => toInvoiceSummary(store, i));
    return {
      campaign: { id: campaign.id, name: campaign.name },
      currency: invoices[0]?.currency ?? store.getCompanyFinanceSettings(companyId).currencyCode,
      invoices,
      totals: statementTotals(invoices),
    };
  };

  router.get('/client/campaigns/:id/statement', requireClientSession, (req: SessionRequest, res: Response) => {
    res.json(statementOf(self(req.portal!), req.params.id));
  });

  router.get('/client/campaigns/:id/statement.pdf', requireClientSession, async (req: SessionRequest, res: Response, next) => {
    try {
      const contact = self(req.portal!);
      const s = statementOf(contact, req.params.id);
      const html = statementHtml({
        lang: docLang(req), company: company(), clientName: contact.name, campaignName: s.campaign.name,
        generatedAt: new Date(), currency: s.currency, invoices: s.invoices, totals: s.totals,
      });
      sendPdf(res, await deps.pdf.html(html), `Statement-${s.campaign.name}`);
    } catch (error) {
      next(error);
    }
  });
}
