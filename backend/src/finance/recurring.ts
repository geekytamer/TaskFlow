import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { InvoiceLineItem } from '../types';

export type RecurringKind = 'invoice' | 'bill';
export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
/** draft: created for review. issue: invoices are sent, bills approved. */
export type RecurringMode = 'draft' | 'issue';

export interface RecurringInvoiceContent {
  lineItems: InvoiceLineItem[];
  taxRate?: number;
  currency?: string;
  notes?: string;
  templateId?: string;
}

export interface RecurringBillContent {
  amount: number;
  taxRate?: number;
  expenseAccountId?: string;
  notes?: string;
}

export interface RecurringDocument {
  id: string;
  companyId: string;
  kind: RecurringKind;
  name: string;
  /** Client for invoices, supplier for bills. */
  partyId: string;
  content: RecurringInvoiceContent | RecurringBillContent;
  frequency: RecurringFrequency;
  /** YYYY-MM-DD. The day of month repeats from here. */
  startDate: string;
  nextRunDate: string;
  endDate: string | null;
  mode: RecurringMode;
  paymentTermsDays: number;
  active: boolean;
  createdByUserId: string;
  createdAt: string;
}

export type RecurringRunStatus = 'created' | 'held' | 'failed';

export interface RecurringRun {
  recurringId: string;
  runDate: string;
  documentId: string | null;
  status: RecurringRunStatus;
  message: string | null;
  createdAt: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/**
 * The run after `from`, keeping the start date's day of month: a schedule
 * started on the 31st runs on the 30th in April and the 28th/29th in
 * February, then back on the 31st.
 */
export function nextRun(from: string, frequency: RecurringFrequency, anchor: string): string {
  const [y, m, d] = from.split('-').map(Number);
  if (frequency === 'weekly') return isoDate(new Date(Date.UTC(y, m - 1, d + 7)));
  const months = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12;
  const anchorDay = Number(anchor.split('-')[2]);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(anchorDay, lastDay));
  return isoDate(target);
}

/** Schedules and their run log. Generating documents is `runDueRecurring` in recurring-runner.ts. */
export class RecurringStore {
  constructor(private readonly db: Database.Database) {}

  private decode(row: any): RecurringDocument {
    return { ...row, content: JSON.parse(row.content), active: row.active === 1, endDate: row.endDate ?? null };
  }

  list(companyId: string): RecurringDocument[] {
    return (this.db.prepare('SELECT * FROM recurring_documents WHERE companyId = ? ORDER BY createdAt DESC').all(companyId) as any[]).map((r) => this.decode(r));
  }

  get(id: string): RecurringDocument | undefined {
    const row = this.db.prepare('SELECT * FROM recurring_documents WHERE id = ?').get(id);
    return row ? this.decode(row) : undefined;
  }

  /** Active schedules with a run due on or before `today`, across companies. */
  due(today: string): RecurringDocument[] {
    return (this.db.prepare('SELECT * FROM recurring_documents WHERE active = 1 AND nextRunDate <= ? ORDER BY nextRunDate').all(today) as any[]).map((r) => this.decode(r));
  }

  create(input: Omit<RecurringDocument, 'id' | 'nextRunDate' | 'active' | 'createdAt'>): RecurringDocument {
    const record: RecurringDocument = { ...input, id: uuid(), nextRunDate: input.startDate, active: true, createdAt: new Date().toISOString() };
    this.db.prepare(
      `INSERT INTO recurring_documents (id, companyId, kind, name, partyId, content, frequency, startDate, nextRunDate, endDate, mode, paymentTermsDays, active, createdByUserId, createdAt)
       VALUES (@id, @companyId, @kind, @name, @partyId, @content, @frequency, @startDate, @nextRunDate, @endDate, @mode, @paymentTermsDays, 1, @createdByUserId, @createdAt)`,
    ).run({ ...record, content: JSON.stringify(record.content) });
    return record;
  }

  /** Changes what future runs produce. Moving the start re-anchors the schedule. */
  update(id: string, patch: Partial<Pick<RecurringDocument, 'name' | 'partyId' | 'content' | 'frequency' | 'startDate' | 'endDate' | 'mode' | 'paymentTermsDays' | 'active'>>): RecurringDocument | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const next = { ...existing, ...patch };
    if (patch.startDate && patch.startDate !== existing.startDate) next.nextRunDate = patch.startDate;
    this.db.prepare(
      `UPDATE recurring_documents SET name = @name, partyId = @partyId, content = @content, frequency = @frequency, startDate = @startDate,
       nextRunDate = @nextRunDate, endDate = @endDate, mode = @mode, paymentTermsDays = @paymentTermsDays, active = @active WHERE id = @id`,
    ).run({ ...next, content: JSON.stringify(next.content), active: next.active ? 1 : 0, endDate: next.endDate ?? null });
    return this.get(id);
  }

  remove(id: string): boolean {
    return this.db.prepare('DELETE FROM recurring_documents WHERE id = ?').run(id).changes === 1;
  }

  /** Claims a run date. False if it was already claimed (another process, or an earlier pass). */
  claim(recurringId: string, runDate: string): boolean {
    return this.db.prepare("INSERT OR IGNORE INTO recurring_runs (recurringId, runDate, status, createdAt) VALUES (?, ?, 'failed', ?)")
      .run(recurringId, runDate, new Date().toISOString()).changes === 1;
  }

  finish(recurringId: string, runDate: string, status: RecurringRunStatus, documentId: string | null, message: string | null): void {
    this.db.prepare('UPDATE recurring_runs SET status = ?, documentId = ?, message = ? WHERE recurringId = ? AND runDate = ?')
      .run(status, documentId, message, recurringId, runDate);
  }

  advance(id: string, nextRunDate: string, active: boolean): void {
    this.db.prepare('UPDATE recurring_documents SET nextRunDate = ?, active = ? WHERE id = ?').run(nextRunDate, active ? 1 : 0, id);
  }

  runs(recurringId: string, limit = 24): RecurringRun[] {
    return this.db.prepare('SELECT * FROM recurring_runs WHERE recurringId = ? ORDER BY runDate DESC LIMIT ?').all(recurringId, limit) as RecurringRun[];
  }
}
