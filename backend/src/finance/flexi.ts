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
export type FlexiState = 'active' | 'frozen' | 'closed';
export type FlexiEventKind = 'applied' | 'approved' | 'rejected' | 'withdrawn' | 'adjusted' | 'frozen' | 'unfrozen' | 'closed' | 'terms_accepted';

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
  termsVersion: number | null;
  termsAcceptedAt: string | null;
}

export interface FlexiBalance {
  enabled: boolean;
  state: FlexiState | null;
  balance: number;
  used: number;
  available: number;
  upfrontPct: number;
  maxMonths: number;
  clientId: string | null;
}

export interface FlexiSettings {
  standardAmount: number;
  defaultUpfrontPct: number;
  allowedMonths: number[];
  activationMonths: number;
  increaseMonths: number;
  termsVersion: number;
  termsAr: string;
  termsEn: string;
  updatedAt: string | null;
}

export interface FlexiEvent {
  id: string;
  kind: FlexiEventKind;
  amountBefore: number | null;
  amountAfter: number | null;
  upfrontPct: number | null;
  maxMonths: number | null;
  note: string | null;
  actorUserId: string | null;
  actorPortalUserId: string | null;
  actorName: string | null;
  applicationId: string | null;
  createdAt: string;
}

/** Shipped default; PEAK's lawyer must check it before it is relied on. */
export const DEFAULT_TERMS_EN = [
  'Peak Flexi terms',
  '1. PEAK reviews every application. Approval, the balance, the down payment and the instalment period are decided by PEAK for each client.',
  '2. The balance is spent only on PEAK services. Each order states its down payment and its instalments before work starts.',
  '3. Instalments carry no extra fees: you pay the amount of the order, split.',
  '4. PEAK may pause or close an account, for example when an instalment is late, and may ask for updated papers at any time.',
  '5. The papers you send are true and belong to your company, and you are authorised to apply on its behalf.',
].join('\n');
export const DEFAULT_TERMS_AR = [
  'شروط بيك فلكسي',
  '1. فريق PEAK يراجع كل طلب، ويقرر الموافقة والرصيد والدفعة المقدمة ومدة الأقساط لكل عميل.',
  '2. الرصيد يُصرف على خدمات PEAK بس، وكل طلب يوضح دفعته المقدمة وأقساطه قبل بداية الشغل.',
  '3. الأقساط بدون أي رسوم إضافية: تدفع مبلغ الطلب نفسه، مقسوم.',
  '4. لـ PEAK حق إيقاف الحساب مؤقتًا أو إغلاقه، مثلًا إذا تأخر قسط، وتقدر تطلب أوراق محدّثة في أي وقت.',
  '5. الأوراق اللي ترسلها صحيحة وتخص شركتك، وأنت مفوّض تقدّم باسمها.',
].join('\n');

export const FLEXI_STANDARD = 850;
export const FLEXI_DEFAULT_UPFRONT = 40;
export const FLEXI_DEFAULT_MONTHS = 6;
export const FLEXI_INCREASE_MONTHS = 12;
export const FLEXI_ALLOWED_MONTHS = [3, 6, 12];

