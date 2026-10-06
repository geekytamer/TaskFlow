import { autoMatch, postStatementLine, readStatementCsv, reconcileCheck, type CsvColumns, type DateFormat } from '../finance/bank-reconciliation';
import { HttpError } from '../http';
import { asRecord, enumValue, optionalNumber, optionalString, requiredString } from '../validation';
import type { RouteContext } from './context';
import { type AuthedRequest, companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/** Bank reconciliation. */
export function registerBankReconciliationRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles, withActor } = ctx;

  // Callers check access themselves (inline, so the permission extractor sees each route's gate).
  const statementFor = (req: AuthedRequest) => {
    const statement = store.bank.get(req.params.id);
    if (!statement) throw new HttpError(404, 'Statement not found.');
    return statement;
  };
  const assertOpenStatement = (statement: { status: string }) => {
    if (statement.status === 'reconciled') throw new HttpError(409, 'This statement is reconciled. Reopen it to change its matches.');
  };
  const statementLineFor = (statementId: string, lineId: string) => {
    const line = store.bank.line(statementId, lineId);
    if (!line) throw new HttpError(404, 'Statement line not found.');
    return line;
  };
  const ledgerAccountOf = (companyId: string, accountId: string, label: string) => {
    const account = store.listLedgerAccounts(companyId).find((a) => a.id === accountId);
    if (!account) throw new HttpError(400, `${label} does not belong to this company.`);
    return account;
  };
  const statementView = (statementId: string) => {
    const statement = store.bank.get(statementId)!;
    const lines = store.bank.lines(statementId).map((line) => ({
      ...line,
      candidates: line.journalLineId || line.ignored ? [] : store.bank.candidates(statement.companyId, statement.accountId, line),
    }));
    return { ...statement, lines, check: reconcileCheck(store, statement) };
  };

  app.get(
    '/companies/:companyId/bank-statements',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.bank.list(req.params.companyId));
    }),
  );

  app.post(
    '/companies/:companyId/bank-statements',
    authMiddleware,
    handler((req, res) => {
      const companyId = req.params.companyId;
      requireCompanyRoles(req, companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const account = ledgerAccountOf(companyId, requiredString(body.accountId, 'accountId'), 'The bank account');
      if (account.type !== 'Asset') throw new HttpError(400, 'Choose a bank or cash account.');
      const csv = requiredString(body.csv, 'csv');
      if (csv.length > 2_000_000) throw new HttpError(400, 'The file is too large.');
      const raw = asRecord(body.columns, 'columns');
      const column = (key: string) => (raw[key] === undefined || raw[key] === null || raw[key] === '' ? undefined : Number(raw[key]));
      const columns: CsvColumns = { date: Number(raw.date), description: Number(raw.description), amount: column('amount'), moneyIn: column('moneyIn'), moneyOut: column('moneyOut'), reference: column('reference') };
      if (Object.values(columns).some((v) => v !== undefined && (!Number.isInteger(v) || v < 0))) throw new HttpError(400, 'Columns are numbered from 0.');
      const dateFormat = enumValue(body.dateFormat ?? 'YYYY-MM-DD', 'dateFormat', ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'] as DateFormat[]);
      let lines;
      try { lines = readStatementCsv(csv, columns, dateFormat, body.hasHeader !== false); }
      catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Could not read the file.'); }
      const dates = lines.map((l) => l.date).sort();
      const statement = store.bank.insert({
        companyId, accountId: account.id,
        name: optionalString(body.name) ?? `${account.name} ${dates[0]} to ${dates[dates.length - 1]}`,
        periodStart: dates[0], periodEnd: dates[dates.length - 1],
        openingBalance: optionalNumber(body.openingBalance) ?? null, closingBalance: optionalNumber(body.closingBalance) ?? null,
      }, lines);
      const matched = autoMatch(store, statement);
      res.status(201).json({ ...statementView(statement.id), autoMatched: matched });
    }),
  );

  app.get(
    '/bank-statements/:id',
    authMiddleware,
    handler((req, res) => {
      const statement = statementFor(req);
      requireCompanyRoles(req, statement.companyId, companyManagementRoles);
      res.json(statementView(statement.id));
    }),
  );

  app.post(
    '/bank-statements/:id/lines/:lineId/match',
    authMiddleware,
    handler((req, res) => {
      const statement = statementFor(req);
      requireCompanyRoles(req, statement.companyId, companyManagementRoles);
      assertOpenStatement(statement);
      const line = statementLineFor(statement.id, req.params.lineId);
      const journalLineId = requiredString(asRecord(req.body, 'body').journalLineId, 'journalLineId');
      // Only a ledger line on this bank account, for this exact amount, can stand for the statement line.
      const ok = store.bank.isOnAccount(journalLineId, statement.companyId, statement.accountId, line.amount);
      if (!ok) throw new HttpError(400, 'That ledger line is not on this bank account for this amount.');
      try { store.bank.match(line.id, journalLineId); }
      catch { throw new HttpError(409, 'That ledger line is already matched to another statement line.'); }
      res.json(statementView(statement.id));
    }),
  );

  app.delete(
    '/bank-statements/:id/lines/:lineId/match',
    authMiddleware,
    handler((req, res) => {
      const statement = statementFor(req);
      requireCompanyRoles(req, statement.companyId, companyManagementRoles);
      assertOpenStatement(statement);
      store.bank.match(statementLineFor(statement.id, req.params.lineId).id, null);
      res.json(statementView(statement.id));
    }),
  );

  app.post(
    '/bank-statements/:id/lines/:lineId/ignore',
    authMiddleware,
    handler((req, res) => {
      const statement = statementFor(req);
      requireCompanyRoles(req, statement.companyId, companyManagementRoles);
      assertOpenStatement(statement);
      const line = statementLineFor(statement.id, req.params.lineId);
      store.bank.ignore(line.id, asRecord(req.body ?? {}, 'body').ignored !== false);
      res.json(statementView(statement.id));
    }),
  );

  app.post(
    '/bank-statements/:id/lines/:lineId/entry',
    authMiddleware,
    handler((req, res) => {
      const statement = statementFor(req);
      requireCompanyRoles(req, statement.companyId, companyManagementRoles);
      assertOpenStatement(statement);
      const line = statementLineFor(statement.id, req.params.lineId);
      if (line.journalLineId) throw new HttpError(409, 'This line is already matched.');
      const body = asRecord(req.body, 'body');
      const counter = ledgerAccountOf(statement.companyId, requiredString(body.accountId, 'accountId'), 'The account');
      if (counter.id === statement.accountId) throw new HttpError(400, 'Choose the account on the other side, not the bank itself.');
      try {
        withActor(req, () => postStatementLine(store, statement, line, counter.id, optionalString(body.memo)));
      } catch (error) {
        throw new HttpError(409, error instanceof Error ? error.message : 'Could not post the entry.');
      }
      res.status(201).json(statementView(statement.id));
    }),
  );

  app.post(
    '/bank-statements/:id/reconcile',
    authMiddleware,
    handler((req, res) => {
      const statement = statementFor(req);
      requireCompanyRoles(req, statement.companyId, companyManagementRoles);
      const reopen = asRecord(req.body ?? {}, 'body').reopen === true;
      if (reopen) {
        store.bank.setReconciled(statement.id, false);
        return res.json(statementView(statement.id));
      }
      const check = reconcileCheck(store, statement);
      if (!check.ready) {
        throw new HttpError(409, check.openLines > 0
          ? `${check.openLines} line(s) are not matched, posted or ignored yet.`
          : `The statement closes at ${check.statementClosing}, the ledger at ${check.ledgerClosing}.`, { check });
      }
      store.bank.setReconciled(statement.id, true);
      withActor(req, () => store.createActivityEvent({ companyId: statement.companyId, entityType: 'bank_statement', entityId: statement.id, action: 'reconciled', summary: `Statement "${statement.name}" reconciled.` }));
      res.json(statementView(statement.id));
    }),
  );

  app.delete(
    '/bank-statements/:id',
    authMiddleware,
    handler((req, res) => {
      const statement = statementFor(req);
      requireCompanyRoles(req, statement.companyId, companyManagementRoles);
      assertOpenStatement(statement);
      store.bank.remove(statement.id);
      res.status(204).end();
    }),
  );
}
