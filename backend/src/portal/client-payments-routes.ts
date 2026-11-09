import type { RequestHandler, Response, Router } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { Contact, Invoice } from '../types';
import { asRecord } from '../validation';
import { guardRecord } from '../finance/client-payment-routes';
import type { PaymentRecord } from '../finance/client-payments';
import { clientInvoices, isClientInvoice } from './billing';
import { downloadHeaders, readUpload } from './files';
import type { SessionRequest } from './common';

/**
 * A client's cheques and transfers in the portal: they see each cheque Peak
 * holds and when it will be deposited, and tell Peak about a transfer with
 * its receipt. Staff notes, staff names and other clients' records never
 * leave the server; a bounced cheque's reason stays with staff.
 */

/** Allow-listed: what the client may see of one record. */
export function clientRecordDto(store: DataStore, record: PaymentRecord, invoice?: Invoice) {
  const inv = invoice ?? store.getInvoiceById(record.invoiceId);
  return {
    id: record.id,
    invoiceId: record.invoiceId,
    invoiceNumber: inv?.invoiceNumber ?? null,
    method: record.method,
    status: record.status,
    amount: record.amount,
    currency: record.currency,
    chequeNumber: record.chequeNumber,
    bankName: record.bankName,
    dueDate: record.dueDate,
    reference: record.reference,
    paidOn: record.paidOn,
    reason: record.status === 'rejected' ? record.reason : null,
    fromYou: Boolean(record.createdByPortalUserId),
    files: store.clientPayments.files(record.id).map((f) => ({ id: f.id, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes })),
  };
}

/** What still waits on this invoice: outstanding less the cheques and transfers on their way. */
export const invoiceRoom = (store: DataStore, invoice: Invoice) => store.clientPayments.room(invoice);

export function registerClientPaymentPortalRoutes(router: Router, store: DataStore, companyId: string, requireClientSession: RequestHandler): void {
  const self = (req: SessionRequest): Contact => {
    const contact = store.getContactById(req.portal!.contactId);
    if (!contact || contact.companyId !== companyId) throw new HttpError(404, 'Not found.');
    return contact;
  };
  const ownInvoice = (contact: Contact, id: string): Invoice => {
    const invoice = store.getInvoiceById(id);
    if (!invoice || invoice.companyId !== companyId || invoice.status === 'Draft' || !isClientInvoice(invoice, contact)) throw new HttpError(404, 'Not found.');
    return invoice;
  };

  /** Every cheque and transfer on the client's invoices, soonest first. */
  router.get('/client/payments', requireClientSession, (req: SessionRequest, res: Response) => {
    const invoices = clientInvoices(store, companyId, self(req));
    res.json(invoices
      .flatMap((i) => store.clientPayments.listForInvoice(i.id).map((r) => clientRecordDto(store, r, i)))
      .sort((a, b) => (a.dueDate ?? a.paidOn ?? '').localeCompare(b.dueDate ?? b.paidOn ?? '')));
  });

  router.get('/client/invoices/:id/payments', requireClientSession, (req: SessionRequest, res: Response) => {
    const invoice = ownInvoice(self(req), req.params.id);
    res.json({ records: store.clientPayments.listForInvoice(invoice.id).map((r) => clientRecordDto(store, r, invoice)), room: invoiceRoom(store, invoice) });
  });

  /** "I've made a transfer": a pending record with its receipt; finance and the account manager are told. */
  router.post('/client/invoices/:id/transfers', requireClientSession, (req: SessionRequest, res: Response) => {
    const session = req.portal!;
    const contact = self(req);
    const invoice = ownInvoice(contact, req.params.id);
    const body = asRecord(req.body, 'body');
    if (typeof body.contentBase64 !== 'string' || !body.contentBase64) throw new HttpError(400, 'Attach the transfer receipt.');
    const file = readUpload(body);
    const record = guardRecord(() => store.transaction(() => {
      const created = store.clientPayments.create({
        companyId, invoiceId: invoice.id, method: 'transfer', amount: body.amount,
        reference: body.reference, paidOn: body.paidOn, by: { portalUserId: session.portalUserId },
      });
      store.clientPayments.addFile(created.id, file, { portalUserId: session.portalUserId });
      return created;
    }));
    const finance = store.listUserIdsWithPermission(companyId, 'invoices:read', ['Admin', 'Manager', 'Accountant']);
    const userIds = [...new Set([...finance, ...(contact.ownerUserId ? [contact.ownerUserId] : [])])];
    store.notify({
      companyId, userIds, type: 'invoice_payment',
      title: `${contact.name} says they paid invoice ${invoice.invoiceNumber} by transfer`,
      body: `${record.amount.toFixed(3)} ${record.currency ?? ''} on ${record.paidOn}. Check the receipt and confirm it.`,
      link: '/finance?tab=cheques', entityType: 'invoice', entityId: invoice.id,
    });
    res.status(201).json(clientRecordDto(store, record, invoice));
  });

  router.get('/client/payment-files/:fileId', requireClientSession, (req: SessionRequest, res: Response) => {
    const contact = self(req);
    const file = store.clientPayments.file(req.params.fileId);
    const record = file ? store.clientPayments.get(file.recordId) : undefined;
    const invoice = record ? store.getInvoiceById(record.invoiceId) : undefined;
    if (!file || !record || !invoice || invoice.companyId !== companyId || invoice.status === 'Draft' || !isClientInvoice(invoice, contact)) throw new HttpError(404, 'Not found.');
    res.set(downloadHeaders(file)).send(store.clientPayments.fileContent(file.id));
  });
}
