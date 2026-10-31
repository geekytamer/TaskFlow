import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

/**
 * Peak Flexi balances. A client company applies from the portal: activation
 * with its commercial registration, or an increase with a 3-month bank
 * statement and solvency papers. Staff approve (any positive amount, maybe
 * less than asked) or reject. The balance is the finance client's credit
 * limit and "used" is what the client owes today (clientCreditExposure), so
 * Flexi never keeps a second ledger.
 */

export type FlexiKind = 'activation' | 'increase';
export type FlexiStatus = 'new' | 'approved' | 'rejected' | 'withdrawn';

export interface FlexiApplication {
  id: string;
  companyId: string;
  contactId: string;
  clientId: string | null;
  kind: FlexiKind;
  status: FlexiStatus;
  crNumber: string | null;
  requestedAmount: number | null;
  approvedAmount: number | null;
  upfrontPct: number | null;
  maxMonths: number | null;
  note: string | null;
  reviewNote: string | null;
  createdBy: string;
  reviewedBy: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface FlexiBalance {
  enabled: boolean;
  balance: number;
  used: number;
  available: number;
  upfrontPct: number;
  maxMonths: number;
  clientId: string | null;
}

export const FLEXI_STANDARD = 850;
export const FLEXI_DEFAULT_UPFRONT = 40;
export const FLEXI_DEFAULT_MONTHS = 6;
export const FLEXI_INCREASE_MONTHS = 12;

export class FlexiError extends Error {
  constructor(readonly status: 400 | 404 | 409, message: string) {
    super(message);
  }
}

export const FLEXI_SCHEMA = `
  CREATE TABLE IF NOT EXISTS flexi_applications (
    id              TEXT PRIMARY KEY,
    companyId       TEXT NOT NULL,
    contactId       TEXT NOT NULL,
    clientId        TEXT,
    kind            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'new',
    crNumber        TEXT,
    requestedAmount REAL,
    approvedAmount  REAL,
    upfrontPct      REAL,
    maxMonths       INTEGER,
    note            TEXT,
    reviewNote      TEXT,
    createdBy       TEXT NOT NULL,
    reviewedBy      TEXT,
    createdAt       TEXT NOT NULL,
    reviewedAt      TEXT,
    CHECK (kind IN ('activation', 'increase')),
    CHECK (status IN ('new', 'approved', 'rejected', 'withdrawn'))
  );
  CREATE INDEX IF NOT EXISTS idx_flexi_applications_company ON flexi_applications (companyId, status);
  CREATE INDEX IF NOT EXISTS idx_flexi_applications_contact ON flexi_applications (contactId, status);
`;

export interface FlexiDeps {
  /** Ensures a finance client row exists for the contact and links it; returns its id. */
  ensureClientFor(contactId: string): string;
  exposure(clientId: string): number;
  attach(fileIds: string[], parent: { type: 'flexi_application'; id: string }, owner: { companyId: string; contactId: string; uploader: { kind: 'portal'; portalUserId: string } }): void;
  recordActivity(input: { companyId: string; contactId: string; actorUserId: string; action: string; summary: string }): void;
  /** Completes the review follow-up raised when the application arrived. */
  closeReview(app: FlexiApplication, userId?: string): void;
}

/** The follow-up trigger the portal raises for a new application; closed when it is decided or withdrawn. */
export const FLEXI_REVIEW_TRIGGER = 'portal_flexi';

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const MAX_NOTE = 1000;
const MAX_CR = 40;

export class FlexiStore {
  constructor(private readonly db: Database.Database, private readonly deps: FlexiDeps) {}

  private decode(row: any): FlexiApplication {
    return { ...row };
  }

  get(id: string): FlexiApplication | undefined {
    const row = this.db.prepare('SELECT * FROM flexi_applications WHERE id = ?').get(id);
    return row ? this.decode(row) : undefined;
  }

  list(companyId: string, filter: { status?: FlexiStatus; contactId?: string } = {}): FlexiApplication[] {
    const where = ['companyId = @companyId'];
    if (filter.status) where.push('status = @status');
    if (filter.contactId) where.push('contactId = @contactId');
    return (this.db.prepare(`SELECT * FROM flexi_applications WHERE ${where.join(' AND ')} ORDER BY createdAt DESC, rowid DESC`)
      .all({ companyId, ...filter }) as any[]).map((r) => this.decode(r));
  }

  openFor(contactId: string): FlexiApplication | undefined {
    const row = this.db.prepare("SELECT * FROM flexi_applications WHERE contactId = ? AND status = 'new' ORDER BY createdAt DESC LIMIT 1").get(contactId);
    return row ? this.decode(row) : undefined;
  }

