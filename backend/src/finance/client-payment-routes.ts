import type { Express, RequestHandler, Response } from 'express';
import type { DataStore } from '../data/store';
import { HttpError } from '../http';
import type { AuthedRequest } from '../routes/shared';
import { companyManagementRoles, handler } from '../routes/shared';
import type { UserRole } from '../types';
import { asRecord } from '../validation';
import { downloadHeaders, readUpload } from '../portal/files';
import { PaymentRecordError, type PaymentRecord, type RecordStatus } from './client-payments';
import { sendStage, type ClientPaymentSenders } from './client-payment-messages';

/**
 * Staff side of client payments: cheques recorded on an invoice and moved
 * along, client transfers confirmed or rejected, the finance list and the
 * reminder setting. Same gate as recording a payment (invoices.pay).
 */

export const guardRecord = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (error) {
    if (error instanceof PaymentRecordError) throw new HttpError(error.status, error.message);
    throw error;
  }
};

/** Staff view of a record: everything, with its files and the messages sent. */
export function staffRecordDto(store: DataStore, record: PaymentRecord) {
  const invoice = store.getInvoiceById(record.invoiceId);
  const contact = invoice?.contactId ? store.getContactById(invoice.contactId) : undefined;
  const client = invoice?.clientId ? store.getClientById(invoice.clientId) : undefined;
  return {
    ...record,
    invoiceNumber: invoice?.invoiceNumber ?? null,
    clientName: contact?.name ?? client?.name ?? null,
    createdByName: record.createdByUserId
      ? store.getUserById(record.createdByUserId)?.name ?? null
      : record.createdByPortalUserId ? store.portal.getUser(record.createdByPortalUserId)?.name ?? null : null,
    fromPortal: Boolean(record.createdByPortalUserId),
    files: store.clientPayments.files(record.id).map((f) => ({ id: f.id, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes, createdAt: f.createdAt })),
    messages: store.clientPayments.messages(record.id),
  };
}

/** After a status change: the client is told, and a bounced cheque becomes a follow-up. */
export async function afterStatusChange(store: DataStore, senders: ClientPaymentSenders, record: PaymentRecord, actor?: { userId: string }): Promise<void> {
  const invoice = store.getInvoiceById(record.invoiceId);
  if (record.status === 'bounced' && invoice) {
    const contact = invoice.contactId ? store.getContactById(invoice.contactId) : undefined;
    const ownerUserId = contact?.ownerUserId ?? actor?.userId;
    store.createFollowup({
      companyId: record.companyId,
      entityType: contact ? 'contact' : 'invoice',
      entityId: contact?.id ?? invoice.id,
      title: `Cheque ${record.chequeNumber} bounced (invoice ${invoice.invoiceNumber})`,
      channel: 'Call', priority: 'high',
      ownerUserId, ownerName: ownerUserId ? store.getUserById(ownerUserId)?.name : undefined,
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      notes: record.reason ?? undefined,
      sourceTrigger: 'cheque_bounced', sourceType: 'client_payment', sourceId: record.id,
    });
  }
  if (record.status === 'bounced' || record.status === 'confirmed' || record.status === 'rejected') {
    await sendStage(store, senders, record, record.status);
  }
}

