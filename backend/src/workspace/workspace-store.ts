import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

/**
 * The creator workspace: an influencer's own contacts, deals, deliverables and
 * files. Every read and write is scoped to one influencer (`Owner`); an id that
 * belongs to someone else behaves as if it did not exist. Peak's own records
 * are never copied here (see peak-mirror.ts).
 */

export interface Owner { companyId: string; ownerContactId: string }

export const WS_CONTACT_KINDS = ['brand', 'agency', 'manager', 'other'] as const;
export type WsContactKind = (typeof WS_CONTACT_KINDS)[number];
export const WS_DEAL_STATUSES = ['lead', 'confirmed', 'delivered', 'paid', 'cancelled'] as const;
export type WsDealStatus = (typeof WS_DEAL_STATUSES)[number];
export const WS_DELIVERABLE_STATUSES = ['todo', 'done'] as const;
export type WsDeliverableStatus = (typeof WS_DELIVERABLE_STATUSES)[number];

export interface WsContact {
  id: string; companyId: string; ownerContactId: string;
  name: string; kind: WsContactKind; company: string | null; email: string | null; phone: string | null; notes: string | null;
  peakContactId: string | null; archivedAt: string | null; createdAt: string; updatedAt: string;
}
export interface WsNote { id: string; wsContactId: string; body: string; createdAt: string }
export interface WsDeal {
  id: string; companyId: string; ownerContactId: string;
  wsContactId: string | null; title: string; amount: number | null; currency: string; status: WsDealStatus;
  startDate: string | null; endDate: string | null; notes: string | null; createdAt: string; updatedAt: string;
}
export interface WsDeliverable {
  id: string; dealId: string; title: string; platform: string | null; dueDate: string | null; status: WsDeliverableStatus;
  postUrl: string | null; createdAt: string;
}
export interface WsFileMeta { id: string; dealId: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string }

export type ContactInput = Partial<Pick<WsContact, 'company' | 'email' | 'phone' | 'notes'>> & Pick<WsContact, 'name' | 'kind'>;
export type DealInput = Partial<Pick<WsDeal, 'wsContactId' | 'amount' | 'startDate' | 'endDate' | 'notes'>> & Pick<WsDeal, 'title' | 'currency' | 'status'>;
export type DeliverableInput = Partial<Pick<WsDeliverable, 'platform' | 'dueDate' | 'status' | 'postUrl'>> & Pick<WsDeliverable, 'title'>;

const now = () => new Date().toISOString();
const FILE_COLUMNS = 'id, dealId, fileName, mimeType, sizeBytes, createdAt';

export class WorkspaceStore {
  constructor(private readonly db: Database.Database) {}

  // ── Contacts ──
  contacts(o: Owner, options: { includeArchived?: boolean } = {}): WsContact[] {
    return this.db.prepare(
      `SELECT * FROM ws_contacts WHERE companyId = ? AND ownerContactId = ? ${options.includeArchived ? '' : 'AND archivedAt IS NULL'} ORDER BY name COLLATE NOCASE`,
    ).all(o.companyId, o.ownerContactId) as WsContact[];
  }

  contact(o: Owner, id: string): WsContact | undefined {
    return this.db.prepare('SELECT * FROM ws_contacts WHERE id = ? AND companyId = ? AND ownerContactId = ?').get(id, o.companyId, o.ownerContactId) as WsContact | undefined;
  }

  addContact(o: Owner, input: ContactInput): WsContact {
    const at = now();
    const row: WsContact = {
      id: uuid(), ...o, name: input.name, kind: input.kind, company: input.company ?? null, email: input.email ?? null,
      phone: input.phone ?? null, notes: input.notes ?? null, peakContactId: null, archivedAt: null, createdAt: at, updatedAt: at,
    };
    this.db.prepare(
      `INSERT INTO ws_contacts (id, companyId, ownerContactId, name, kind, company, email, phone, notes, peakContactId, archivedAt, createdAt, updatedAt)
       VALUES (@id, @companyId, @ownerContactId, @name, @kind, @company, @email, @phone, @notes, @peakContactId, @archivedAt, @createdAt, @updatedAt)`,
    ).run(row);
    return row;
  }

  updateContact(o: Owner, id: string, patch: Partial<ContactInput>): WsContact | undefined {
    const current = this.contact(o, id);
    if (!current) return undefined;
    const next = { ...current, ...patch, updatedAt: now() };
    this.db.prepare('UPDATE ws_contacts SET name = @name, kind = @kind, company = @company, email = @email, phone = @phone, notes = @notes, updatedAt = @updatedAt WHERE id = @id').run(next);
    return next;
  }

  archiveContact(o: Owner, id: string): boolean {
    return this.db.prepare('UPDATE ws_contacts SET archivedAt = ?, updatedAt = ? WHERE id = ? AND companyId = ? AND ownerContactId = ? AND archivedAt IS NULL')
      .run(now(), now(), id, o.companyId, o.ownerContactId).changes > 0;
  }

