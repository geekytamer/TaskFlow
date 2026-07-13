'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  getPayrollRuns, createPayrollRun, deletePayrollRun, downloadWps,
  type PayrollRun,
} from '@/services/hrService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Plus, Trash2, Download, ChevronRight, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function RunCard({ run, onDelete }: { run: PayrollRun; onDelete: (id: string) => void }) {
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [open, setOpen] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);

  const download = async () => {
    setDownloading(true);
    try { await downloadWps(run.id, run.period); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
    finally { setDownloading(false); }
  };

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CollapsibleTrigger className="flex items-center gap-3 text-start">
            <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-90')} />
            <div>
              <CardTitle className="text-base">{run.period}</CardTitle>
              <CardDescription>
                {run.payslips.length} {tr('employees', 'موظف')} · {tr('Net', 'الصافي')} {money(run.totalNet)}
              </CardDescription>
            </div>
          </CollapsibleTrigger>
          <div className="flex items-center gap-2">
            <Badge variant={run.status === 'paid' ? 'default' : 'secondary'}>{run.status}</Badge>
            <Button variant="outline" size="sm" onClick={download} disabled={downloading}>
              <Download className="me-2 h-4 w-4" />{tr('WPS', 'ملف حماية الأجور')}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(run.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr('Employee', 'الموظف')}</TableHead>
                    <TableHead className="text-end">{tr('Basic', 'الأساسي')}</TableHead>
                    <TableHead className="text-end">{tr('Allowances', 'البدلات')}</TableHead>
                    <TableHead className="text-end">{tr('Deductions', 'الاستقطاعات')}</TableHead>
                    <TableHead className="text-end">{tr('Net', 'الصافي')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {run.payslips.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.employeeName}</TableCell>
                      <TableCell className="text-end tabular-nums">{money(p.basic)}</TableCell>
                      <TableCell className="text-end tabular-nums">{money(p.allowances)}</TableCell>
                      <TableCell className="text-end tabular-nums">{money(p.deductions)}</TableCell>
                      <TableCell className="text-end tabular-nums font-semibold">{money(p.net)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function PayrollPage() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const confirm = useConfirm();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const companyId = selectedCompany?.id;

  const [runs, setRuns] = React.useState<PayrollRun[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [period, setPeriod] = React.useState(() => new Date().toISOString().slice(0, 7));
  const [running, setRunning] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try { setRuns(await getPayrollRuns(companyId)); }
    catch { setRuns([]); }
    finally { setLoading(false); }
  }, [companyId]);

  React.useEffect(() => { load(); }, [load]);

  const run = async () => {
    if (!companyId) return;
    setRunning(true);
    try {
      await createPayrollRun(companyId, period);
      toast({ title: tr('Payroll run created', 'تم إنشاء مسير الرواتب') });
      load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message || tr('Could not run payroll.', 'تعذر تشغيل مسير الرواتب.') });
    } finally { setRunning(false); }
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: tr('Delete payroll run?', 'حذف مسير الرواتب؟'),
      description: tr('This removes the run and its payslips.', 'سيؤدي هذا إلى حذف المسير وقسائم الرواتب.'),
      confirmText: tr('Delete', 'حذف'),
    });
    if (!ok) return;
    try { await deletePayrollRun(id); load(); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">{tr('Payroll', 'الرواتب')}</h1>
        <p className="text-muted-foreground mt-1">
          {tr('Generate monthly payroll from employee salaries and export the WPS file.',
              'أنشئ مسير الرواتب الشهري من رواتب الموظفين وصدّر ملف حماية الأجور (WPS).')}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="grid gap-1.5">
          <Label className="text-xs">{tr('Pay period', 'فترة الدفع')}</Label>
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-48" />
        </div>
        <Button onClick={run} disabled={running}>
          <Plus className="me-2 h-4 w-4" />{running ? tr('Running…', 'جارٍ التشغيل…') : tr('Run payroll', 'تشغيل مسير الرواتب')}
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <Wallet className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {tr('No payroll runs yet. Add salaries to employees, then run payroll.',
                'لا توجد مسيرات رواتب بعد. أضف الرواتب للموظفين ثم شغّل المسير.')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {runs.map((r) => <RunCard key={r.id} run={r} onDelete={remove} />)}
        </div>
      )}
    </div>
  );
}
