import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { Invoice, Payment } from '../types';
import type { PortalFileType } from '../portal/files';

/**
 * Money a client promised or says they sent, before it is in the books:
 * post-dated cheques and bank transfers (spec 2026-11-09). A record turns into
 * a real invoice payment (the normal createPayment) only when the money is
 * confirmed: a cheque when it clears, a transfer when staff confirm it.
 */

export type PaymentMethod = 'cheque' | 'transfer';
export type RecordStatus = 'received' | 'deposited' | 'cleared' | 'bounced' | 'returned' | 'pending' | 'confirmed' | 'rejected';
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['cheque', 'transfer'];
export const RECORD_STATUSES: readonly RecordStatus[] = ['received', 'deposited', 'cleared', 'bounced', 'returned', 'pending', 'confirmed', 'rejected'];
/** Money that is still on its way: counts against the invoice's outstanding amount. */
export const OPEN_STATUSES: readonly RecordStatus[] = ['received', 'deposited', 'pending'];

/** Where each status may go by hand. Cleared and confirmed only leave when finance reverses the payment. */
const NEXT: Record<RecordStatus, readonly RecordStatus[]> = {
  received: ['deposited', 'cleared', 'bounced', 'returned'],
  deposited: ['received', 'cleared', 'bounced'],
  bounced: ['deposited'],
  returned: [],
  cleared: [],
  pending: ['confirmed', 'rejected'],
  rejected: [],
  confirmed: [],
};
const CHEQUE_STATUSES: readonly RecordStatus[] = ['received', 'deposited', 'cleared', 'bounced', 'returned'];