  latestFor(contactId: string): FlexiApplication | undefined {
    const row = this.db.prepare('SELECT * FROM flexi_applications WHERE contactId = ? ORDER BY createdAt DESC, rowid DESC LIMIT 1').get(contactId);
    return row ? this.decode(row) : undefined;
  }

  /** The finance client row behind a contact, if one exists. */
  private clientRow(contactId: string): any | undefined {
    const contact = this.db.prepare('SELECT id, clientId FROM contacts WHERE id = ?').get(contactId) as { id: string; clientId: string | null } | undefined;
    if (!contact) return undefined;
    return this.db.prepare('SELECT * FROM clients WHERE id = ?').get(contact.clientId ?? contact.id);
  }

  balanceOf(contactId: string): FlexiBalance {
    const client = this.clientRow(contactId);
    const enabled = !!client?.flexiEnabled;
    const upfrontPct = client?.flexiUpfrontPct ?? FLEXI_DEFAULT_UPFRONT;
    const maxMonths = client?.flexiMaxMonths ?? FLEXI_DEFAULT_MONTHS;
    if (!enabled) return { enabled: false, balance: 0, used: 0, available: 0, upfrontPct, maxMonths, clientId: client?.id ?? null };
    const balance = Number(client.creditLimit ?? 0);
    const used = this.deps.exposure(client.id);
    return { enabled, balance, used, available: r3(Math.max(0, balance - used)), upfrontPct, maxMonths, clientId: client.id };
  }

  submit(input: { companyId: string; contactId: string; kind: FlexiKind; crNumber?: unknown; requestedAmount?: unknown; note?: unknown; fileIds: string[]; createdBy: string }): FlexiApplication {
    return this.db.transaction(() => {
      if (input.kind !== 'activation' && input.kind !== 'increase') throw new FlexiError(400, 'Choose activation or increase.');
      if (this.openFor(input.contactId)) throw new FlexiError(409, 'You already have a request under review.');
      const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null;
      if (note && note.length > MAX_NOTE) throw new FlexiError(400, 'The note is too long.');
      const fileIds = Array.isArray(input.fileIds) ? input.fileIds : [];
      const balance = this.balanceOf(input.contactId);
      let crNumber: string | null = null;
      let requestedAmount: number | null = null;
      if (input.kind === 'activation') {
        if (balance.enabled) throw new FlexiError(409, 'Your Peak Flexi balance is already active.');
        crNumber = typeof input.crNumber === 'string' ? input.crNumber.trim() : '';
        if (!crNumber || crNumber.length > MAX_CR) throw new FlexiError(400, 'Add your commercial registration number.');
        if (fileIds.length < 1) throw new FlexiError(400, 'Attach a copy of your commercial registration.');
      } else {
        if (!balance.enabled) throw new FlexiError(400, 'Activate your Peak Flexi balance first.');
        const amount = Number(input.requestedAmount);
        if (typeof input.requestedAmount !== 'number' || !Number.isFinite(amount) || amount <= balance.balance) {
          throw new FlexiError(400, 'Ask for an amount above your current balance.');
        }
        requestedAmount = r3(amount);
        if (fileIds.length < 2) throw new FlexiError(400, 'Attach your bank statement and your solvency papers.');
      }
      const record: FlexiApplication = {
        id: uuid(), companyId: input.companyId, contactId: input.contactId, clientId: balance.clientId, kind: input.kind, status: 'new',
        crNumber, requestedAmount, approvedAmount: null, upfrontPct: null, maxMonths: null, note, reviewNote: null,
        createdBy: input.createdBy, reviewedBy: null, createdAt: new Date().toISOString(), reviewedAt: null,
      };
      this.db.prepare(
        `INSERT INTO flexi_applications (id, companyId, contactId, clientId, kind, status, crNumber, requestedAmount, approvedAmount, upfrontPct, maxMonths, note, reviewNote, createdBy, reviewedBy, createdAt, reviewedAt)
         VALUES (@id, @companyId, @contactId, @clientId, @kind, @status, @crNumber, @requestedAmount, @approvedAmount, @upfrontPct, @maxMonths, @note, @reviewNote, @createdBy, @reviewedBy, @createdAt, @reviewedAt)`,
      ).run(record);
      this.deps.attach(fileIds, { type: 'flexi_application', id: record.id }, { companyId: input.companyId, contactId: input.contactId, uploader: { kind: 'portal', portalUserId: input.createdBy } });
      return record;
    })();
  }