export class FlexiError extends Error {
  /** `code` is stable for clients to act on (e.g. TERMS_CHANGED: reload the terms). */
  constructor(readonly status: 400 | 404 | 409, message: string, readonly code?: string) {
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

export const FLEXI_SECTION_SCHEMA = `
  CREATE TABLE IF NOT EXISTS flexi_settings (
    companyId         TEXT PRIMARY KEY,
    standardAmount    REAL NOT NULL,
    defaultUpfrontPct REAL NOT NULL,
    allowedMonths     TEXT NOT NULL,
    activationMonths  INTEGER NOT NULL,
    increaseMonths    INTEGER NOT NULL,
    termsVersion      INTEGER NOT NULL,
    termsAr           TEXT NOT NULL,
    termsEn           TEXT NOT NULL,
    updatedAt         TEXT NOT NULL,
    updatedBy         TEXT
  );
  CREATE TABLE IF NOT EXISTS flexi_events (
    id                TEXT PRIMARY KEY,
    companyId         TEXT NOT NULL,
    contactId         TEXT NOT NULL,
    kind              TEXT NOT NULL,
    amountBefore      REAL,
    amountAfter       REAL,
    upfrontPct        REAL,
    maxMonths         INTEGER,
    note              TEXT,
    actorUserId       TEXT,
    actorPortalUserId TEXT,
    applicationId     TEXT,
    createdAt         TEXT NOT NULL,
    CHECK (kind IN ('applied', 'approved', 'rejected', 'withdrawn', 'adjusted', 'frozen', 'unfrozen', 'closed', 'terms_accepted'))
  );
  CREATE INDEX IF NOT EXISTS idx_flexi_events_contact ON flexi_events (contactId, createdAt);
`;

export interface FlexiDeps {
  /** Ensures a finance client row exists for the contact and links it; returns its id. */
  ensureClientFor(contactId: string): string;
  exposure(clientId: string): number;
  attach(fileIds: string[], parent: { type: 'flexi_application'; id: string }, owner: { companyId: string; contactId: string; uploader: { kind: 'portal'; portalUserId: string } }): void;
  recordActivity(input: { companyId: string; contactId: string; actorUserId: string; action: string; summary: string }): void;
  /** Completes the review follow-up raised when the application arrived. */
  closeReview(app: FlexiApplication, userId?: string): void;
  userName(userId: string): string | undefined;
}

/** The follow-up trigger the portal raises for a new application; closed when it is decided or withdrawn. */
export const FLEXI_REVIEW_TRIGGER = 'portal_flexi';

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const MAX_NOTE = 1000;
const MAX_CR = 40;
const MAX_REASON = 500;
const given = (v: unknown) => v !== undefined && v !== null;

const reasonOf = (reason: unknown): string => {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (!text || text.length > MAX_REASON) throw new FlexiError(400, 'Give a reason (up to 500 characters).');
  return text;
};

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
    const state = (client?.flexiState ?? null) as FlexiState | null;
    const upfrontPct = client?.flexiUpfrontPct ?? FLEXI_DEFAULT_UPFRONT;
    const maxMonths = client?.flexiMaxMonths ?? FLEXI_DEFAULT_MONTHS;
    if (!enabled) return { enabled: false, state, balance: 0, used: 0, available: 0, upfrontPct, maxMonths, clientId: client?.id ?? null };
    const balance = Number(client.creditLimit ?? 0);
    const used = this.deps.exposure(client.id);
    const available = state === 'frozen' ? 0 : r3(Math.max(0, balance - used));
    return { enabled, state: state ?? 'active', balance, used, available, upfrontPct, maxMonths, clientId: client.id };
  }

  /** Contacts with a Peak Flexi account in any state (active, frozen or closed). */
  accountContactIds(companyId: string): string[] {
    return (this.db.prepare(
      `SELECT c.id FROM contacts c JOIN clients cl ON cl.id = COALESCE(c.clientId, c.id)
       WHERE c.companyId = ? AND cl.flexiState IS NOT NULL ORDER BY c.name COLLATE NOCASE`,
    ).all(companyId) as Array<{ id: string }>).map((r) => r.id);
  }

  /** When the account first opened: its first approval. */
  since(contactId: string): string | null {
    const row = this.db.prepare("SELECT MIN(createdAt) AS at FROM flexi_events WHERE contactId = ? AND kind = 'approved'").get(contactId) as { at: string | null };
    return row.at;
  }

  // ─── Settings ─────────────────────────────────────────────────────────

  settings(companyId: string): FlexiSettings {
    const row = this.db.prepare('SELECT * FROM flexi_settings WHERE companyId = ?').get(companyId) as any;
    if (!row) {
      return {
        standardAmount: FLEXI_STANDARD, defaultUpfrontPct: FLEXI_DEFAULT_UPFRONT, allowedMonths: [...FLEXI_ALLOWED_MONTHS],
        activationMonths: FLEXI_DEFAULT_MONTHS, increaseMonths: FLEXI_INCREASE_MONTHS, termsVersion: 1,
        termsAr: DEFAULT_TERMS_AR, termsEn: DEFAULT_TERMS_EN, updatedAt: null,
      };
    }
    return { ...row, allowedMonths: JSON.parse(row.allowedMonths), updatedBy: undefined } as FlexiSettings;
  }

