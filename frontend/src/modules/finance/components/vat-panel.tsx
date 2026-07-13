'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import {
  getVatPreview, getVatReturns, fileVatReturn, deleteVatReturn,
} from '@/services/financeService';
import type { VatReturn, VatReturnPreview } from '@/modules/finance/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Trash2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function quarterDefaults() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const start = new Date(Date.UTC(now.getFullYear(), q * 3, 1));
  const end = new Date(Date.UTC(now.getFullYear(), q * 3 + 3, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end) };
}

export function VatPanel() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const companyId = selectedCompany?.id;

  const def = React.useMemo(quarterDefaults, []);
  const [from, setFrom] = React.useState(def.from);
  const [to, setTo] = React.useState(def.to);
  const [preview, setPreview] = React.useState<VatReturnPreview | null>(null);
  const [computing, setComputing] = React.useState(false);
  const [filing, setFiling] = React.useState(false);
  const [returns, setReturns] = React.useState<VatReturn[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadReturns = React.useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try { setReturns(await getVatReturns(companyId)); }
    catch { setReturns([]); }
    finally { setLoading(false); }
  }, [companyId]);

  React.useEffect(() => { loadReturns(); }, [loadReturns]);

  const compute = async () => {
    if (!companyId) return;
    setComputing(true);
    try { setPreview(await getVatPreview(companyId, from, to)); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
    finally { setComputing(false); }
  };

  const file = async () => {
    if (!companyId) return;
    setFiling(true);
    try {
      await fileVatReturn(companyId, from, to);
      toast({ title: tr('VAT return filed', 'تم تقديم إقرار الضريبة') });
      setPreview(null);
      loadReturns();
    } catch (e: any) {
      toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message });
    } finally { setFiling(false); }
  };

  const remove = async (id: string) => {
    try { await deleteVatReturn(id); loadReturns(); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
  };

  const Stat = ({ label, value, accent }: { label: string; value: number; accent?: string }) => (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-bold tabular-nums', accent)}>{money(value)}</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-lg font-semibold">{tr('VAT return', 'إقرار ضريبة القيمة المضافة')}</h3>
        <p className="text-sm text-muted-foreground">
          {tr('Compute output and input VAT for a period from posted ledger entries (Oman standard rate 5%).',
              'احتساب ضريبة المخرجات والمدخلات لفترة من قيود دفتر الأستاذ (المعدل القياسي في عُمان 5%).')}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="grid gap-1.5">
          <Label className="text-xs">{tr('From', 'من')}</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">{tr('To', 'إلى')}</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
        </div>
        <Button onClick={compute} disabled={computing}>{computing ? tr('Computing…', 'جارٍ الحساب…') : tr('Compute', 'احتساب')}</Button>
      </div>

      {preview && (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label={tr('Taxable sales', 'المبيعات الخاضعة')} value={preview.taxableSales} />
            <Stat label={tr('Output VAT', 'ضريبة المخرجات')} value={preview.outputVat} />
            <Stat label={tr('Taxable purchases', 'المشتريات الخاضعة')} value={preview.taxablePurchases} />
            <Stat label={tr('Input VAT', 'ضريبة المدخلات')} value={preview.inputVat} />
            <Stat label={tr('Net VAT payable', 'صافي الضريبة المستحقة')} value={preview.netVat}
                  accent={preview.netVat >= 0 ? 'text-red-600' : 'text-emerald-600'} />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={file} disabled={filing}>
              <FileText className="me-2 h-4 w-4" />{filing ? tr('Filing…', 'جارٍ التقديم…') : tr('File this return', 'تقديم الإقرار')}
            </Button>
            <p className="text-xs text-muted-foreground">
              {tr('Net VAT = output − input. A positive value is payable to the tax authority.',
                  'صافي الضريبة = المخرجات − المدخلات. القيمة الموجبة مستحقة للجهة الضريبية.')}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold text-muted-foreground">{tr('Filed returns', 'الإقرارات المقدَّمة')}</h4>
        {loading ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : returns.length === 0 ? (
          <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            {tr('No VAT returns filed yet.', 'لم يتم تقديم أي إقرارات بعد.')}
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr('Period', 'الفترة')}</TableHead>
                  <TableHead className="text-end">{tr('Output VAT', 'المخرجات')}</TableHead>
                  <TableHead className="text-end">{tr('Input VAT', 'المدخلات')}</TableHead>
                  <TableHead className="text-end">{tr('Net VAT', 'الصافي')}</TableHead>
                  <TableHead className="text-end">{tr('Actions', 'إجراءات')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">
                      {r.periodStart.slice(0, 10)} → {r.periodEnd.slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{money(r.outputVat)}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(r.inputVat)}</TableCell>
                    <TableCell className="text-end tabular-nums font-medium">{money(r.netVat)}</TableCell>
                    <TableCell className="text-end">
                      <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {tr('Input VAT is drawn from the Recoverable VAT account; it populates once purchase tax is posted there.',
            'ضريبة المدخلات مأخوذة من حساب الضريبة القابلة للاسترداد؛ وتظهر عند ترحيل ضريبة المشتريات إليه.')}
      </p>
    </div>
  );
}
