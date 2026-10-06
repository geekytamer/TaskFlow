import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type { DataStore } from '../data/store';

/**
 * Bank reconciliation: a statement imported from the bank, line by line,
 * matched to the ledger lines of the bank account it belongs to. Every
 * statement line ends up matched to a ledger line, posted as a new entry
 * (bank fees, interest), or ignored; then the statement's closing balance
 * must equal the ledger balance on its last day.
 */

export type StatementStatus = 'open' | 'reconciled';

export interface BankStatement {
  id: string;
  companyId: string;
  accountId: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number | null;
  closingBalance: number | null;
  status: StatementStatus;
  reconciledAt: string | null;
  createdAt: string;
}

export interface StatementLine {
  id: string;
  statementId: string;
  /** YYYY-MM-DD */
  date: string;
  description: string;
  reference: string | null;
  /** Money in is positive, money out negative. */
  amount: number;
  journalLineId: string | null;
  ignored: boolean;
}

export interface LedgerCandidate {
  journalLineId: string;
  entryId: string;
  date: string;
  memo: string | null;
  sourceType: string;
  amount: number;
}

export interface CsvColumns {
  date: number;
  description: number;
  /** One signed amount column, or separate money-in / money-out columns. */
  amount?: number;
  moneyIn?: number;
  moneyOut?: number;
  reference?: number;
}

export type DateFormat = 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';

/** Dates within this many days of the statement line are offered as matches. */
export const MATCH_WINDOW_DAYS = 7;

const round = (n: number) => Math.round(n * 1000) / 1000;

/** RFC 4180-ish: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

/** "1,234.50", "(85.00)", "-85", "OMR 12.5" → number; NaN when there is no number. */
export function parseAmount(raw: string | undefined): number {
  if (raw === undefined) return NaN;
  const text = raw.trim();
  if (!text) return NaN;
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text.replace(/[^\d\-().]/g, ''));
  const digits = text.replace(/[^\d.]/g, '');
  if (!digits) return NaN;
  const value = Number(digits);
  return negative ? -value : value;
}

