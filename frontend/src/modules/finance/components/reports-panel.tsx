'use client';

import * as React from 'react';
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

const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value || 0);

const renderPrintDocument = (summary: ManagementReportSummary, companyName: string) => `
  <html>
    <head>
      <title>${companyName} Management Report</title>
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
      <h1>${companyName} Management Report</h1>
      <div class="label">Generated ${new Date().toLocaleString()}</div>
      <h2>KPIs</h2>
      <div class="grid">
        <div class="card"><div class="label">Open Receivables</div><div class="value">${money(summary.finance.openReceivables)}</div></div>
        <div class="card"><div class="label">Open Payables</div><div class="value">${money(summary.finance.openPayables)}</div></div>
        <div class="card"><div class="label">Stock Value</div><div class="value">${money(summary.inventory.stockValue)}</div></div>
        <div class="card"><div class="label">Low Stock Items</div><div class="value">${summary.inventory.lowStockCount}</div></div>
        <div class="card"><div class="label">Open Orders</div><div class="value">${summary.purchases.openOrders}</div></div>
        <div class="card"><div class="label">Unbilled PO Value</div><div class="value">${money(summary.purchases.unbilledValue)}</div></div>
      </div>
      <h2>Top Clients</h2>
      <table>
        <thead><tr><th>Client</th><th>Total Billed</th><th>Paid</th><th>Outstanding</th></tr></thead>
        <tbody>
          ${summary.topClients.map((client) => `<tr><td>${client.clientName}</td><td>${money(client.totalBilled)}</td><td>${money(client.paidAmount)}</td><td>${money(client.outstandingAmount)}</td></tr>`).join('')}
        </tbody>
      </table>
      <h2>Top Suppliers</h2>
      <table>
        <thead><tr><th>Supplier</th><th>Ordered</th><th>Open Payables</th><th>Remaining To Bill</th></tr></thead>
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
        title: 'Reports unavailable',
        description: error?.message || 'Could not load management reports.',
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
        title: 'Export failed',
        description: error?.message || 'Could not export report.',
      });
    }
  };

  const handlePrint = () => {
    if (!summary || !selectedCompany) return;
    const reportWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!reportWindow) return;
    reportWindow.document.write(renderPrintDocument(summary, selectedCompany.name));
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
          Select a company to view management reports.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => handleExport('management-kpis')}>
          <Download className="me-2 h-4 w-4" />
          Export KPIs
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExport('clients')}>
          <Download className="me-2 h-4 w-4" />
          Export Clients
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExport('suppliers')}>
          <Download className="me-2 h-4 w-4" />
          Export Suppliers
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExport('inventory-alerts')}>
          <Download className="me-2 h-4 w-4" />
          Export Inventory Alerts
        </Button>
        <Button size="sm" onClick={handlePrint}>
          <FileText className="me-2 h-4 w-4" />
          Print / Save PDF
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open Receivables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{money(summary.finance.openReceivables)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open Payables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{money(summary.finance.openPayables)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{money(summary.inventory.stockValue)}</div>
            <div className="text-xs text-muted-foreground">{summary.inventory.totalItems} active items</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{summary.inventory.lowStockCount}</div>
            <div className="text-xs text-muted-foreground">{summary.inventory.outOfStockCount} out of stock</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.purchases.openOrders}</div>
            <div className="text-xs text-muted-foreground">{summary.purchases.awaitingReceiptUnits} units awaiting receipt</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ordered Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{money(summary.purchases.orderedSpend)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Collected This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{money(summary.finance.paidThisMonth)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Unbilled PO Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{money(summary.purchases.unbilledValue)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-end">Billed</TableHead>
                    <TableHead className="text-end">Paid</TableHead>
                    <TableHead className="text-end">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.topClients.map((client) => (
                    <TableRow key={client.clientId}>
                      <TableCell className="font-medium">{client.clientName}</TableCell>
                      <TableCell className="text-end">{money(client.totalBilled)}</TableCell>
                      <TableCell className="text-end">{money(client.paidAmount)}</TableCell>
                      <TableCell className="text-end">{money(client.outstandingAmount)}</TableCell>
                    </TableRow>
                  ))}
                  {summary.topClients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">
                        No client billing data yet.
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
            <CardTitle>Top Suppliers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-end">Ordered</TableHead>
                    <TableHead className="text-end">Open Payables</TableHead>
                    <TableHead className="text-end">Remaining To Bill</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.topSuppliers.map((supplier) => (
                    <TableRow key={supplier.supplierId}>
                      <TableCell className="font-medium">{supplier.supplierName}</TableCell>
                      <TableCell className="text-end">{money(supplier.totalOrderedAmount)}</TableCell>
                      <TableCell className="text-end">{money(supplier.openPayables)}</TableCell>
                      <TableCell className="text-end">{money(supplier.remainingToBill)}</TableCell>
                    </TableRow>
                  ))}
                  {summary.topSuppliers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">
                        No supplier spend data yet.
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
            <CardTitle>Low Stock Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-end">On Hand</TableHead>
                    <TableHead className="text-end">Reorder</TableHead>
                    <TableHead>Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.lowStockItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.sku}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell className="text-end">{item.onHand}</TableCell>
                      <TableCell className="text-end">{item.reorderPoint}</TableCell>
                      <TableCell>{item.location || 'Unassigned'}</TableCell>
                    </TableRow>
                  ))}
                  {summary.lowStockItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                        No low-stock alerts right now.
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
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {summary.recentActivity.map((event) => (
                <div key={event.id} className="rounded-lg border p-3">
                  <div className="font-medium">{event.summary}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {(event.actorName || 'System')} • {event.entityType.replace('_', ' ')} • {format(event.createdAt, 'MMM d, yyyy h:mm a')}
                  </div>
                </div>
              ))}
              {summary.recentActivity.length === 0 && (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No recent activity recorded yet.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