  saveSettings(companyId: string, patch: Partial<Omit<FlexiSettings, 'termsVersion' | 'updatedAt'>>, userId: string): FlexiSettings {
    const current = this.settings(companyId);
    const num = (v: unknown, min: number, max: number, label: string) => {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new FlexiError(400, `${label} is not valid.`);
      return v;
    };
    const next = { ...current };
    if (given(patch.standardAmount)) next.standardAmount = r3(num(patch.standardAmount, 0.001, 1_000_000_000, 'The standard balance'));
    if (given(patch.defaultUpfrontPct)) next.defaultUpfrontPct = num(patch.defaultUpfrontPct, 0, 100, 'The down payment');
    if (given(patch.allowedMonths)) {
      const months = patch.allowedMonths;
      if (!Array.isArray(months) || months.length === 0 || months.some((m) => !Number.isInteger(m) || m < 1 || m > 36)) throw new FlexiError(400, 'Months must be whole numbers from 1 to 36.');
      next.allowedMonths = [...new Set(months as number[])].sort((a, b) => a - b);
    }
    if (given(patch.activationMonths)) next.activationMonths = num(patch.activationMonths, 1, 36, 'Activation months');
    if (given(patch.increaseMonths)) next.increaseMonths = num(patch.increaseMonths, 1, 36, 'Increase months');
    if (!next.allowedMonths.includes(next.activationMonths) || !next.allowedMonths.includes(next.increaseMonths)) {
      throw new FlexiError(400, 'The default months must be among the allowed months.');
    }
    let termsChanged = false;
    for (const key of ['termsAr', 'termsEn'] as const) {
      if (!given(patch[key])) continue;
      const text = typeof patch[key] === 'string' ? (patch[key] as string).trim() : '';
      if (!text || text.length > 20_000) throw new FlexiError(400, 'The terms cannot be empty.');
      if (text !== current[key]) { next[key] = text; termsChanged = true; }
    }
    next.termsVersion = current.termsVersion + (termsChanged ? 1 : 0);
    next.updatedAt = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO flexi_settings (companyId, standardAmount, defaultUpfrontPct, allowedMonths, activationMonths, increaseMonths, termsVersion, termsAr, termsEn, updatedAt, updatedBy)
       VALUES (@companyId, @standardAmount, @defaultUpfrontPct, @allowedMonths, @activationMonths, @increaseMonths, @termsVersion, @termsAr, @termsEn, @updatedAt, @updatedBy)
       ON CONFLICT(companyId) DO UPDATE SET standardAmount = excluded.standardAmount, defaultUpfrontPct = excluded.defaultUpfrontPct, allowedMonths = excluded.allowedMonths,
         activationMonths = excluded.activationMonths, increaseMonths = excluded.increaseMonths, termsVersion = excluded.termsVersion, termsAr = excluded.termsAr,
         termsEn = excluded.termsEn, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy`,
    ).run({ ...next, companyId, allowedMonths: JSON.stringify(next.allowedMonths), updatedBy: userId });
    return this.settings(companyId);
  }

  // ─── Account timeline and controls ────────────────────────────────────

  private event(input: { companyId: string; contactId: string; kind: FlexiEventKind; amountBefore?: number | null; amountAfter?: number | null; upfrontPct?: number | null; maxMonths?: number | null; note?: string | null; actorUserId?: string | null; actorPortalUserId?: string | null; applicationId?: string | null }) {
    this.db.prepare(
      `INSERT INTO flexi_events (id, companyId, contactId, kind, amountBefore, amountAfter, upfrontPct, maxMonths, note, actorUserId, actorPortalUserId, applicationId, createdAt)
       VALUES (@id, @companyId, @contactId, @kind, @amountBefore, @amountAfter, @upfrontPct, @maxMonths, @note, @actorUserId, @actorPortalUserId, @applicationId, @createdAt)`,
    ).run({
      amountBefore: null, amountAfter: null, upfrontPct: null, maxMonths: null, note: null, actorUserId: null, actorPortalUserId: null, applicationId: null,
      ...input, id: uuid(), createdAt: new Date().toISOString(),
    });
  }

  events(contactId: string): FlexiEvent[] {
    return (this.db.prepare('SELECT * FROM flexi_events WHERE contactId = ? ORDER BY createdAt DESC, rowid DESC').all(contactId) as any[])
      .map((row) => ({
        id: row.id, kind: row.kind, amountBefore: row.amountBefore, amountAfter: row.amountAfter, upfrontPct: row.upfrontPct, maxMonths: row.maxMonths,
        note: row.note, actorUserId: row.actorUserId, actorPortalUserId: row.actorPortalUserId,
        actorName: row.actorUserId ? this.deps.userName(row.actorUserId) ?? null : null, applicationId: row.applicationId, createdAt: row.createdAt,
      }));
  }

  private companyOf(contactId: string): string {
    const row = this.db.prepare('SELECT companyId FROM contacts WHERE id = ?').get(contactId) as { companyId: string } | undefined;
    if (!row) throw new FlexiError(404, 'Contact not found.');
    return row.companyId;
  }

  adjust(contactId: string, input: { amount?: unknown; upfrontPct?: unknown; maxMonths?: unknown; reason: unknown; userId: string }): FlexiBalance {
    return this.db.transaction(() => {
      const current = this.balanceOf(contactId);
      if (!current.enabled) throw new FlexiError(409, 'This client has no active Peak Flexi account.');
      const note = reasonOf(input.reason);
      for (const v of [input.amount, input.upfrontPct, input.maxMonths]) if (given(v) && typeof v !== 'number') throw new FlexiError(400, 'Values must be numbers.');
      const amount = given(input.amount) ? input.amount as number : current.balance;
      if (!Number.isFinite(amount) || amount <= 0) throw new FlexiError(400, 'Enter a balance above zero.');
      const upfrontPct = given(input.upfrontPct) ? input.upfrontPct as number : current.upfrontPct;
      if (!Number.isFinite(upfrontPct) || upfrontPct < 0 || upfrontPct > 100) throw new FlexiError(400, 'The down payment must be between 0% and 100%.');
      const maxMonths = given(input.maxMonths) ? input.maxMonths as number : current.maxMonths;
      if (!Number.isInteger(maxMonths) || maxMonths < 1 || maxMonths > 36) throw new FlexiError(400, 'Months must be a whole number from 1 to 36.');
      this.db.prepare('UPDATE clients SET creditLimit = ?, flexiUpfrontPct = ?, flexiMaxMonths = ? WHERE id = ?').run(r3(amount), upfrontPct, maxMonths, current.clientId);
      this.event({ companyId: this.companyOf(contactId), contactId, kind: 'adjusted', amountBefore: current.balance, amountAfter: r3(amount), upfrontPct, maxMonths, note, actorUserId: input.userId });
      return this.balanceOf(contactId);
    })();
  }

  private setState(contactId: string, from: FlexiState[], to: FlexiState, kind: FlexiEventKind, input: { reason: unknown; userId: string }): FlexiBalance {
    return this.db.transaction(() => {
      const current = this.balanceOf(contactId);
      if (!current.enabled || !current.state || !from.includes(current.state)) throw new FlexiError(409, `This account cannot be ${kind} now.`);
      const note = reasonOf(input.reason);
      if (to === 'closed') {
        this.db.prepare("UPDATE clients SET creditLimit = 0, flexiEnabled = 0, flexiState = 'closed' WHERE id = ?").run(current.clientId);
        // An open request must not bring a closed account back; the client starts again with an activation.
        const open = this.openFor(contactId);
        if (open) this.reject(open.id, { reviewNote: 'The Peak Flexi account was closed.', reviewerId: input.userId });
      } else {
        this.db.prepare('UPDATE clients SET flexiState = ? WHERE id = ?').run(to, current.clientId);
      }
      this.event({ companyId: this.companyOf(contactId), contactId, kind, amountBefore: current.balance, amountAfter: to === 'closed' ? 0 : current.balance, note, actorUserId: input.userId });
      return this.balanceOf(contactId);
    })();
  }

  freeze(contactId: string, input: { reason: unknown; userId: string }) { return this.setState(contactId, ['active'], 'frozen', 'frozen', input); }
  unfreeze(contactId: string, input: { reason: unknown; userId: string }) { return this.setState(contactId, ['frozen'], 'active', 'unfrozen', input); }
  close(contactId: string, input: { reason: unknown; userId: string }) { return this.setState(contactId, ['active', 'frozen'], 'closed', 'closed', input); }

  submit(input: { companyId: string; contactId: string; kind: FlexiKind; crNumber?: unknown; requestedAmount?: unknown; note?: unknown; fileIds: string[]; createdBy: string; termsVersion?: unknown }): FlexiApplication {
    return this.db.transaction(() => {
      if (input.kind !== 'activation' && input.kind !== 'increase') throw new FlexiError(400, 'Choose activation or increase.');
      const termsVersion = this.settings(input.companyId).termsVersion;
      if (input.termsVersion !== termsVersion) throw new FlexiError(400, 'The terms changed. Please read and accept them again.', 'TERMS_CHANGED');
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
        if (balance.state === 'frozen') throw new FlexiError(400, 'Your Peak Flexi account is paused. Please contact PEAK.');
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
        termsVersion, termsAcceptedAt: new Date().toISOString(),
      };
      this.db.prepare(
        `INSERT INTO flexi_applications (id, companyId, contactId, clientId, kind, status, crNumber, requestedAmount, approvedAmount, upfrontPct, maxMonths, note, reviewNote, createdBy, reviewedBy, createdAt, reviewedAt, termsVersion, termsAcceptedAt)
         VALUES (@id, @companyId, @contactId, @clientId, @kind, @status, @crNumber, @requestedAmount, @approvedAmount, @upfrontPct, @maxMonths, @note, @reviewNote, @createdBy, @reviewedBy, @createdAt, @reviewedAt, @termsVersion, @termsAcceptedAt)`,
      ).run(record);
      this.deps.attach(fileIds, { type: 'flexi_application', id: record.id }, { companyId: input.companyId, contactId: input.contactId, uploader: { kind: 'portal', portalUserId: input.createdBy } });
      const who = { companyId: input.companyId, contactId: input.contactId, actorPortalUserId: input.createdBy, applicationId: record.id };
      this.event({ ...who, kind: 'applied', amountAfter: requestedAmount });
      this.event({ ...who, kind: 'terms_accepted', note: `Terms version ${termsVersion}` });
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
      this.event({ companyId: app.companyId, contactId: app.contactId, kind: 'withdrawn', actorPortalUserId: app.createdBy, applicationId: app.id });
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
      const settings = this.settings(app.companyId);
      // Omitted terms keep the client's current ones; anything sent must be a real number, so a blank field never becomes 0%.
      if ((given(input.upfrontPct) && typeof input.upfrontPct !== 'number') || (given(input.maxMonths) && typeof input.maxMonths !== 'number')) {
        throw new FlexiError(400, 'Terms must be numbers.');
      }
      const upfrontPct = given(input.upfrontPct) ? input.upfrontPct as number : current.enabled ? current.upfrontPct : settings.defaultUpfrontPct;
      if (!Number.isFinite(upfrontPct) || upfrontPct < 0 || upfrontPct > 100) throw new FlexiError(400, 'The down payment must be between 0% and 100%.');
      const defaultMonths = app.kind === 'increase' ? settings.increaseMonths : settings.activationMonths;
      const maxMonths = given(input.maxMonths) ? input.maxMonths as number : defaultMonths;
      if (!Number.isInteger(maxMonths) || maxMonths < 1 || maxMonths > 36) throw new FlexiError(400, 'Months must be a whole number from 1 to 36.');
      const reviewNote = typeof input.reviewNote === 'string' && input.reviewNote.trim() ? input.reviewNote.trim().slice(0, MAX_NOTE) : null;

      const clientId = this.deps.ensureClientFor(app.contactId);
      this.db.prepare("UPDATE clients SET creditLimit = ?, flexiEnabled = 1, flexiState = CASE WHEN flexiState = 'frozen' THEN 'frozen' ELSE 'active' END, flexiUpfrontPct = ?, flexiMaxMonths = ? WHERE id = ?")
        .run(r3(amount), upfrontPct, maxMonths, clientId);
      this.db.prepare(
        "UPDATE flexi_applications SET status = 'approved', clientId = ?, approvedAmount = ?, upfrontPct = ?, maxMonths = ?, reviewNote = ?, reviewedBy = ?, reviewedAt = ? WHERE id = ?",
      ).run(clientId, r3(amount), upfrontPct, maxMonths, reviewNote, input.reviewerId, new Date().toISOString(), id);
      this.deps.recordActivity({
        companyId: app.companyId, contactId: app.contactId, actorUserId: input.reviewerId, action: 'flexi_approved',
        summary: `Peak Flexi ${app.kind} approved: balance ${r3(amount)}, ${upfrontPct}% down, up to ${maxMonths} months.`,
      });
      this.event({ companyId: app.companyId, contactId: app.contactId, kind: 'approved', amountBefore: current.balance, amountAfter: r3(amount), upfrontPct, maxMonths, note: reviewNote, actorUserId: input.reviewerId, applicationId: app.id });
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
      this.event({ companyId: app.companyId, contactId: app.contactId, kind: 'rejected', note: reviewNote, actorUserId: input.reviewerId, applicationId: app.id });
      this.deps.closeReview(app, input.reviewerId);
      return this.get(id)!;
    })();
  }
}