export function registerClientPaymentRoutes(
  app: Express,
  store: DataStore,
  deps: {
    authMiddleware: RequestHandler;
    requireCompanyRoles: (req: AuthedRequest, companyId: string, roles: UserRole[], key?: string) => void;
    withActor: <T>(req: AuthedRequest, fn: () => T) => T;
    senders: ClientPaymentSenders;
    logError: (message: string, error: unknown) => void;
  },
): void {
  const { authMiddleware, requireCompanyRoles, withActor, senders } = deps;
  const gate = (req: AuthedRequest, companyId: string) => requireCompanyRoles(req, companyId, companyManagementRoles, 'invoices.pay');

  const loadInvoice = (req: AuthedRequest) => {
    const invoice = store.getInvoiceById(req.params.id);
    if (!invoice) throw new HttpError(404, 'Invoice not found.');
    gate(req, invoice.companyId);
    return invoice;
  };
  const loadRecord = (req: AuthedRequest) => {
    const record = store.clientPayments.get(req.params.id);
    if (!record) throw new HttpError(404, 'Not found.');
    gate(req, record.companyId);
    return record;
  };

  app.get('/invoices/:id/client-payments', authMiddleware, handler((req, res: Response) => {
    const invoice = loadInvoice(req);
    res.json({
      records: store.clientPayments.listForInvoice(invoice.id).map((r) => staffRecordDto(store, r)),
      room: store.clientPayments.room(invoice),
    });
  }));

  app.post('/invoices/:id/client-payments', authMiddleware, handler((req, res: Response) => {
    const invoice = loadInvoice(req);
    const body = asRecord(req.body, 'body');
    const method = body.method === 'transfer' ? 'transfer' : 'cheque';
    const file = typeof body.contentBase64 === 'string' && body.contentBase64 ? readUpload(body) : null;
    const record = guardRecord(() => withActor(req, () => store.transaction(() => {
      const created = store.clientPayments.create({
        companyId: invoice.companyId, invoiceId: invoice.id, method, amount: body.amount,
        chequeNumber: body.chequeNumber, bankName: body.bankName, dueDate: body.dueDate,
        reference: body.reference, paidOn: body.paidOn, note: body.note, by: { userId: req.user!.id },
      });
      if (file) store.clientPayments.addFile(created.id, file, { userId: req.user!.id });
      store.createActivityEvent({
        companyId: invoice.companyId, entityType: 'invoice', entityId: invoice.id, action: 'cheque_recorded',
        summary: method === 'cheque'
          ? `Cheque ${created.chequeNumber} for ${created.amount} dated ${created.dueDate} recorded on invoice ${invoice.invoiceNumber}.`
          : `Transfer of ${created.amount} recorded on invoice ${invoice.invoiceNumber}, waiting to be confirmed.`,
        metadata: { recordId: created.id },
      });
      return created;
    })));
    res.status(201).json(staffRecordDto(store, record));
  }));

  app.patch('/client-payments/:id', authMiddleware, handler((req, res: Response) => {
    const record = loadRecord(req);
    const body = asRecord(req.body, 'body');
    const updated = guardRecord(() => store.clientPayments.updateCheque(record.id, body));
    res.json(staffRecordDto(store, updated));
  }));

  app.post('/client-payments/:id/status', authMiddleware, handler(async (req, res: Response) => {
    const record = loadRecord(req);
    const body = asRecord(req.body, 'body');
    const status = body.status as RecordStatus;
    const updated = guardRecord(() => withActor(req, () => store.clientPayments.setStatus(record.id, status, { reason: body.reason, on: body.on })));
    // Messages go out after the answer; a slow WhatsApp never holds the page.
    void afterStatusChange(store, senders, updated, { userId: req.user!.id })
      .catch((error) => deps.logError('[client-payments] status follow-up failed', error));
    res.json(staffRecordDto(store, updated));
  }));

  app.delete('/client-payments/:id', authMiddleware, handler((req, res: Response) => {
    const record = loadRecord(req);
    guardRecord(() => store.clientPayments.remove(record.id));
    res.status(204).end();
  }));

  app.post('/client-payments/:id/files', authMiddleware, handler((req, res: Response) => {
    const record = loadRecord(req);
    const file = readUpload(asRecord(req.body, 'body'));
    const meta = guardRecord(() => store.clientPayments.addFile(record.id, file, { userId: req.user!.id }));
    res.status(201).json({ id: meta.id, fileName: meta.fileName, mimeType: meta.mimeType, sizeBytes: meta.sizeBytes, createdAt: meta.createdAt });
  }));

  app.get('/client-payment-files/:fileId', authMiddleware, handler((req, res: Response) => {
    const file = store.clientPayments.file(req.params.fileId);
    if (!file) throw new HttpError(404, 'Not found.');
    gate(req, file.companyId);
    res.set(downloadHeaders(file)).send(store.clientPayments.fileContent(file.id));
  }));

  app.get('/companies/:companyId/client-payments', authMiddleware, handler((req, res: Response) => {
    const { companyId } = req.params;
    gate(req, companyId);
    const all = store.clientPayments.listForCompany(companyId);
    res.json({
      records: all.map((r) => staffRecordDto(store, r)),
      settings: store.clientPayments.settings(companyId),
    });
  }));

  app.put('/companies/:companyId/client-payment-settings', authMiddleware, handler((req, res: Response) => {
    const { companyId } = req.params;
    gate(req, companyId);
    res.json(guardRecord(() => store.clientPayments.setSettings(companyId, asRecord(req.body, 'body'))));
  }));
}
