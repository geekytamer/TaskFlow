'use client';

import * as React from 'react';
import { getCurrentLocale } from '@/lib/locale';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { downloadReportExport, getManagementReportSummary } from '@/services/financeService';
import type { ManagementReportSummary } from '@/modules/finance/types';
import { Download, FileText } from 'lucide-react';
import { useCompanyCurrency } from '@/lib/currency';
import { useI18n } from '@/context/i18n-context';

const renderPrintDocument = (
  summary: ManagementReportSummary,
  companyName: string,
  money: (value: number) => string,
  tr: (en: string, ar: string) => string,
) => `
  <html>
    <head>
      <title>${companyName} ${tr('Management Report', 'تقرير إداري')}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
        h1, h2 { margin: 0 0 12px; }
        h2 { margin-top: 24px; font-size: 18px; }
        .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .card { border: 1px solid #ddd; border-radius: 8px; padding: 12px; }
        .label { color: #666; font-size: 12px; }
        .value { font-size: 22px; font-weight: bold; margin-top: 6px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
        th { background: #f4f4f4; }
      </style>
    </head>
    <body>
      <h1>${companyName} ${tr('Management Report', 'تقرير إداري')}</h1>
      <div class="label">${tr('Generated', 'تم الإنشاء')} ${new Date().toLocaleString(getCurrentLocale())}</div>
      <h2>${tr('KPIs', 'مؤشرات الأداء')}</h2>
      <div class="grid">
        <div class="card"><div class="label">${tr('Open Receivables', 'الذمم المدينة المفتوحة')}</div><div class="value">${money(summary.finance.openReceivables)}</div></div>
        <div class="card"><div class="label">${tr('Open Payables', 'الذمم الدائنة المفتوحة')}</div><div class="value">${money(summary.finance.openPayables)}</div></div>
        <div class="card"><div class="label">${tr('Paid Payables This Month', 'الذمم الدائنة المدفوعة هذا الشهر')}</div><div class="value">${money(summary.finance.paidPayablesThisMonth)}</div></div>
        <div class="card"><div class="label">${tr('Stock Value', 'قيمة المخزون')}</div><div class="value">${money(summary.inventory.stockValue)}</div></div>
        <div class="card"><div class="label">${tr('Low Stock Items', 'أصناف منخفضة المخزون')}</div><div class="value">${summary.inventory.lowStockCount}</div></div>
        <div class="card"><div class="label">${tr('Open Orders', 'الطلبات المفتوحة')}</div><div class="value">${summary.purchases.openOrders}</div></div>
        <div class="card"><div class="label">${tr('Unbilled PO Value', 'قيمة أوامر الشراء غير المفوترة')}</div><div class="value">${money(summary.purchases.unbilledValue)}</div></div>
      </div>
      <h2>${tr('Top Clients', 'أهم العملاء')}</h2>
      <table>
        <thead><tr><th>${tr('Client', 'العميل')}</th><th>${tr('Total Billed', 'إجمالي المفوتر')}</th><th>${tr('Paid', 'المدفوع')}</th><th>${tr('Outstanding', 'المستحق')}</th></tr></thead>
        <tbody>
          ${summary.topClients.map((client) => `<tr><td>${client.clientName}</td><td>${money(client.totalBilled)}</td><td>${money(client.paidAmount)}</td><td>${money(client.outstandingAmount)}</td></tr>`).join('')}
        </tbody>
      </table>
      <h2>${tr('Top Suppliers', 'أهم الموردين')}</h2>
      <table>
        <thead><tr><th>${tr('Supplier', 'المورّد')}</th><th>${tr('Ordered', 'المطلوب')}</th><th>${tr('Open Payables', 'الذمم الدائنة المفتوحة')}</th><th>${tr('Remaining To Bill', 'المتبقي للفوترة')}</th></tr></thead>
        <tbody>
          ${summary.topSuppliers.map((supplier) => `<tr><td>${supplier.supplierName}</td><td>${money(supplier.totalOrderedAmount)}</td><td>${money(supplier.openPayables)}</td><td>${money(supplier.remainingToBill)}</td></tr>`).join('')}
        </tbody>
      </table>
    </body>
  </html>
`;