  /** Staff turned this contact into a Peak contact; only the link is kept. */
  setPeakContact(o: Owner, id: string, peakContactId: string): void {
    this.db.prepare('UPDATE ws_contacts SET peakContactId = ? WHERE id = ? AND companyId = ? AND ownerContactId = ?').run(peakContactId, id, o.companyId, o.ownerContactId);
  }

  // ── Notes ──
  notes(o: Owner, wsContactId: string): WsNote[] {
    if (!this.contact(o, wsContactId)) return [];
    return this.db.prepare('SELECT id, wsContactId, body, createdAt FROM ws_contact_notes WHERE wsContactId = ? ORDER BY createdAt DESC, rowid DESC').all(wsContactId) as WsNote[];
  }

  addNote(o: Owner, wsContactId: string, body: string): WsNote | undefined {
    if (!this.contact(o, wsContactId)) return undefined;
    const note: WsNote = { id: uuid(), wsContactId, body, createdAt: now() };
    this.db.prepare('INSERT INTO ws_contact_notes (id, companyId, ownerContactId, wsContactId, body, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
      .run(note.id, o.companyId, o.ownerContactId, wsContactId, body, note.createdAt);
    return note;
  }

  // ── Deals ──
  deals(o: Owner): WsDeal[] {
    return this.db.prepare('SELECT * FROM ws_deals WHERE companyId = ? AND ownerContactId = ? ORDER BY COALESCE(startDate, substr(createdAt, 1, 10)) DESC, createdAt DESC')
      .all(o.companyId, o.ownerContactId) as WsDeal[];
  }

  deal(o: Owner, id: string): WsDeal | undefined {
    return this.db.prepare('SELECT * FROM ws_deals WHERE id = ? AND companyId = ? AND ownerContactId = ?').get(id, o.companyId, o.ownerContactId) as WsDeal | undefined;
  }

  addDeal(o: Owner, input: DealInput): WsDeal {
    const at = now();
    const row: WsDeal = {
      id: uuid(), ...o, wsContactId: input.wsContactId ?? null, title: input.title, amount: input.amount ?? null, currency: input.currency,
      status: input.status, startDate: input.startDate ?? null, endDate: input.endDate ?? null, notes: input.notes ?? null, createdAt: at, updatedAt: at,
    };
    this.db.prepare(
      `INSERT INTO ws_deals (id, companyId, ownerContactId, wsContactId, title, amount, currency, status, startDate, endDate, notes, createdAt, updatedAt)
       VALUES (@id, @companyId, @ownerContactId, @wsContactId, @title, @amount, @currency, @status, @startDate, @endDate, @notes, @createdAt, @updatedAt)`,
    ).run(row);
    return row;
  }

  updateDeal(o: Owner, id: string, patch: Partial<DealInput>): WsDeal | undefined {
    const current = this.deal(o, id);
    if (!current) return undefined;
    const next = { ...current, ...patch, updatedAt: now() };
    this.db.prepare(
      `UPDATE ws_deals SET wsContactId = @wsContactId, title = @title, amount = @amount, currency = @currency, status = @status,
       startDate = @startDate, endDate = @endDate, notes = @notes, updatedAt = @updatedAt WHERE id = @id`,
    ).run(next);
    return next;
  }

  deleteDeal(o: Owner, id: string): boolean {
    if (!this.deal(o, id)) return false;
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM ws_deliverables WHERE dealId = ?').run(id);
      this.db.prepare('DELETE FROM ws_files WHERE dealId = ?').run(id);
      this.db.prepare('DELETE FROM ws_deals WHERE id = ?').run(id);
    })();
    return true;
  }

  // ── Deliverables ──
  deliverables(o: Owner, dealId: string): WsDeliverable[] {
    if (!this.deal(o, dealId)) return [];
    return this.db.prepare('SELECT id, dealId, title, platform, dueDate, status, postUrl, createdAt FROM ws_deliverables WHERE dealId = ? ORDER BY dueDate IS NULL, dueDate, createdAt')
      .all(dealId) as WsDeliverable[];
  }

  /** Every deliverable of this influencer, for the calendar. */
  allDeliverables(o: Owner): Array<WsDeliverable & { dealTitle: string }> {
    return this.db.prepare(
      `SELECT d.id, d.dealId, d.title, d.platform, d.dueDate, d.status, d.postUrl, d.createdAt, deals.title AS dealTitle
       FROM ws_deliverables d JOIN ws_deals deals ON deals.id = d.dealId
       WHERE d.companyId = ? AND d.ownerContactId = ? ORDER BY d.dueDate IS NULL, d.dueDate`,
    ).all(o.companyId, o.ownerContactId) as Array<WsDeliverable & { dealTitle: string }>;
  }

  deliverable(o: Owner, id: string): WsDeliverable | undefined {
    return this.db.prepare('SELECT id, dealId, title, platform, dueDate, status, postUrl, createdAt FROM ws_deliverables WHERE id = ? AND companyId = ? AND ownerContactId = ?')
      .get(id, o.companyId, o.ownerContactId) as WsDeliverable | undefined;
  }

  addDeliverable(o: Owner, dealId: string, input: DeliverableInput): WsDeliverable | undefined {
    if (!this.deal(o, dealId)) return undefined;
    const row: WsDeliverable = {
      id: uuid(), dealId, title: input.title, platform: input.platform ?? null, dueDate: input.dueDate ?? null,
      status: input.status ?? 'todo', postUrl: input.postUrl ?? null, createdAt: now(),
    };
    this.db.prepare(
      `INSERT INTO ws_deliverables (id, companyId, ownerContactId, dealId, title, platform, dueDate, status, postUrl, createdAt)
       VALUES (@id, @companyId, @ownerContactId, @dealId, @title, @platform, @dueDate, @status, @postUrl, @createdAt)`,
    ).run({ ...row, ...o });
    return row;
  }

  updateDeliverable(o: Owner, id: string, patch: Partial<DeliverableInput>): WsDeliverable | undefined {
    const current = this.deliverable(o, id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    this.db.prepare('UPDATE ws_deliverables SET title = @title, platform = @platform, dueDate = @dueDate, status = @status, postUrl = @postUrl WHERE id = @id').run(next);
    return next;
  }

  deleteDeliverable(o: Owner, id: string): boolean {
    return this.db.prepare('DELETE FROM ws_deliverables WHERE id = ? AND companyId = ? AND ownerContactId = ?').run(id, o.companyId, o.ownerContactId).changes > 0;
  }

  // ── Files ──
  files(o: Owner, dealId: string): WsFileMeta[] {
    if (!this.deal(o, dealId)) return [];
    return this.db.prepare(`SELECT ${FILE_COLUMNS} FROM ws_files WHERE dealId = ? ORDER BY createdAt, rowid`).all(dealId) as WsFileMeta[];
  }

  addFile(o: Owner, dealId: string, input: { fileName: string; mimeType: string; content: Buffer }): WsFileMeta | undefined {
    if (!this.deal(o, dealId)) return undefined;
    const meta: WsFileMeta = { id: uuid(), dealId, fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.content.length, createdAt: now() };
    this.db.prepare(
      `INSERT INTO ws_files (id, companyId, ownerContactId, dealId, fileName, mimeType, sizeBytes, content, createdAt)
       VALUES (@id, @companyId, @ownerContactId, @dealId, @fileName, @mimeType, @sizeBytes, @content, @createdAt)`,
    ).run({ ...meta, ...o, content: input.content });
    return meta;
  }

  fileContent(o: Owner, id: string): { meta: WsFileMeta; content: Buffer } | undefined {
    const row = this.db.prepare(`SELECT ${FILE_COLUMNS}, content FROM ws_files WHERE id = ? AND companyId = ? AND ownerContactId = ?`)
      .get(id, o.companyId, o.ownerContactId) as (WsFileMeta & { content: Buffer }) | undefined;
    if (!row) return undefined;
    const { content, ...meta } = row;
    return { meta, content };
  }

  deleteFile(o: Owner, id: string): boolean {
    return this.db.prepare('DELETE FROM ws_files WHERE id = ? AND companyId = ? AND ownerContactId = ?').run(id, o.companyId, o.ownerContactId).changes > 0;
  }

  // ── Settings ──
  settings(o: Owner): { defaultCurrency: string | null } {
    const row = this.db.prepare('SELECT defaultCurrency FROM ws_settings WHERE companyId = ? AND ownerContactId = ?').get(o.companyId, o.ownerContactId) as { defaultCurrency: string | null } | undefined;
    return { defaultCurrency: row?.defaultCurrency ?? null };
  }

  setSettings(o: Owner, input: { defaultCurrency: string | null }): void {
    this.db.prepare(
      `INSERT INTO ws_settings (companyId, ownerContactId, defaultCurrency) VALUES (?, ?, ?)
       ON CONFLICT (companyId, ownerContactId) DO UPDATE SET defaultCurrency = excluded.defaultCurrency`,
    ).run(o.companyId, o.ownerContactId, input.defaultCurrency);
  }

  /** Whether the influencer has recorded anything yet (the staff section shows an empty state otherwise). */
  hasData(o: Owner): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM ws_contacts WHERE companyId = ? AND ownerContactId = ? UNION SELECT 1 FROM ws_deals WHERE companyId = ? AND ownerContactId = ? LIMIT 1')
      .get(o.companyId, o.ownerContactId, o.companyId, o.ownerContactId));
  }
}
