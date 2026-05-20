'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import {
  getFinanceAging,
  getFinanceOverview,
  getInvoices,
  getPurchaseOrderPayables,
  getSupplierPayables,
  getVendorBills,
} from '@/services/financeService';
import type {
  AgingBucket,
  FinanceOverview,
  PurchaseOrderPayableSummary,
  SupplierPayablesSummary,
} from '@/modules/finance/types';
import { Download } from 'lucide-react';
import { downloadCsv } from '@/modules/finance/lib/csv';
import Link from 'next/link';
import { useI18n } from '@/context/i18n-context';

const KpiCardLink: React.FC<
  React.PropsWithChildren<{ href?: string; tutorial?: string }>
> = ({ href, tutorial, children }) => {
  const cardClass =
    'h-full transition hover:border-primary/50 hover:shadow-sm focus-within:ring-2 focus-within:ring-primary/40';
  if (!href) {
    return (
      <Card data-tutorial={tutorial} className={cardClass}>
        {children}
      </Card>
    );
  }
  return (
    <Link href={href} className="block focus:outline-none">
      <Card data-tutorial={tutorial} className={cardClass + ' cursor-pointer'}>
        {children}
      </Card>
    </Link>
  );
};

const bucketLabelKey: Record<AgingBucket['bucket'], string> = {
  current: 'financeOverview.bucketCurrent',
  '1_30': 'financeOverview.bucket1_30',
  '31_60': 'financeOverview.bucket31_60',
  '61_90': 'financeOverview.bucket61_90',
  over_90: 'financeOverview.bucketOver90',
};