export function ReportsPanel() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const { t, language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { money, amount } = useCompanyCurrency();
  const [summary, setSummary] = React.useState<ManagementReportSummary | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!selectedCompany) {
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getManagementReportSummary(selectedCompany.id);
      setSummary(data);
    } catch (error: any) {
      setSummary(null);
      toast({
        variant: 'destructive',
        title: t('accountActivity.toastUnavailableTitle'),
        description: error?.message || t('accountActivity.toastUnavailableDesc'),
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleExport = async (
    dataset: 'management-kpis' | 'clients' | 'suppliers' | 'inventory-alerts',
  ) => {
    if (!selectedCompany) return;
    try {
      await downloadReportExport(selectedCompany.id, dataset);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('accountActivity.toastExportFailedTitle'),
        description: error?.message || t('accountActivity.toastExportFailedDesc'),
      });
    }
  };

  const handlePrint = () => {
    if (!summary || !selectedCompany) return;
    const reportWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!reportWindow) return;
    reportWindow.document.write(renderPrintDocument(summary, selectedCompany.name, money, tr));
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!selectedCompany || !summary) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          {t('accountActivity.selectCompany')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => handleExport('management-kpis')}>
          <Download className="me-2 h-4 w-4" />
          {t('accountActivity.exportKpis')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExport('clients')}>
          <Download className="me-2 h-4 w-4" />
          {t('accountActivity.exportClients')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExport('suppliers')}>
          <Download className="me-2 h-4 w-4" />
          {t('accountActivity.exportSuppliers')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExport('inventory-alerts')}>
          <Download className="me-2 h-4 w-4" />
          {t('accountActivity.exportInventoryAlerts')}
        </Button>
        <Button size="sm" onClick={handlePrint}>
          <FileText className="me-2 h-4 w-4" />
          {t('accountActivity.printSavePdf')}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('accountActivity.openReceivables')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{amount(summary.finance.openReceivables)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('accountActivity.openPayables')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{amount(summary.finance.openPayables)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('accountActivity.inventoryValue')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{amount(summary.inventory.stockValue)}</div>
            <div className="text-xs text-muted-foreground">{t('accountActivity.activeItems').replace('{count}', String(summary.inventory.totalItems))}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('accountActivity.lowStockAlerts')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{summary.inventory.lowStockCount}</div>
            <div className="text-xs text-muted-foreground">{t('accountActivity.outOfStock').replace('{count}', String(summary.inventory.outOfStockCount))}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('accountActivity.openOrders')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.purchases.openOrders}</div>
            <div className="text-xs text-muted-foreground">{t('accountActivity.awaitingReceipt').replace('{count}', String(summary.purchases.awaitingReceiptUnits))}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('accountActivity.orderedSpend')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{amount(summary.purchases.orderedSpend)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('accountActivity.collectedThisMonth')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{amount(summary.finance.paidThisMonth)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('accountActivity.paidPayablesThisMonth')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{amount(summary.finance.paidPayablesThisMonth)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('accountActivity.unbilledPoValue')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{amount(summary.purchases.unbilledValue)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('accountActivity.topClients')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('accountActivity.colClient')}</TableHead>
                    <TableHead className="text-end">{t('accountActivity.colBilled')}</TableHead>
                    <TableHead className="text-end">{t('accountActivity.colPaid')}</TableHead>
                    <TableHead className="text-end">{t('accountActivity.colOutstanding')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.topClients.map((client) => (
                    <TableRow key={client.clientId}>
                      <TableCell className="font-medium">{client.clientName}</TableCell>
                      <TableCell className="text-end">{amount(client.totalBilled)}</TableCell>
                      <TableCell className="text-end">{amount(client.paidAmount)}</TableCell>
                      <TableCell className="text-end">{amount(client.outstandingAmount)}</TableCell>
                    </TableRow>
                  ))}
                  {summary.topClients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">
                        {t('accountActivity.noClientData')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('accountActivity.topSuppliers')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('accountActivity.colSupplier')}</TableHead>
                    <TableHead className="text-end">{t('accountActivity.colOrdered')}</TableHead>
                    <TableHead className="text-end">{t('accountActivity.colOpenPayables')}</TableHead>
                    <TableHead className="text-end">{t('accountActivity.colRemainingToBill')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.topSuppliers.map((supplier) => (
                    <TableRow key={supplier.supplierId}>
                      <TableCell className="font-medium">{supplier.supplierName}</TableCell>
                      <TableCell className="text-end">{amount(supplier.totalOrderedAmount)}</TableCell>
                      <TableCell className="text-end">{amount(supplier.openPayables)}</TableCell>
                      <TableCell className="text-end">{amount(supplier.remainingToBill)}</TableCell>
                    </TableRow>
                  ))}
                  {summary.topSuppliers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">
                        {t('accountActivity.noSupplierData')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t('accountActivity.lowStockTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('accountActivity.colSku')}</TableHead>
                    <TableHead>{t('accountActivity.colItem')}</TableHead>
                    <TableHead className="text-end">{t('accountActivity.colOnHand')}</TableHead>
                    <TableHead className="text-end">{t('accountActivity.colReorder')}</TableHead>
                    <TableHead>{t('accountActivity.colLocation')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.lowStockItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.sku}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell className="text-end">{item.onHand}</TableCell>
                      <TableCell className="text-end">{item.reorderPoint}</TableCell>
                      <TableCell>{item.location || t('accountActivity.unassigned')}</TableCell>
                    </TableRow>
                  ))}
                  {summary.lowStockItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                        {t('accountActivity.noLowStock')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('accountActivity.recentActivityTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {summary.recentActivity.map((event) => (
                <div key={event.id} className="rounded-lg border p-3">
                  <div className="font-medium">{event.summary}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {(event.actorName || t('accountActivity.system'))} • {event.entityType.replace('_', ' ')} • {format(event.createdAt, 'MMM d, yyyy h:mm a')}
                  </div>
                </div>
              ))}
              {summary.recentActivity.length === 0 && (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  {t('accountActivity.noRecentActivity')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