export function parseDate(raw: string | undefined, format: DateFormat): string | null {
  const text = (raw ?? '').trim();
  const parts = text.split(/[-/.]/).map((p) => p.trim());
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const [a, b, c] = parts.map(Number);
  const [y, m, d] = format === 'YYYY-MM-DD' ? [a, b, c] : format === 'DD/MM/YYYY' ? [c, b, a] : [c, a, b];
  const year = y < 100 ? 2000 + y : y;
  const date = new Date(Date.UTC(year, m - 1, d));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;

export class BankReconciliationStore {
  constructor(private readonly db: Database.Database) {}

  private decodeStatement(row: any): BankStatement {
    return { ...row, openingBalance: row.openingBalance ?? null, closingBalance: row.closingBalance ?? null, reconciledAt: row.reconciledAt ?? null };
  }

  private decodeLine(row: any): StatementLine {
    return { ...row, reference: row.reference ?? null, journalLineId: row.journalLineId ?? null, ignored: row.ignored === 1 };
  }

  list(companyId: string): Array<BankStatement & { lineCount: number; openCount: number }> {
    return (this.db.prepare(
      `SELECT s.*, COUNT(l.id) AS lineCount,
              SUM(CASE WHEN l.ignored = 0 AND (l.journalLineId IS NULL OR jl.id IS NULL) THEN 1 ELSE 0 END) AS openCount
         FROM bank_statements s
         LEFT JOIN bank_statement_lines l ON l.statementId = s.id
         LEFT JOIN journal_lines jl ON jl.id = l.journalLineId
        WHERE s.companyId = ?
        GROUP BY s.id ORDER BY s.periodEnd DESC, s.createdAt DESC`,
    ).all(companyId) as any[]).map((r) => ({ ...this.decodeStatement(r), lineCount: r.lineCount, openCount: r.openCount ?? 0 }));
  }

  get(id: string): BankStatement | undefined {
    const row = this.db.prepare('SELECT * FROM bank_statements WHERE id = ?').get(id);
    return row ? this.decodeStatement(row) : undefined;
  }

  /** Lines, with a match whose ledger line was since deleted treated as unmatched. */
  lines(statementId: string): StatementLine[] {
    return (this.db.prepare(
      `SELECT l.id, l.statementId, l.date, l.description, l.reference, l.amount, l.ignored,
              CASE WHEN jl.id IS NULL THEN NULL ELSE l.journalLineId END AS journalLineId
         FROM bank_statement_lines l LEFT JOIN journal_lines jl ON jl.id = l.journalLineId
        WHERE l.statementId = ? ORDER BY l.date, l.rowIndex`,
    ).all(statementId) as any[]).map((r) => this.decodeLine(r));
  }

  line(statementId: string, lineId: string): StatementLine | undefined {
    return this.lines(statementId).find((l) => l.id === lineId);
  }

  insert(statement: Omit<BankStatement, 'id' | 'status' | 'reconciledAt' | 'createdAt'>, lines: Array<Pick<StatementLine, 'date' | 'description' | 'reference' | 'amount'>>): BankStatement {
    const record: BankStatement = { ...statement, id: uuid(), status: 'open', reconciledAt: null, createdAt: new Date().toISOString() };
    const insertLine = this.db.prepare(
      'INSERT INTO bank_statement_lines (id, statementId, rowIndex, date, description, reference, amount, ignored) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
    );
    this.db.transaction(() => {
      this.db.prepare(
        `INSERT INTO bank_statements (id, companyId, accountId, name, periodStart, periodEnd, openingBalance, closingBalance, status, createdAt)
         VALUES (@id, @companyId, @accountId, @name, @periodStart, @periodEnd, @openingBalance, @closingBalance, 'open', @createdAt)`,
      ).run(record);
      lines.forEach((l, i) => insertLine.run(uuid(), record.id, i, l.date, l.description, l.reference, l.amount));
    })();
    return record;
  }

  /** Ledger lines on the account with this exact amount, near the date, not matched on any statement. */
  candidates(companyId: string, accountId: string, line: Pick<StatementLine, 'date' | 'amount'>, limit = 5): LedgerCandidate[] {
    const rows = this.db.prepare(
      `SELECT jl.id AS journalLineId, je.id AS entryId, substr(je.entryDate, 1, 10) AS date, je.memo, je.sourceType,
              ROUND(jl.debit - jl.credit, 3) AS amount
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entryId
        WHERE je.companyId = ? AND jl.accountId = ? AND ROUND(jl.debit - jl.credit, 3) = ?
          AND jl.id NOT IN (SELECT journalLineId FROM bank_statement_lines WHERE journalLineId IS NOT NULL)`,
    ).all(companyId, accountId, round(line.amount)) as LedgerCandidate[];
    return rows
      .filter((r) => dayDiff(r.date, line.date) <= MATCH_WINDOW_DAYS)
      .sort((a, b) => dayDiff(a.date, line.date) - dayDiff(b.date, line.date))
      .slice(0, limit);
  }

  /** Whether the ledger line is on this company's account for exactly this amount. */
  isOnAccount(journalLineId: string, companyId: string, accountId: string, amount: number): boolean {
    return Boolean(this.db.prepare(
      `SELECT 1 FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entryId
        WHERE jl.id = ? AND je.companyId = ? AND jl.accountId = ? AND ROUND(jl.debit - jl.credit, 3) = ?`,
    ).get(journalLineId, companyId, accountId, round(amount)));
  }

  match(lineId: string, journalLineId: string | null): void {
    this.db.prepare('UPDATE bank_statement_lines SET journalLineId = ?, ignored = 0 WHERE id = ?').run(journalLineId, lineId);
  }

  ignore(lineId: string, ignored: boolean): void {
    this.db.prepare('UPDATE bank_statement_lines SET ignored = ?, journalLineId = CASE WHEN ? = 1 THEN NULL ELSE journalLineId END WHERE id = ?')
      .run(ignored ? 1 : 0, ignored ? 1 : 0, lineId);
  }

  /** Ledger balance of the account at the end of `date` (debits minus credits). */
  ledgerBalance(companyId: string, accountId: string, date: string): number {
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS n FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entryId
        WHERE je.companyId = ? AND jl.accountId = ? AND substr(je.entryDate, 1, 10) <= ?`,
    ).get(companyId, accountId, date) as { n: number };
    return round(row.n);
  }

  setReconciled(id: string, reconciled: boolean): void {
    this.db.prepare('UPDATE bank_statements SET status = ?, reconciledAt = ? WHERE id = ?')
      .run(reconciled ? 'reconciled' : 'open', reconciled ? new Date().toISOString() : null, id);
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM bank_statements WHERE id = ?').run(id);
  }
}

/** Reads a statement CSV. Throws with the row number when a row cannot be read. */
export function readStatementCsv(csv: string, columns: CsvColumns, dateFormat: DateFormat, hasHeader: boolean) {
  if (columns.amount === undefined && columns.moneyIn === undefined && columns.moneyOut === undefined) {
    throw new Error('Choose an amount column, or money-in and money-out columns.');
  }
  const rows = parseCsv(csv).slice(hasHeader ? 1 : 0);
  if (rows.length === 0) throw new Error('The file has no rows.');
  if (rows.length > 5000) throw new Error('A statement can have at most 5,000 lines.');
  return rows.map((cells, index) => {
    const rowNumber = index + (hasHeader ? 2 : 1);
    const date = parseDate(cells[columns.date], dateFormat);
    if (!date) throw new Error(`Row ${rowNumber}: "${cells[columns.date] ?? ''}" is not a ${dateFormat} date.`);
    let amount: number;
    if (columns.amount !== undefined) amount = parseAmount(cells[columns.amount]);
    else {
      const moneyIn = columns.moneyIn !== undefined ? parseAmount(cells[columns.moneyIn]) : NaN;
      const moneyOut = columns.moneyOut !== undefined ? parseAmount(cells[columns.moneyOut]) : NaN;
      amount = (Number.isNaN(moneyIn) ? 0 : Math.abs(moneyIn)) - (Number.isNaN(moneyOut) ? 0 : Math.abs(moneyOut));
      if (Number.isNaN(moneyIn) && Number.isNaN(moneyOut)) amount = NaN;
    }
    if (!Number.isFinite(amount)) throw new Error(`Row ${rowNumber}: no amount.`);
    return {
      date,
      description: (cells[columns.description] ?? '').trim().slice(0, 500) || '—',
      reference: columns.reference !== undefined ? (cells[columns.reference] ?? '').trim().slice(0, 120) || null : null,
      amount: round(amount),
    };
  });
}

/**
 * Matches each open line to the one ledger line with its exact amount and the
 * nearest date, only when that choice is unambiguous: a single candidate, or
 * one strictly closer than the rest. Returns how many lines were matched.
 */
export function autoMatch(store: DataStore, statement: BankStatement): number {
  let matched = 0;
  for (const line of store.bank.lines(statement.id)) {
    if (line.journalLineId || line.ignored) continue;
    const found = store.bank.candidates(statement.companyId, statement.accountId, line, 2);
    if (found.length === 0) continue;
    const unambiguous = found.length === 1 || dayDiff(found[0].date, line.date) < dayDiff(found[1].date, line.date);
    if (!unambiguous) continue;
    store.bank.match(line.id, found[0].journalLineId);
    matched += 1;
  }
  return matched;
}

/**
 * Posts a statement line that has no ledger entry yet (a bank fee, interest)
 * against `counterAccountId`, and matches it. Money out debits the counter
 * account and credits the bank; money in the reverse.
 */
export function postStatementLine(store: DataStore, statement: BankStatement, line: StatementLine, counterAccountId: string, memo?: string): string {
  const amount = Math.abs(line.amount);
  const bankLineId = uuid();
  const entry = store.createJournalEntry({
    companyId: statement.companyId, sourceType: 'bank_statement', sourceId: statement.id,
    memo: memo?.trim() || line.description, entryDate: new Date(`${line.date}T12:00:00Z`),
    lines: line.amount < 0
      ? [
          { id: uuid(), accountId: counterAccountId, description: line.description, debit: amount, credit: 0 },
          { id: bankLineId, accountId: statement.accountId, description: line.description, debit: 0, credit: amount },
        ]
      : [
          { id: bankLineId, accountId: statement.accountId, description: line.description, debit: amount, credit: 0 },
          { id: uuid(), accountId: counterAccountId, description: line.description, debit: 0, credit: amount },
        ],
  });
  const posted = entry.lines.find((l) => l.accountId === statement.accountId && (line.amount < 0 ? l.credit > 0 : l.debit > 0));
  store.bank.match(line.id, posted?.id ?? bankLineId);
  return entry.id;
}

export interface ReconcileCheck {
  openLines: number;
  statementClosing: number | null;
  ledgerClosing: number;
  difference: number | null;
  ready: boolean;
}

/** Ready when every line is matched or ignored and the closing balance (if given) agrees with the ledger. */
export function reconcileCheck(store: DataStore, statement: BankStatement): ReconcileCheck {
  const openLines = store.bank.lines(statement.id).filter((l) => !l.journalLineId && !l.ignored).length;
  const ledgerClosing = store.bank.ledgerBalance(statement.companyId, statement.accountId, statement.periodEnd);
  const difference = statement.closingBalance === null ? null : round(statement.closingBalance - ledgerClosing);
  return {
    openLines, statementClosing: statement.closingBalance, ledgerClosing, difference,
    ready: openLines === 0 && (difference === null || Math.abs(difference) < 0.0005),
  };
}