export function FinanceOverviewPanel() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const { t } = useI18n();
  const { money, amount } = useCompanyCurrency();
  const bucketLabel = (bucket: AgingBucket['bucket']) => t(bucketLabelKey[bucket]);
  const [overview, setOverview] = React.useState<FinanceOverview | null>(null);
  const [receivablesAging, setReceivablesAging] = React.useState<AgingBucket[]>([]);
  const [payablesAging, setPayablesAging] = React.useState<AgingBucket[]>([]);
  const [asOf, setAsOf] = React.useState<Date | null>(null);
  const [invoiceCount, setInvoiceCount] = React.useState(0);
  const [billCount, setBillCount] = React.useState(0);
  const [purchasePayables, setPurchasePayables] = React.useState<PurchaseOrderPayableSummary[]>([]);
  const [supplierPayables, setSupplierPayables] = React.useState<SupplierPayablesSummary[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!selectedCompany) {
      setOverview(null);
      setReceivablesAging([]);
      setPayablesAging([]);
      setAsOf(null);
      setInvoiceCount(0);
      setBillCount(0);
      setPurchasePayables([]);
      setSupplierPayables([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [overviewData, agingData, invoices, bills, purchaseData, supplierData] = await Promise.all([
        getFinanceOverview(selectedCompany.id),
        getFinanceAging(selectedCompany.id),
        getInvoices(selectedCompany.id),
        getVendorBills(selectedCompany.id),
        getPurchaseOrderPayables(selectedCompany.id),
        getSupplierPayables(selectedCompany.id),
      ]);
      setOverview(overviewData);
      setReceivablesAging(agingData.receivables || []);
      setPayablesAging(agingData.payables || []);
      setAsOf(agingData.asOf ? new Date(agingData.asOf) : new Date());
      setInvoiceCount(invoices.length);
      setBillCount(bills.length);
      setPurchasePayables(purchaseData);
      setSupplierPayables(supplierData);
    } catch (error: any) {
      setOverview(null);
      setReceivablesAging([]);
      setPayablesAging([]);
      setAsOf(null);
      setInvoiceCount(0);
      setBillCount(0);
      setPurchasePayables([]);
      setSupplierPayables([]);
      toast({
        variant: 'destructive',
        title: t('financeOverview.toastUnavailableTitle'),
        description: error?.message || t('financeOverview.toastUnavailableDesc'),
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading) {
      return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!selectedCompany) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          {t('financeOverview.selectCompany')}
        </CardContent>
      </Card>
    );
  }

  const receivablesByBucket = new Map(receivablesAging.map((bucket) => [bucket.bucket, bucket.amount]));
  const payablesByBucket = new Map(payablesAging.map((bucket) => [bucket.bucket, bucket.amount]));
  const allBuckets: AgingBucket['bucket'][] = ['current', '1_30', '31_60', '61_90', 'over_90'];
  const unbilledPurchaseValue = purchasePayables.reduce(
    (sum, summary) => sum + summary.remainingToBill,
    0,
  );
  const suppliersWithOpenPayables = supplierPayables.filter((summary) => summary.openPayables > 0).length;
  const bucketRows = allBuckets.map((bucket) => ({
    bucket,
    receivables: receivablesByBucket.get(bucket) || 0,
    payables: payablesByBucket.get(bucket) || 0,
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7" data-tutorial="finance-metrics-grid">
        <KpiCardLink href="/finance?tab=invoices" tutorial="finance-metric-receivables">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('financeOverview.openReceivables')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{amount(overview?.openReceivables || 0)}</div>
          </CardContent>
        </KpiCardLink>
        <KpiCardLink href="/finance?tab=payables" tutorial="finance-metric-payables">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('financeOverview.openPayables')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{amount(overview?.openPayables || 0)}</div>
          </CardContent>
        </KpiCardLink>
        <KpiCardLink href="/finance?tab=invoices" tutorial="finance-metric-billed">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('financeOverview.billedThisMonth')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{amount(overview?.billedThisMonth || 0)}</div>
          </CardContent>
        </KpiCardLink>
        <KpiCardLink href="/finance?tab=invoices" tutorial="finance-metric-collected">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('financeOverview.collectedThisMonth')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{amount(overview?.paidThisMonth || 0)}</div>
          </CardContent>
        </KpiCardLink>
        <KpiCardLink href="/finance?tab=payables" tutorial="finance-metric-paid-payables">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('financeOverview.paidPayablesThisMonth')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{amount(overview?.paidPayablesThisMonth || 0)}</div>
          </CardContent>
        </KpiCardLink>
        <KpiCardLink href="/finance?tab=expenses">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('financeOverview.expenseReceipts')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{amount(overview?.expenseReceiptsThisMonth || 0)}</div>
          </CardContent>
        </KpiCardLink>
        <KpiCardLink href="/purchases">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('financeOverview.unbilledPos')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{amount(unbilledPurchaseValue)}</div>
            <div className="text-xs text-muted-foreground">
              {t('financeOverview.suppliersOpenPayables').replace('{count}', String(suppliersWithOpenPayables))}
            </div>
          </CardContent>
        </KpiCardLink>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t('financeOverview.agingSummary')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {asOf ? t('financeOverview.agingAsOf').replace('{date}', format(asOf, 'MMM d, yyyy')) : t('financeOverview.agingAsOfToday')}.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                `finance-aging-${format(new Date(), 'yyyy-MM-dd')}.csv`,
                ['bucket', 'receivables', 'payables'],
                bucketRows.map((row) => [bucketLabel(row.bucket), row.receivables, row.payables]),
              )
            }
          >
            <Download className="me-2 h-4 w-4" />
            {t('financeOverview.exportCsv')}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3 text-sm">
              <p className="text-muted-foreground">Open customer invoices</p>
              <p className="text-xl font-semibold">{invoiceCount}</p>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p className="text-muted-foreground">Open vendor bills</p>
              <p className="text-xl font-semibold">{billCount}</p>
            </div>
          </div>
          <div className="rounded-md border" data-tutorial="finance-aging-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bucket</TableHead>
                  <TableHead className="text-end">Receivables</TableHead>
                  <TableHead className="text-end">Payables</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bucketRows.map((row) => (
                  <TableRow key={row.bucket}>
                    <TableCell>{bucketLabel(row.bucket)}</TableCell>
                    <TableCell className="text-end">{amount(row.receivables)}</TableCell>
                    <TableCell className="text-end">{amount(row.payables)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
