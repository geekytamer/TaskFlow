'use client';

import * as React from 'react';
import { ArrowLeft, Check, CheckCircle2, EyeOff, FileUp, Landmark, Link2, Trash2, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import type { LedgerAccount } from '@/modules/finance/types';
import { getLedgerAccounts } from '@/services/financeService';
import {
  deleteStatement, getStatement, getStatements, ignoreLine, importStatement, matchLine, postLine, previewCsv,
  reconcileStatement, unmatchLine, type DateFormat, type StatementLineView, type StatementSummary, type StatementView,
} from '@/services/bankService';

type Tr = (en: string, ar: string) => string;
const NONE = '__none__';

/**
 * Bank reconciliation: import the bank's statement, tick each line off
 * against the ledger (most match on their own), post what the books are
 * missing (fees, interest), and close the statement when the balances agree.
 */
export function BankReconciliationPanel() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr: Tr = React.useCallback((en, ar) => (language === 'ar' ? ar : en), [language]);
  const { toast } = useToast();
  const confirm = useConfirm();
  const companyId = selectedCompany?.id ?? '';

  const [statements, setStatements] = React.useState<StatementSummary[]>([]);
  const [accounts, setAccounts] = React.useState<LedgerAccount[]>([]);
  const [open, setOpen] = React.useState<StatementView | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [s, a] = await Promise.all([getStatements(companyId), getLedgerAccounts(companyId)]);
      setStatements(s);
      setAccounts(a);
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not load statements', 'تعذّر تحميل الكشوف'), description: error?.message });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast, tr]);
  React.useEffect(() => { void load(); }, [load]);

  const accountName = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.code} ${a.name}` : '—';
  };

  if (open) {
    return (
      <StatementScreen
        statement={open}
        accounts={accounts}
        accountName={accountName}
        tr={tr}
        onChange={setOpen}
        onBack={() => { setOpen(null); void load(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {tr('Import your bank statement and tick each line off against the books. Most lines match on their own; bank fees and interest can be posted from here.',
            'استورد كشف حسابك البنكي وطابق كل سطر مع الدفاتر. تتطابق معظم الأسطر تلقائياً، ويمكن تسجيل الرسوم البنكية والفوائد من هنا.')}
        </p>
        <Button onClick={() => setImporting(true)}><FileUp className="me-2 h-4 w-4" />{tr('Import statement', 'استيراد كشف')}</Button>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('Statement', 'الكشف')}</TableHead>
              <TableHead>{tr('Account', 'الحساب')}</TableHead>
              <TableHead>{tr('Period', 'الفترة')}</TableHead>
              <TableHead>{tr('Lines', 'الأسطر')}</TableHead>
              <TableHead>{tr('Status', 'الحالة')}</TableHead>
              <TableHead className="text-end"><span className="sr-only">{tr('Actions', 'الإجراءات')}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</TableCell></TableRow>
            ) : statements.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                <Landmark className="mx-auto mb-2 h-6 w-6" />{tr('No statements yet. Export a CSV from your online banking and import it.', 'لا توجد كشوف بعد. صدّر ملف CSV من خدمتك البنكية الإلكترونية واستورده.')}
              </TableCell></TableRow>
            ) : statements.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium" dir="auto">{s.name}</TableCell>
                <TableCell>{accountName(s.accountId)}</TableCell>
                <TableCell className="tabular-nums">{s.periodStart} → {s.periodEnd}</TableCell>
                <TableCell className="tabular-nums">
                  {s.lineCount}
                  {s.openCount > 0 && <span className="ms-1 text-xs text-amber-700 dark:text-amber-400">({tr(`${s.openCount} to do`, `${s.openCount} متبقية`)})</span>}
                </TableCell>
                <TableCell>
                  {s.status === 'reconciled'
                    ? <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-200"><CheckCircle2 className="h-3 w-3" />{tr('Reconciled', 'مُسوّى')}</Badge>
                    : <Badge variant="outline">{tr('Open', 'مفتوح')}</Badge>}
                </TableCell>
                <TableCell className="text-end">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="secondary" onClick={async () => {
                      try { setOpen(await getStatement(s.id)); } catch (error: any) { toast({ variant: 'destructive', title: tr('Could not open', 'تعذّر الفتح'), description: error?.message }); }
                    }}>{s.status === 'reconciled' ? tr('View', 'عرض') : tr('Reconcile', 'تسوية')}</Button>
                    {s.status === 'open' && (
                      <Button size="icon" variant="ghost" aria-label={tr(`Delete ${s.name}`, `حذف ${s.name}`)} onClick={async () => {
                        if (!(await confirm({ title: tr('Delete this statement?', 'حذف هذا الكشف؟'), description: tr('Its matches are removed. Entries posted from it stay in the books.', 'تُزال مطابقاته. وتبقى القيود المسجّلة منه في الدفاتر.'), confirmText: tr('Delete', 'حذف'), cancelText: tr('Cancel', 'إلغاء'), destructive: true }))) return;
                        try { await deleteStatement(s.id); await load(); } catch (error: any) { toast({ variant: 'destructive', title: tr('Could not delete', 'تعذّر الحذف'), description: error?.message }); }
                      }}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {importing && (
        <ImportDialog
          accounts={accounts.filter((a) => a.type === 'Asset' && a.isActive !== false)}
          tr={tr}
          onClose={() => setImporting(false)}
          onImport={async (data) => {
            try {
              const view = await importStatement(companyId, data);
              toast({ title: tr(`${view.lines.length} lines imported`, `تم استيراد ${view.lines.length} سطراً`), description: tr(`${view.autoMatched ?? 0} matched on their own.`, `تطابق ${view.autoMatched ?? 0} منها تلقائياً.`) });
              setImporting(false);
              setOpen(view);
            } catch (error: any) {
              toast({ variant: 'destructive', title: tr('Could not import', 'تعذّر الاستيراد'), description: error?.message });
            }
          }}
        />
      )}
    </div>
  );
}

function ImportDialog({ accounts, tr, onClose, onImport }: {
  accounts: LedgerAccount[]; tr: Tr; onClose: () => void;
  onImport: (data: Parameters<typeof importStatement>[1]) => Promise<void>;
}) {
  const bankDefault = accounts.find((a) => a.code === '1010') ?? accounts[0];
  const [accountId, setAccountId] = React.useState(bankDefault?.id ?? '');
  const [csv, setCsv] = React.useState('');
  const [fileName, setFileName] = React.useState('');
  const [hasHeader, setHasHeader] = React.useState(true);
  const [dateFormat, setDateFormat] = React.useState<DateFormat>('DD/MM/YYYY');
  const [cols, setCols] = React.useState<Record<string, string>>({ date: '0', description: '1', amount: '2', moneyIn: NONE, moneyOut: NONE, reference: NONE });
  const [closing, setClosing] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const preview = React.useMemo(() => previewCsv(csv), [csv]);
  const width = Math.max(0, ...preview.map((r) => r.length));
  const header = hasHeader ? preview[0] ?? [] : [];
  const columnName = (i: number) => (header[i]?.trim() ? header[i] : tr(`Column ${i + 1}`, `العمود ${i + 1}`));
  const pick = (key: string) => (cols[key] === NONE ? undefined : Number(cols[key]));
  const separate = cols.amount === NONE;
  const valid = accountId && csv && pick('date') !== undefined && pick('description') !== undefined && (!separate || pick('moneyIn') !== undefined || pick('moneyOut') !== undefined);

  const columnSelect = (key: string, label: string, optional: boolean) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={cols[key]} onValueChange={(v) => setCols((c) => ({ ...c, [key]: v }))}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {optional && <SelectItem value={NONE}>{tr('— none —', '— لا شيء —')}</SelectItem>}
          {Array.from({ length: width }, (_, i) => <SelectItem key={i} value={String(i)}>{columnName(i)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{tr('Import a bank statement', 'استيراد كشف بنكي')}</DialogTitle>
          <DialogDescription>{tr('A CSV file from your online banking. Tell us which column is which; the preview shows the first rows.', 'ملف CSV من خدمتك البنكية الإلكترونية. حدّد ما يمثله كل عمود؛ وتعرض المعاينة الصفوف الأولى.')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{tr('Bank account in the books', 'الحساب البنكي في الدفاتر')}</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder={tr('Choose…', 'اختر…')} /></SelectTrigger>
              <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bank-file">{tr('Statement file (.csv)', 'ملف الكشف (.csv)')}</Label>
            <Input id="bank-file" type="file" accept=".csv,text/csv" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setFileName(file.name);
              setCsv(await file.text());
            }} />
          </div>
        </div>

        {preview.length > 0 && (
          <>
            <div className="max-h-48 overflow-auto rounded-md border text-xs">
              <table className="w-full">
                <tbody>
                  {preview.map((row, r) => (
                    <tr key={r} className={cn(r === 0 && hasHeader && 'bg-muted font-medium')}>
                      {Array.from({ length: width }, (_, i) => <td key={i} className="whitespace-nowrap border-b px-2 py-1" dir="auto">{row[i] ?? ''}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={hasHeader} onCheckedChange={(v) => setHasHeader(v === true)} />
              {tr('The first row is a header', 'الصف الأول عناوين')}
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              {columnSelect('date', tr('Date', 'التاريخ'), false)}
              {columnSelect('description', tr('Description', 'الوصف'), false)}
              {columnSelect('reference', tr('Reference', 'المرجع'), true)}
              {columnSelect('amount', tr('Amount (+ in, − out)', 'المبلغ (+ وارد، − صادر)'), true)}
              {separate && columnSelect('moneyIn', tr('Money in', 'الوارد'), true)}
              {separate && columnSelect('moneyOut', tr('Money out', 'الصادر'), true)}
              <div className="space-y-1.5">
                <Label>{tr('Date format', 'صيغة التاريخ')}</Label>
                <Select value={dateFormat} onValueChange={(v) => setDateFormat(v as DateFormat)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank-closing">{tr('Closing balance (optional)', 'الرصيد الختامي (اختياري)')}</Label>
                <Input id="bank-closing" type="number" step="any" value={closing} onChange={(e) => setClosing(e.target.value)} />
              </div>
            </div>
            {separate && <p className="text-xs text-muted-foreground">{tr('No single amount column: choose the money-in and money-out columns instead.', 'لا يوجد عمود مبلغ واحد: اختر عمودي الوارد والصادر بدلاً منه.')}</p>}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
          <Button disabled={!valid || saving} onClick={async () => {
            setSaving(true);
            try {
              await onImport({
                accountId, csv, hasHeader, dateFormat, name: fileName ? fileName.replace(/\.csv$/i, '') : undefined,
                columns: { date: pick('date')!, description: pick('description')!, amount: pick('amount'), moneyIn: separate ? pick('moneyIn') : undefined, moneyOut: separate ? pick('moneyOut') : undefined, reference: pick('reference') },
                closingBalance: closing === '' ? undefined : Number(closing),
              });
            } finally { setSaving(false); }
          }}><FileUp className="me-2 h-4 w-4" />{tr('Import', 'استيراد')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatementScreen({ statement, accounts, accountName, tr, onChange, onBack }: {
  statement: StatementView; accounts: LedgerAccount[]; accountName: (id: string) => string; tr: Tr;
  onChange: (s: StatementView) => void; onBack: () => void;
}) {
  const { money } = useCompanyCurrency();
  const { toast } = useToast();
  const [posting, setPosting] = React.useState<StatementLineView | null>(null);
  const locked = statement.status === 'reconciled';
  const run = async (fn: () => Promise<StatementView>, fail: string) => {
    try { onChange(await fn()); } catch (error: any) { toast({ variant: 'destructive', title: fail, description: error?.message }); }
  };
  const { check } = statement;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="me-1 h-4 w-4 rtl:rotate-180" />{tr('Statements', 'الكشوف')}</Button>
        <h3 className="text-lg font-semibold" dir="auto">{statement.name}</h3>
        <span className="text-sm text-muted-foreground">{accountName(statement.accountId)} · {statement.periodStart} → {statement.periodEnd}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={tr('Still to do', 'المتبقي')} value={String(check.openLines)} tone={check.openLines ? 'warn' : 'ok'} />
        <Stat label={tr('Bank says', 'حسب البنك')} value={check.statementClosing === null ? tr('not given', 'غير محدد') : money(check.statementClosing)} />
        <Stat label={tr('Books say', 'حسب الدفاتر')} value={money(check.ledgerClosing)} />
        <Stat label={tr('Difference', 'الفرق')} value={check.difference === null ? '—' : money(check.difference)} tone={check.difference !== null && Math.abs(check.difference) >= 0.0005 ? 'warn' : 'ok'} />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {locked ? (
          <Button variant="outline" onClick={() => run(() => reconcileStatement(statement.id, true), tr('Could not reopen', 'تعذّرت إعادة الفتح'))}>{tr('Reopen', 'إعادة فتح')}</Button>
        ) : (
          <Button disabled={!check.ready} onClick={() => run(() => reconcileStatement(statement.id), tr('Not reconciled yet', 'لم تتم التسوية بعد'))}>
            <Check className="me-2 h-4 w-4" />{tr('Mark reconciled', 'تأكيد التسوية')}
          </Button>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">{tr('Date', 'التاريخ')}</TableHead>
              <TableHead>{tr('Bank line', 'سطر البنك')}</TableHead>
              <TableHead className="w-32 text-end">{tr('Amount', 'المبلغ')}</TableHead>
              <TableHead>{tr('In the books', 'في الدفاتر')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statement.lines.map((line) => (
              <TableRow key={line.id} className={cn(line.ignored && 'opacity-50')}>
                <TableCell className="tabular-nums">{line.date}</TableCell>
                <TableCell>
                  <div dir="auto">{line.description}</div>
                  {line.reference && <div className="text-xs text-muted-foreground">{line.reference}</div>}
                </TableCell>
                <TableCell className={cn('text-end tabular-nums', line.amount < 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400')}>{money(line.amount)}</TableCell>
                <TableCell>
                  {line.journalLineId ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-200"><Check className="h-3 w-3" />{tr('Matched', 'مطابق')}</Badge>
                      {!locked && <Button size="sm" variant="ghost" onClick={() => run(() => unmatchLine(statement.id, line.id), tr('Could not undo', 'تعذّر التراجع'))}><Undo2 className="me-1 h-3.5 w-3.5" />{tr('Undo', 'تراجع')}</Button>}
                    </div>
                  ) : line.ignored ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {tr('Ignored', 'متجاهل')}
                      {!locked && <Button size="sm" variant="ghost" onClick={() => run(() => ignoreLine(statement.id, line.id, false), tr('Could not update', 'تعذّر التحديث'))}>{tr('Undo', 'تراجع')}</Button>}
                    </div>
                  ) : locked ? null : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {line.candidates.map((c) => (
                        <Button key={c.journalLineId} size="sm" variant="outline" className="h-auto py-1 text-start" onClick={() => run(() => matchLine(statement.id, line.id, c.journalLineId), tr('Could not match', 'تعذّرت المطابقة'))}>
                          <Link2 className="me-1.5 h-3.5 w-3.5 shrink-0" />
                          <span className="text-xs"><span className="tabular-nums">{c.date}</span> · <span dir="auto">{c.memo || c.sourceType}</span></span>
                        </Button>
                      ))}
                      <Button size="sm" variant="secondary" onClick={() => setPosting(line)}>{tr('Post to account…', 'تسجيل على حساب…')}</Button>
                      <Button size="sm" variant="ghost" aria-label={tr('Ignore this line', 'تجاهل هذا السطر')} onClick={() => run(() => ignoreLine(statement.id, line.id, true), tr('Could not update', 'تعذّر التحديث'))}><EyeOff className="h-4 w-4" /></Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {posting && (
        <PostDialog
          line={posting}
          accounts={accounts.filter((a) => a.id !== statement.accountId && a.isActive !== false)}
          money={money}
          tr={tr}
          onClose={() => setPosting(null)}
          onPost={async (accountId, memo) => {
            await run(() => postLine(statement.id, posting.id, accountId, memo), tr('Could not post', 'تعذّر التسجيل'));
            setPosting(null);
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-semibold tabular-nums', tone === 'warn' && 'text-amber-700 dark:text-amber-400', tone === 'ok' && 'text-emerald-700 dark:text-emerald-400')}>{value}</p>
    </div>
  );
}

function PostDialog({ line, accounts, money, tr, onClose, onPost }: {
  line: StatementLineView; accounts: LedgerAccount[]; money: (n: number) => string; tr: Tr;
  onClose: () => void; onPost: (accountId: string, memo: string) => Promise<void>;
}) {
  // Money out is usually an expense (fees); money in usually income (interest).
  const suggested = accounts.filter((a) => (line.amount < 0 ? a.type === 'Expense' : a.type === 'Revenue'));
  const [accountId, setAccountId] = React.useState(suggested[0]?.id ?? '');
  const [memo, setMemo] = React.useState(line.description);
  const [saving, setSaving] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr('Post this line to the books', 'تسجيل هذا السطر في الدفاتر')}</DialogTitle>
          <DialogDescription>
            {tr(`${money(Math.abs(line.amount))} ${line.amount < 0 ? 'out of' : 'into'} the bank on ${line.date}. Choose what it was for.`,
              `${money(Math.abs(line.amount))} ${line.amount < 0 ? 'خرجت من' : 'دخلت إلى'} البنك في ${line.date}. اختر ما كانت له.`)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{tr('Account', 'الحساب')}</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder={tr('Choose…', 'اختر…')} /></SelectTrigger>
              <SelectContent>
                {[...suggested, ...accounts.filter((a) => !suggested.includes(a))].map((a) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="post-memo">{tr('Description', 'الوصف')}</Label>
            <Input id="post-memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
          <Button disabled={!accountId || saving} onClick={async () => { setSaving(true); try { await onPost(accountId, memo); } finally { setSaving(false); } }}>{tr('Post and match', 'تسجيل ومطابقة')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
