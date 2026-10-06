import { apiFetch } from '@/lib/api-client';

export type DateFormat = 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';

export interface StatementSummary {
  id: string;
  accountId: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  closingBalance: number | null;
  status: 'open' | 'reconciled';
  reconciledAt: string | null;
  lineCount: number;
  openCount: number;
}

export interface LedgerCandidate { journalLineId: string; entryId: string; date: string; memo: string | null; sourceType: string; amount: number }

export interface StatementLineView {
  id: string;
  date: string;
  description: string;
  reference: string | null;
  amount: number;
  journalLineId: string | null;
  ignored: boolean;
  candidates: LedgerCandidate[];
}

export interface ReconcileCheck { openLines: number; statementClosing: number | null; ledgerClosing: number; difference: number | null; ready: boolean }

export interface StatementView extends Omit<StatementSummary, 'lineCount' | 'openCount'> {
  lines: StatementLineView[];
  check: ReconcileCheck;
  autoMatched?: number;
}

export interface StatementImport {
  accountId: string;
  name?: string;
  csv: string;
  hasHeader: boolean;
  dateFormat: DateFormat;
  columns: { date: number; description: number; amount?: number; moneyIn?: number; moneyOut?: number; reference?: number };
  closingBalance?: number;
}

const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });

export const getStatements = (companyId: string) => apiFetch<StatementSummary[]>(`/companies/${companyId}/bank-statements`);
export const importStatement = (companyId: string, data: StatementImport) => apiFetch<StatementView>(`/companies/${companyId}/bank-statements`, json(data));
export const getStatement = (id: string) => apiFetch<StatementView>(`/bank-statements/${id}`);
export const matchLine = (id: string, lineId: string, journalLineId: string) => apiFetch<StatementView>(`/bank-statements/${id}/lines/${lineId}/match`, json({ journalLineId }));
export const unmatchLine = (id: string, lineId: string) => apiFetch<StatementView>(`/bank-statements/${id}/lines/${lineId}/match`, { method: 'DELETE' });
export const ignoreLine = (id: string, lineId: string, ignored: boolean) => apiFetch<StatementView>(`/bank-statements/${id}/lines/${lineId}/ignore`, json({ ignored }));
export const postLine = (id: string, lineId: string, accountId: string, memo?: string) => apiFetch<StatementView>(`/bank-statements/${id}/lines/${lineId}/entry`, json({ accountId, memo }));
export const reconcileStatement = (id: string, reopen = false) => apiFetch<StatementView>(`/bank-statements/${id}/reconcile`, json({ reopen }));
export const deleteStatement = (id: string) => apiFetch<void>(`/bank-statements/${id}`, { method: 'DELETE' });

/** Same reader as the server, for the import preview only. */
export function previewCsv(text: string, limit = 6): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length && rows.length < limit; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (rows.length < limit) { row.push(field); if (row.some((v) => v.trim() !== '')) rows.push(row); }
  return rows;
}