export interface PaymentRecord {
  id: string;
  companyId: string;
  invoiceId: string;
  method: PaymentMethod;
  status: RecordStatus;
  amount: number;
  currency: string | null;
  chequeNumber: string | null;
  bankName: string | null;
  /** A cheque's date: the day it may be deposited. */
  dueDate: string | null;
  /** A transfer's bank reference. */
  reference: string | null;
  /** When the transfer was made, or when the cheque cleared. */
  paidOn: string | null;
  note: string | null;
  /** Why a cheque bounced or a transfer was rejected. */
  reason: string | null;
  paymentId: string | null;
  createdByUserId: string | null;
  createdByPortalUserId: string | null;
  statusAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentFileMeta {
  id: string; recordId: string; companyId: string; fileName: string; mimeType: PortalFileType; sizeBytes: number;
  uploaderKind: 'staff' | 'portal'; userId: string | null; portalUserId: string | null; createdAt: string;
}

export type MessageStage = 'before' | 'due' | 'bounced' | 'confirmed' | 'rejected';
export type MessageChannel = 'whatsapp' | 'email';
export interface PaymentMessage { recordId: string; stage: MessageStage; channel: MessageChannel; status: 'sending' | 'sent' | 'skipped' | 'failed'; error: string | null; sentAt: string }

export interface PaymentSettings { remindersEnabled: boolean; daysBefore: number; onTheDay: boolean }
export const DEFAULT_SETTINGS: PaymentSettings = { remindersEnabled: true, daysBefore: 3, onTheDay: true };

export class PaymentRecordError extends Error {
  constructor(readonly status: 400 | 404 | 409, message: string) { super(message); }
}

export const CLIENT_PAYMENTS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS client_payment_records (
    id TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    invoiceId TEXT NOT NULL,
    method TEXT NOT NULL,
    status TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT,
    chequeNumber TEXT,
    bankName TEXT,
    dueDate TEXT,
    reference TEXT,
    paidOn TEXT,
    note TEXT,
    reason TEXT,
    paymentId TEXT,
    createdByUserId TEXT,
    createdByPortalUserId TEXT,
    statusAt TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_client_payment_records_invoice ON client_payment_records (invoiceId);
  CREATE INDEX IF NOT EXISTS idx_client_payment_records_company ON client_payment_records (companyId, status, dueDate);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_client_payment_records_payment ON client_payment_records (paymentId) WHERE paymentId IS NOT NULL;
  CREATE TABLE IF NOT EXISTS client_payment_files (
    id TEXT PRIMARY KEY,
    recordId TEXT NOT NULL,
    companyId TEXT NOT NULL,
    fileName TEXT NOT NULL,
    mimeType TEXT NOT NULL,
    sizeBytes INTEGER NOT NULL,
    content BLOB NOT NULL,
    uploaderKind TEXT NOT NULL,
    userId TEXT,
    portalUserId TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_client_payment_files_record ON client_payment_files (recordId);
  CREATE TABLE IF NOT EXISTS client_payment_messages (
    recordId TEXT NOT NULL,
    stage TEXT NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    sentAt TEXT NOT NULL,
    PRIMARY KEY (recordId, stage, channel)
  );
  CREATE TABLE IF NOT EXISTS client_payment_settings (
    companyId TEXT PRIMARY KEY,
    remindersEnabled INTEGER NOT NULL,
    daysBefore INTEGER NOT NULL,
    onTheDay INTEGER NOT NULL
  );
`;

export interface ClientPaymentDeps {
  invoice(id: string): Invoice | undefined;
  /** The normal finance path: journals, invoice status, commissions. */
  recordPayment(input: { invoiceId: string; amount: number; method: string; note?: string; paidAt: Date }): Payment;
}

const r3 = (n: number) => Number(n.toFixed(3));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Today in the company's local time (Oman), as YYYY-MM-DD. */
export const localDay = (now: Date = new Date(), timeZone = 'Asia/Muscat') =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
/** Whole days from `a` to `b` (both YYYY-MM-DD). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export class ClientPaymentsStore {
  constructor(private readonly db: Database.Database, private readonly deps: ClientPaymentDeps) {}

  get(id: string): PaymentRecord | undefined {
    return this.db.prepare('SELECT * FROM client_payment_records WHERE id = ?').get(id) as PaymentRecord | undefined;
  }

  listForInvoice(invoiceId: string): PaymentRecord[] {
    return this.db.prepare('SELECT * FROM client_payment_records WHERE invoiceId = ? ORDER BY COALESCE(dueDate, paidOn, createdAt), createdAt').all(invoiceId) as PaymentRecord[];
  }

  listForCompany(companyId: string, filter: { method?: PaymentMethod; status?: RecordStatus[] } = {}): PaymentRecord[] {
    return (this.db.prepare('SELECT * FROM client_payment_records WHERE companyId = ? ORDER BY COALESCE(dueDate, paidOn, createdAt), createdAt').all(companyId) as PaymentRecord[])
      .filter((r) => (!filter.method || r.method === filter.method) && (!filter.status || filter.status.includes(r.status)));
  }

  /** What open records on this invoice already promise. */
  openTotal(invoiceId: string, exceptId?: string): number {
    return r3(this.listForInvoice(invoiceId)
      .filter((r) => r.id !== exceptId && OPEN_STATUSES.includes(r.status))
      .reduce((n, r) => n + r.amount, 0));
  }

  /** What may still be promised on this invoice: outstanding less open records. */
  room(invoice: Invoice, exceptId?: string): number {
    return r3(Math.max(0, (invoice.outstandingAmount ?? invoice.total) - this.openTotal(invoice.id, exceptId)));
  }

  create(input: {
    companyId: string; invoiceId: string; method: PaymentMethod; amount: unknown;
    chequeNumber?: unknown; bankName?: unknown; dueDate?: unknown; reference?: unknown; paidOn?: unknown; note?: unknown;
    by: { userId: string } | { portalUserId: string };
  }, now = new Date()): PaymentRecord {
    const invoice = this.deps.invoice(input.invoiceId);
    if (!invoice || invoice.companyId !== input.companyId) throw new PaymentRecordError(404, 'Invoice not found.');
    if (invoice.status === 'Draft') throw new PaymentRecordError(409, 'A draft invoice cannot take payments.');
    if (!PAYMENT_METHODS.includes(input.method)) throw new PaymentRecordError(400, 'method must be cheque or transfer.');
    const amount = typeof input.amount === 'number' ? input.amount : Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new PaymentRecordError(400, 'The amount must be greater than zero.');
    const cheque = input.method === 'cheque';
    const chequeNumber = text(input.chequeNumber, 40);
    if (cheque && !chequeNumber) throw new PaymentRecordError(400, 'Enter the cheque number.');
    if (cheque && !isDate(input.dueDate)) throw new PaymentRecordError(400, 'Enter the cheque date (YYYY-MM-DD).');
    const paidOn = input.paidOn === undefined || input.paidOn === null || input.paidOn === '' ? (cheque ? null : localDay(now)) : input.paidOn;
    if (paidOn !== null && !isDate(paidOn)) throw new PaymentRecordError(400, 'The transfer date must be a date (YYYY-MM-DD).');
    if (!cheque && paidOn && daysBetween(localDay(now), paidOn) > 0) throw new PaymentRecordError(400, 'The transfer date cannot be in the future.');
    const room = this.room(invoice);
    if (r3(amount) > room + 0.0005) {
      throw new PaymentRecordError(409, room <= 0.0005
        ? 'Nothing is left to pay on this invoice once the cheques and transfers already recorded are counted.'
        : `The amount is more than what is left to pay (${room.toFixed(3)}), counting the cheques and transfers already recorded.`);
    }

    const at = now.toISOString();
    const record: PaymentRecord = {
      id: uuid(), companyId: input.companyId, invoiceId: invoice.id, method: input.method,
      status: cheque ? 'received' : 'pending', amount: r3(amount), currency: invoice.currency ?? null,
      chequeNumber: cheque ? chequeNumber : null, bankName: cheque ? text(input.bankName, 80) : null,
      dueDate: cheque ? (input.dueDate as string) : null, reference: cheque ? null : text(input.reference, 80),
      paidOn: cheque ? null : paidOn, note: text(input.note, 1000), reason: null, paymentId: null,
      createdByUserId: 'userId' in input.by ? input.by.userId : null,
      createdByPortalUserId: 'portalUserId' in input.by ? input.by.portalUserId : null,
      statusAt: at, createdAt: at, updatedAt: at,
    };
    this.db.prepare(`INSERT INTO client_payment_records (id, companyId, invoiceId, method, status, amount, currency, chequeNumber, bankName, dueDate, reference, paidOn, note, reason, paymentId, createdByUserId, createdByPortalUserId, statusAt, createdAt, updatedAt)
      VALUES (@id, @companyId, @invoiceId, @method, @status, @amount, @currency, @chequeNumber, @bankName, @dueDate, @reference, @paidOn, @note, @reason, @paymentId, @createdByUserId, @createdByPortalUserId, @statusAt, @createdAt, @updatedAt)`).run(record);
    return record;
  }

  /** Corrects a cheque that is still with us (number, bank, amount, date). */
  updateCheque(id: string, input: { chequeNumber?: unknown; bankName?: unknown; amount?: unknown; dueDate?: unknown; note?: unknown }, now = new Date()): PaymentRecord {
    const record = this.get(id);
    if (!record) throw new PaymentRecordError(404, 'Not found.');
    if (record.method !== 'cheque' || record.status !== 'received') throw new PaymentRecordError(409, 'Only a cheque that has not been deposited can be edited.');
    const invoice = this.deps.invoice(record.invoiceId)!;
    const next = { ...record };
    if (input.chequeNumber !== undefined) {
      const n = text(input.chequeNumber, 40);
      if (!n) throw new PaymentRecordError(400, 'Enter the cheque number.');
      next.chequeNumber = n;
    }
    if (input.bankName !== undefined) next.bankName = text(input.bankName, 80);
    if (input.note !== undefined) next.note = text(input.note, 1000);
    if (input.dueDate !== undefined) {
      if (!isDate(input.dueDate)) throw new PaymentRecordError(400, 'Enter the cheque date (YYYY-MM-DD).');
      next.dueDate = input.dueDate;
    }
    if (input.amount !== undefined) {
      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new PaymentRecordError(400, 'The amount must be greater than zero.');
      const room = this.room(invoice, record.id);
      if (r3(amount) > room + 0.0005) throw new PaymentRecordError(409, `The amount is more than what is left to pay (${room.toFixed(3)}).`);
      next.amount = r3(amount);
    }
    next.updatedAt = now.toISOString();
    this.db.prepare('UPDATE client_payment_records SET chequeNumber = @chequeNumber, bankName = @bankName, note = @note, dueDate = @dueDate, amount = @amount, updatedAt = @updatedAt WHERE id = @id').run(next);
    // A new date is a new deposit: the client hears about it again.
    if (next.dueDate !== record.dueDate) this.db.prepare("DELETE FROM client_payment_messages WHERE recordId = ? AND stage IN ('before', 'due')").run(id);
    return this.get(id)!;
  }

  /**
   * Moves a record along. Cleared and confirmed record the invoice payment in
   * the same transaction; bounced and rejected need a reason.
   */
  setStatus(id: string, status: RecordStatus, input: { reason?: unknown; on?: unknown } = {}, now = new Date()): PaymentRecord {
    const record = this.get(id);
    if (!record) throw new PaymentRecordError(404, 'Not found.');
    if (!RECORD_STATUSES.includes(status)) throw new PaymentRecordError(400, 'Unknown status.');
    const fits = record.method === 'cheque' ? CHEQUE_STATUSES.includes(status) : !CHEQUE_STATUSES.includes(status);
    if (!fits || !NEXT[record.status].includes(status)) {
      throw new PaymentRecordError(409, `A ${record.method === 'cheque' ? 'cheque' : 'transfer'} that is ${record.status} cannot become ${status}.`);
    }
    const reason = text(input.reason, 1000);
    if ((status === 'bounced' || status === 'rejected') && !reason) throw new PaymentRecordError(400, 'Say why.');
    const on = input.on === undefined || input.on === null || input.on === '' ? localDay(now) : input.on;
    if (!isDate(on)) throw new PaymentRecordError(400, 'The date must be YYYY-MM-DD.');
    const at = now.toISOString();

    return this.db.transaction(() => {
      let paymentId: string | null = null;
      let paidOn = record.paidOn;
      if (status === 'cleared' || status === 'confirmed') {
        const invoice = this.deps.invoice(record.invoiceId);
        if (!invoice) throw new PaymentRecordError(404, 'Invoice not found.');
        const outstanding = invoice.outstandingAmount ?? invoice.total;
        if (record.amount > outstanding + 0.0005) {
          throw new PaymentRecordError(409, `The invoice now has only ${outstanding.toFixed(3)} left to pay; correct the amount or the invoice first.`);
        }
        const cheque = record.method === 'cheque';
        const date = cheque ? on : record.paidOn ?? on;
        const payment = this.deps.recordPayment({
          invoiceId: record.invoiceId,
          amount: record.amount,
          method: cheque ? 'Cheque' : 'Bank transfer',
          note: cheque
            ? `Cheque ${record.chequeNumber}${record.bankName ? `, ${record.bankName}` : ''}`
            : `Transfer${record.reference ? ` ref ${record.reference}` : ''}`,
          paidAt: new Date(`${date}T12:00:00Z`),
        });
        paymentId = payment.id;
        paidOn = date;
      }
      this.db.prepare('UPDATE client_payment_records SET status = ?, reason = ?, paymentId = ?, paidOn = ?, statusAt = ?, updatedAt = ? WHERE id = ?')
        .run(status, status === 'bounced' || status === 'rejected' ? reason : record.reason, paymentId, paidOn, at, at, id);
      return this.get(id)!;
    })();
  }

  /** Finance reversed the payment a record made: the record goes back to waiting. */
  onPaymentReversed(paymentId: string, now = new Date()): void {
    const at = now.toISOString();
    this.db.prepare(`UPDATE client_payment_records SET status = CASE method WHEN 'cheque' THEN 'deposited' ELSE 'pending' END,
      paymentId = NULL, paidOn = CASE method WHEN 'cheque' THEN NULL ELSE paidOn END, statusAt = ?, updatedAt = ? WHERE paymentId = ?`).run(at, at, paymentId);
  }

  /** A record nobody has acted on yet may be removed (entered by mistake). */
  remove(id: string): void {
    const record = this.get(id);
    if (!record) throw new PaymentRecordError(404, 'Not found.');
    if (record.status !== 'received' && record.status !== 'pending') throw new PaymentRecordError(409, 'Only a cheque not yet deposited or a transfer not yet checked can be removed.');
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM client_payment_files WHERE recordId = ?').run(id);
      this.db.prepare('DELETE FROM client_payment_messages WHERE recordId = ?').run(id);
      this.db.prepare('DELETE FROM client_payment_records WHERE id = ?').run(id);
    })();
  }

  // Files: the cheque image or the transfer receipt.

  addFile(recordId: string, file: { content: Buffer; type: PortalFileType; fileName: string }, by: { userId: string } | { portalUserId: string }): PaymentFileMeta {
    const record = this.get(recordId);
    if (!record) throw new PaymentRecordError(404, 'Not found.');
    if (this.files(recordId).length >= 5) throw new PaymentRecordError(409, 'At most 5 files per cheque or transfer.');
    const id = uuid();
    this.db.prepare(`INSERT INTO client_payment_files (id, recordId, companyId, fileName, mimeType, sizeBytes, content, uploaderKind, userId, portalUserId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, recordId, record.companyId, file.fileName, file.type, file.content.length, file.content,
      'userId' in by ? 'staff' : 'portal', 'userId' in by ? by.userId : null, 'portalUserId' in by ? by.portalUserId : null, new Date().toISOString(),
    );
    return this.file(id)!;
  }

  files(recordId: string): PaymentFileMeta[] {
    return this.db.prepare('SELECT id, recordId, companyId, fileName, mimeType, sizeBytes, uploaderKind, userId, portalUserId, createdAt FROM client_payment_files WHERE recordId = ? ORDER BY createdAt, rowid').all(recordId) as PaymentFileMeta[];
  }

  file(id: string): PaymentFileMeta | undefined {
    return this.db.prepare('SELECT id, recordId, companyId, fileName, mimeType, sizeBytes, uploaderKind, userId, portalUserId, createdAt FROM client_payment_files WHERE id = ?').get(id) as PaymentFileMeta | undefined;
  }

  fileContent(id: string): Buffer | undefined {
    return (this.db.prepare('SELECT content FROM client_payment_files WHERE id = ?').get(id) as { content: Buffer } | undefined)?.content;
  }

  // Messages to the client: each stage once per channel.

  messages(recordId: string): PaymentMessage[] {
    return this.db.prepare('SELECT * FROM client_payment_messages WHERE recordId = ? ORDER BY sentAt').all(recordId) as PaymentMessage[];
  }

  /** Claims a message; false when it was sent, skipped, is being sent, or failed less than an hour ago. */
  claim(recordId: string, stage: MessageStage, channel: MessageChannel, now = new Date()): boolean {
    const row = this.db.prepare('SELECT status, sentAt FROM client_payment_messages WHERE recordId = ? AND stage = ? AND channel = ?').get(recordId, stage, channel) as { status: string; sentAt: string } | undefined;
    if (row && !(row.status === 'failed' && now.getTime() - Date.parse(row.sentAt) >= 60 * 60 * 1000)) return false;
    this.db.prepare(`INSERT INTO client_payment_messages (recordId, stage, channel, status, error, sentAt) VALUES (?, ?, ?, 'sending', NULL, ?)
      ON CONFLICT (recordId, stage, channel) DO UPDATE SET status = 'sending', error = NULL, sentAt = excluded.sentAt`).run(recordId, stage, channel, now.toISOString());
    return true;
  }

  settle(recordId: string, stage: MessageStage, channel: MessageChannel, status: 'sent' | 'skipped' | 'failed', error: string | null = null, now = new Date()): void {
    this.db.prepare('UPDATE client_payment_messages SET status = ?, error = ?, sentAt = ? WHERE recordId = ? AND stage = ? AND channel = ?')
      .run(status, error ? error.slice(0, 300) : null, now.toISOString(), recordId, stage, channel);
  }

  // Settings.

  settings(companyId: string): PaymentSettings {
    const row = this.db.prepare('SELECT * FROM client_payment_settings WHERE companyId = ?').get(companyId) as { remindersEnabled: number; daysBefore: number; onTheDay: number } | undefined;
    return row ? { remindersEnabled: row.remindersEnabled === 1, daysBefore: row.daysBefore, onTheDay: row.onTheDay === 1 } : { ...DEFAULT_SETTINGS };
  }

  setSettings(companyId: string, input: { remindersEnabled?: unknown; daysBefore?: unknown; onTheDay?: unknown }): PaymentSettings {
    const cur = this.settings(companyId);
    const days = input.daysBefore === undefined ? cur.daysBefore : Number(input.daysBefore);
    if (!Number.isInteger(days) || days < 1 || days > 14) throw new PaymentRecordError(400, 'Days before must be a whole number from 1 to 14.');
    const next: PaymentSettings = {
      remindersEnabled: typeof input.remindersEnabled === 'boolean' ? input.remindersEnabled : cur.remindersEnabled,
      daysBefore: days,
      onTheDay: typeof input.onTheDay === 'boolean' ? input.onTheDay : cur.onTheDay,
    };
    this.db.prepare(`INSERT INTO client_payment_settings (companyId, remindersEnabled, daysBefore, onTheDay) VALUES (?, ?, ?, ?)
      ON CONFLICT (companyId) DO UPDATE SET remindersEnabled = excluded.remindersEnabled, daysBefore = excluded.daysBefore, onTheDay = excluded.onTheDay`)
      .run(companyId, next.remindersEnabled ? 1 : 0, next.daysBefore, next.onTheDay ? 1 : 0);
    return next;
  }

  /** Companies with at least one cheque still to deposit. */
  companiesWithCheques(): string[] {
    return (this.db.prepare("SELECT DISTINCT companyId FROM client_payment_records WHERE method = 'cheque' AND status = 'received'").all() as Array<{ companyId: string }>).map((r) => r.companyId);
  }
}
