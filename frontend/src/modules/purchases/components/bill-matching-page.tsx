'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { getBillMatches, type BillMatch, type BillMatchStatus } from '@/services/operationsService';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { CheckCircle2, AlertTriangle, MinusCircle, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BillMatchingPage() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const companyId = selectedCompany?.id;

  const [matches, setMatches] = React.useState<BillMatch[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!companyId) return;
      setLoading(true);
      try { const m = await getBillMatches(companyId); if (!cancelled) setMatches(m); }
      catch { if (!cancelled) setMatches([]); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const statusMeta: Record<BillMatchStatus, { label: string; icon: React.ElementType; cls: string }> = {
    matched: { label: tr('Matched', 'مطابق'), icon: CheckCircle2, cls: 'text-emerald-600' },
    variance: { label: tr('Variance', 'اختلاف'), icon: AlertTriangle, cls: 'text-amber-600' },
    no_po: { label: tr('No PO', 'بدون أمر شراء'), icon: MinusCircle, cls: 'text-muted-foreground' },
  };

  const counts = {
    matched: matches.filter((m) => m.status === 'matched').length,
    variance: matches.filter((m) => m.status === 'variance').length,
    no_po: matches.filter((m) => m.status === 'no_po').length,
  };

  const Var = ({ v }: { v: number }) => (
    <span className={cn('tabular-nums', v < 0 ? 'text-red-600' : v > 0 ? 'text-amber-600' : 'text-muted-foreground')}>
      {v === 0 ? '—' : v > 0 ? `+${money(v)}` : money(v)}
    </span>
  );

  return (
    <SectionPageShell
      title={tr('Invoice Matching', 'مطابقة الفواتير')}
      description={tr('Three-way match: each vendor bill against its purchase order (ordered) and receipts (received).',
                      'المطابقة الثلاثية: كل فاتورة مورّد مقابل أمر الشراء (المطلوب) والاستلامات (المستلَم).')}
    >
      {loading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div><div className="text-xl font-bold tabular-nums">{counts.matched}</div><div className="text-xs text-muted-foreground">{tr('Matched', 'مطابقة')}</div></div>
            </div>
            <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div><div className="text-xl font-bold tabular-nums">{counts.variance}</div><div className="text-xs text-muted-foreground">{tr('With variance', 'باختلاف')}</div></div>
            </div>
            <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
              <MinusCircle className="h-5 w-5 text-muted-foreground" />
              <div><div className="text-xl font-bold tabular-nums">{counts.no_po}</div><div className="text-xs text-muted-foreground">{tr('No PO linked', 'بدون أمر شراء')}</div></div>
            </div>
          </div>

          {matches.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
              <Scale className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{tr('No vendor bills to match.', 'لا توجد فواتير مورّدين للمطابقة.')}</p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr('Bill', 'الفاتورة')}</TableHead>
                    <TableHead>{tr('PO', 'أمر الشراء')}</TableHead>
                    <TableHead className="text-end">{tr('Billed', 'المفوتر')}</TableHead>
                    <TableHead className="text-end">{tr('Ordered', 'المطلوب')}</TableHead>
                    <TableHead className="text-end">{tr('Received', 'المستلَم')}</TableHead>
                    <TableHead className="text-end">{tr('Price var.', 'فرق السعر')}</TableHead>
                    <TableHead className="text-end">{tr('Receipt var.', 'فرق الاستلام')}</TableHead>
                    <TableHead>{tr('Status', 'الحالة')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.map((m) => {
                    const meta = statusMeta[m.status];
                    const Icon = meta.icon;
                    return (
                      <TableRow key={m.billId}>
                        <TableCell>
                          <div className="font-medium">{m.billNumber}</div>
                          <div className="text-xs text-muted-foreground">{m.vendorName}</div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{m.orderNumber ?? '—'}</TableCell>
                        <TableCell className="text-end tabular-nums">{money(m.billedTotal)}</TableCell>
                        <TableCell className="text-end tabular-nums">{m.status === 'no_po' ? '—' : money(m.orderedTotal)}</TableCell>
                        <TableCell className="text-end tabular-nums">{m.status === 'no_po' ? '—' : money(m.receivedTotal)}</TableCell>
                        <TableCell className="text-end">{m.status === 'no_po' ? '—' : <Var v={m.priceVariance} />}</TableCell>
                        <TableCell className="text-end">{m.status === 'no_po' ? '—' : <Var v={m.receiptVariance} />}</TableCell>
                        <TableCell>
                          <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', meta.cls)}>
                            <Icon className="h-4 w-4" />{meta.label}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </SectionPageShell>
  );
}
