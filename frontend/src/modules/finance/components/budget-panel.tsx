'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import {
  getBudgets,
  getBudgetVariance,
  getLedgerAccounts,
  createBudget,
  deleteBudget,
} from '@/services/financeService';
import type { Budget, BudgetVarianceReport, LedgerAccount } from '@/modules/finance/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter,
} from '@/components/ui/sheet';
import { Plus, Trash2, ArrowLeft, PieChart } from 'lucide-react';
import { cn } from '@/lib/utils';

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* -------------------------------------------------------------- */
/* Create sheet                                                   */
/* -------------------------------------------------------------- */

function CreateBudgetSheet({
  accounts, onCreated,
}: {
  accounts: LedgerAccount[];
  onCreated: () => void;
}) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [lines, setLines] = React.useState<{ accountId: string; amount: string }[]>([
    { accountId: '', amount: '' },
  ]);
  const [saving, setSaving] = React.useState(false);

  const reset = () => {
    setName(''); setYear(new Date().getFullYear());
    setLines([{ accountId: '', amount: '' }]);
  };

  const submit = async () => {
    if (!selectedCompany) return;
    const clean = lines
      .filter((l) => l.accountId && Number(l.amount) > 0)
      .map((l) => ({ accountId: l.accountId, amount: Number(l.amount) }));
    if (!name.trim() || clean.length === 0) {
      toast({ variant: 'destructive', title: tr('Missing details', 'تفاصيل ناقصة'),
        description: tr('Add a name and at least one budgeted account.', 'أضف اسماً وحساباً واحداً على الأقل.') });
      return;
    }
    setSaving(true);
    try {
      await createBudget(selectedCompany.id, { name: name.trim(), fiscalYear: year, status: 'active', lines: clean });
      toast({ title: tr('Budget created', 'تم إنشاء الميزانية') });
      setOpen(false); reset(); onCreated();
    } catch (e: any) {
      toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message || tr('Could not create budget.', 'تعذر إنشاء الميزانية.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button><Plus className="me-2 h-4 w-4" />{tr('New budget', 'ميزانية جديدة')}</Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader><SheetTitle>{tr('New budget', 'ميزانية جديدة')}</SheetTitle></SheetHeader>
        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-4">
          <div className="grid gap-2">
            <Label>{tr('Name', 'الاسم')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('e.g. Operating Budget', 'مثال: الميزانية التشغيلية')} />
          </div>
          <div className="grid gap-2">
            <Label>{tr('Fiscal year', 'السنة المالية')}</Label>
            <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-40" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{tr('Budgeted accounts', 'الحسابات المُدرجة')}</Label>
            {lines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={line.accountId} onValueChange={(v) => setLines((p) => p.map((l, j) => j === i ? { ...l, accountId: v } : l))}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder={tr('Account', 'الحساب')} /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" className="w-32" placeholder="0.00" value={line.amount}
                  onChange={(e) => setLines((p) => p.map((l, j) => j === i ? { ...l, amount: e.target.value } : l))} />
                <Button variant="ghost" size="icon" onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                  disabled={lines.length === 1}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="self-start" onClick={() => setLines((p) => [...p, { accountId: '', amount: '' }])}>
              <Plus className="me-2 h-3.5 w-3.5" />{tr('Add line', 'إضافة سطر')}
            </Button>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={submit} disabled={saving}>{saving ? tr('Saving…', 'جارٍ الحفظ…') : tr('Create budget', 'إنشاء الميزانية')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------------------------------------- */
/* Variance detail                                                */
/* -------------------------------------------------------------- */

function VarianceView({ report, onBack }: { report: BudgetVarianceReport; onBack: () => void }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const overBudgetExpense = (l: BudgetVarianceReport['lines'][number]) =>
    l.accountType === 'Expense' && l.variance < 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="me-2 h-4 w-4" />{tr('Back', 'رجوع')}</Button>
        <div>
          <h3 className="text-lg font-semibold">{report.name}</h3>
          <p className="text-sm text-muted-foreground">{tr('Fiscal year', 'السنة المالية')} {report.fiscalYear}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">{tr('Budgeted', 'المُدرج')}</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{money(report.totalBudget)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">{tr('Actual', 'الفعلي')}</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{money(report.totalActual)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">{tr('Variance', 'الفرق')}</p>
          <p className={cn('mt-1 text-xl font-bold tabular-nums', report.totalVariance < 0 ? 'text-red-600' : 'text-emerald-600')}>
            {money(report.totalVariance)}
          </p>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('Account', 'الحساب')}</TableHead>
              <TableHead className="text-end">{tr('Budget', 'الميزانية')}</TableHead>
              <TableHead className="text-end">{tr('Actual', 'الفعلي')}</TableHead>
              <TableHead className="text-end">{tr('Variance', 'الفرق')}</TableHead>
              <TableHead className="w-[160px]">{tr('Utilization', 'الاستهلاك')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.lines.map((l) => (
              <TableRow key={l.accountId}>
                <TableCell>
                  <div className="font-medium">{l.accountName}</div>
                  <div className="text-xs text-muted-foreground">{l.accountCode} · {l.accountType}</div>
                </TableCell>
                <TableCell className="text-end tabular-nums">{money(l.budget)}</TableCell>
                <TableCell className="text-end tabular-nums">{money(l.actual)}</TableCell>
                <TableCell className={cn('text-end tabular-nums font-medium', overBudgetExpense(l) ? 'text-red-600' : 'text-foreground')}>
                  {money(l.variance)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={Math.min(l.utilization, 100)} className={cn('h-1.5', l.utilization > 100 && '[&>div]:bg-red-500')} />
                    <span className="text-xs tabular-nums w-10 text-end">{l.utilization}%</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        {tr(
          'Actuals are the net posted movement on each account within the fiscal year.',
          'القيم الفعلية هي صافي الحركة المُرحّلة على كل حساب خلال السنة المالية.',
        )}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- */
/* Main panel                                                     */
/* -------------------------------------------------------------- */

export function BudgetPanel() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const companyId = selectedCompany?.id;

  const [budgets, setBudgets] = React.useState<Budget[]>([]);
  const [accounts, setAccounts] = React.useState<LedgerAccount[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [report, setReport] = React.useState<BudgetVarianceReport | null>(null);

  const load = React.useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [b, a] = await Promise.all([getBudgets(companyId), getLedgerAccounts(companyId)]);
      setBudgets(b);
      setAccounts(a.filter((x) => x.isActive !== false));
    } catch {
      setBudgets([]); setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  React.useEffect(() => { load(); }, [load]);

  const openReport = async (id: string) => {
    try {
      setReport(await getBudgetVariance(id));
    } catch (e: any) {
      toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message });
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteBudget(id);
      toast({ title: tr('Budget deleted', 'تم حذف الميزانية') });
      load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message });
    }
  };

  if (loading) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (report) return <VarianceView report={report} onBack={() => setReport(null)} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{tr('Budgets', 'الميزانيات')}</h3>
          <p className="text-sm text-muted-foreground">
            {tr('Set annual budgets per account and track spend against actuals.', 'حدّد ميزانيات سنوية لكل حساب وتابع الإنفاق مقابل الفعلي.')}
          </p>
        </div>
        <CreateBudgetSheet accounts={accounts} onCreated={load} />
      </div>

      {budgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <PieChart className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{tr('No budgets yet.', 'لا توجد ميزانيات بعد.')}</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('Budget', 'الميزانية')}</TableHead>
                <TableHead>{tr('Fiscal year', 'السنة المالية')}</TableHead>
                <TableHead>{tr('Accounts', 'الحسابات')}</TableHead>
                <TableHead>{tr('Status', 'الحالة')}</TableHead>
                <TableHead className="text-end">{tr('Actions', 'إجراءات')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgets.map((b) => (
                <TableRow key={b.id} className="cursor-pointer" onClick={() => openReport(b.id)}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="tabular-nums">{b.fiscalYear}</TableCell>
                  <TableCell>{b.lines.length}</TableCell>
                  <TableCell><Badge variant={b.status === 'active' ? 'default' : 'secondary'}>{b.status}</Badge></TableCell>
                  <TableCell className="text-end" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => openReport(b.id)}>{tr('View variance', 'عرض الفرق')}</Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(b.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