  private openOrThrow(id: string): FlexiApplication {
    const app = this.get(id);
    if (!app) throw new FlexiError(404, 'Application not found.');
    if (app.status !== 'new') throw new FlexiError(409, 'This application has already been decided.');
    return app;
  }

  withdraw(id: string, contactId: string): FlexiApplication {
    const app = this.get(id);
    if (!app || app.contactId !== contactId) throw new FlexiError(404, 'Application not found.');
    this.openOrThrow(id);
    return this.db.transaction(() => {
      this.db.prepare("UPDATE flexi_applications SET status = 'withdrawn', reviewedAt = ? WHERE id = ?").run(new Date().toISOString(), id);
      this.deps.closeReview(app);
      return this.get(id)!;
    })();
  }

  approve(id: string, input: { amount: unknown; upfrontPct?: unknown; maxMonths?: unknown; reviewNote?: unknown; reviewerId: string }): FlexiApplication {
    return this.db.transaction(() => {
      const app = this.openOrThrow(id);
      const amount = typeof input.amount === 'number' ? input.amount : Number.NaN;
      if (!Number.isFinite(amount) || amount <= 0) throw new FlexiError(400, 'Enter a balance above zero.');
      const current = this.balanceOf(app.contactId);
      // Omitted terms keep the client's current ones; anything sent must be a real number, so a blank field never becomes 0%.
      const given = (v: unknown) => v !== undefined && v !== null;
      if ((given(input.upfrontPct) && typeof input.upfrontPct !== 'number') || (given(input.maxMonths) && typeof input.maxMonths !== 'number')) {
        throw new FlexiError(400, 'Terms must be numbers.');
      }
      const upfrontPct = given(input.upfrontPct) ? input.upfrontPct as number : current.enabled ? current.upfrontPct : FLEXI_DEFAULT_UPFRONT;
      if (!Number.isFinite(upfrontPct) || upfrontPct < 0 || upfrontPct > 100) throw new FlexiError(400, 'The down payment must be between 0% and 100%.');
      const defaultMonths = app.kind === 'increase' ? FLEXI_INCREASE_MONTHS : FLEXI_DEFAULT_MONTHS;
      const maxMonths = given(input.maxMonths) ? input.maxMonths as number : defaultMonths;
      if (!Number.isInteger(maxMonths) || maxMonths < 1 || maxMonths > 36) throw new FlexiError(400, 'Months must be a whole number from 1 to 36.');
      const reviewNote = typeof input.reviewNote === 'string' && input.reviewNote.trim() ? input.reviewNote.trim().slice(0, MAX_NOTE) : null;

      const clientId = this.deps.ensureClientFor(app.contactId);
      this.db.prepare('UPDATE clients SET creditLimit = ?, flexiEnabled = 1, flexiUpfrontPct = ?, flexiMaxMonths = ? WHERE id = ?')
        .run(r3(amount), upfrontPct, maxMonths, clientId);
      this.db.prepare(
        "UPDATE flexi_applications SET status = 'approved', clientId = ?, approvedAmount = ?, upfrontPct = ?, maxMonths = ?, reviewNote = ?, reviewedBy = ?, reviewedAt = ? WHERE id = ?",
      ).run(clientId, r3(amount), upfrontPct, maxMonths, reviewNote, input.reviewerId, new Date().toISOString(), id);
      this.deps.recordActivity({
        companyId: app.companyId, contactId: app.contactId, actorUserId: input.reviewerId, action: 'flexi_approved',
        summary: `Peak Flexi ${app.kind} approved: balance ${r3(amount)}, ${upfrontPct}% down, up to ${maxMonths} months.`,
      });
      this.deps.closeReview(app, input.reviewerId);
      return this.get(id)!;
    })();
  }

  reject(id: string, input: { reviewNote: unknown; reviewerId: string }): FlexiApplication {
    return this.db.transaction(() => {
      const app = this.openOrThrow(id);
      const reviewNote = typeof input.reviewNote === 'string' ? input.reviewNote.trim() : '';
      if (!reviewNote || reviewNote.length > 500) throw new FlexiError(400, 'Give a reason (up to 500 characters).');
      this.db.prepare("UPDATE flexi_applications SET status = 'rejected', reviewNote = ?, reviewedBy = ?, reviewedAt = ? WHERE id = ?")
        .run(reviewNote, input.reviewerId, new Date().toISOString(), id);
      this.deps.recordActivity({
        companyId: app.companyId, contactId: app.contactId, actorUserId: input.reviewerId, action: 'flexi_rejected',
        summary: `Peak Flexi ${app.kind} rejected: ${reviewNote}`,
      });
      this.deps.closeReview(app, input.reviewerId);
      return this.get(id)!;
    })();
  }
}
