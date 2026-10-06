'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import {
  getVatPreview, getVatReturns, fileVatReturn, deleteVatReturn,
} from '@/services/financeService';
import type { VatBreakdown, VatReturn, VatReturnPreview } from '@/modules/finance/types';
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
          {tr('VAT owed comes from the ledger; sales and purchases come from your invoices and bills, by VAT treatment (Oman standard rate 5%).',
              'الضريبة المستحقة من الدفاتر؛ والمبيعات والمشتريات من فواتيرك وفواتير الموردين حسب المعاملة الضريبية (النسبة القياسية في عُمان 5%).')}
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
          {preview.breakdown && <VatBreakdownView b={preview.breakdown} tr={tr} />}
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

/** Where the figures come from: the period's invoices and bills by VAT treatment, and any gap with the ledger. */
function VatBreakdownView({ b, tr }: { b: VatBreakdown; tr: (en: string, ar: string) => string }) {
  const row = (label: string, value: number, vat?: number) => (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{money(value)}{vat !== undefined && <span className="ms-2 text-xs text-muted-foreground">{tr('VAT', 'ضريبة')} {money(vat)}</span>}</span>
    </div>
  );
  const gap = Math.abs(b.outputVatGap) >= 0.005 || Math.abs(b.inputVatGap) >= 0.005;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border p-3">
        <p className="mb-1 text-sm font-semibold">{tr('Sales in the period (invoices less credit notes)', 'مبيعات الفترة (الفواتير ناقص الإشعارات الدائنة)')}</p>
        {row(tr('Standard-rated', 'خاضعة للنسبة القياسية'), b.sales.standard, b.salesVat)}
        {row(tr('Zero-rated', 'خاضعة لنسبة صفرية'), b.sales.zero)}
        {row(tr('Exempt', 'معفاة'), b.sales.exempt)}
        {row(tr('Out of scope', 'خارج النطاق'), b.sales.out_of_scope)}
      </div>
      <div className="rounded-lg border p-3">
        <p className="mb-1 text-sm font-semibold">{tr('Purchases in the period (approved bills)', 'مشتريات الفترة (فواتير الموردين المعتمدة)')}</p>
        {row(tr('Standard-rated', 'خاضعة للنسبة القياسية'), b.purchases.standard, b.purchasesVat)}
        {row(tr('Zero-rated', 'خاضعة لنسبة صفرية'), b.purchases.zero)}
        {row(tr('Exempt', 'معفاة'), b.purchases.exempt)}
        {row(tr('Out of scope', 'خارج النطاق'), b.purchases.out_of_scope)}
        {b.purchases.unstated > 0 && row(tr('No VAT stated', 'دون ضريبة محددة'), b.purchases.unstated)}
      </div>
      {gap && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 md:col-span-2 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          {tr(`The ledger has ${money(b.outputVatGap)} output VAT and ${money(b.inputVatGap)} input VAT that no invoice or bill explains (manual entries). They are included above at the standard rate; check them before filing.`,
            `في الدفاتر ${money(b.outputVatGap)} ضريبة مخرجات و${money(b.inputVatGap)} ضريبة مدخلات لا تفسرها أي فاتورة (قيود يدوية). أُدرجت أعلاه بالنسبة القياسية؛ راجعها قبل التقديم.`)}
        </p>
      )}
    </div>
  );
}
