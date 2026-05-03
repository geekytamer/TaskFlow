'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { SectionToolbar } from '@/modules/operations/components/section-toolbar';
import { RecordSupportPanel } from '@/modules/shared/components/record-support-panel';
import type { InventoryItem } from '@/modules/operations/types';
import type { Client, SalesOrder, SalesOrderStatus } from '@/modules/finance/types';
import { createInvoiceFromSalesOrder, createSalesOrder, getClients, getInvoices, getSalesOrders, updateSalesOrderStatus } from '@/services/financeService';
import { getInventoryItems } from '@/services/operationsService';
import { FileText, PlusCircle } from 'lucide-react';

const formatDisplayDate = (value: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(value);

const interpolate = (value: string, replacements: Record<string, string | number>) =>
  Object.entries(replacements).reduce(
    (text, [key, replacement]) => text.replaceAll(`{${key}}`, String(replacement)),
    value,
  );

const statusStyles: Record<SalesOrderStatus, string> = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  Confirmed: 'bg-blue-100 text-blue-700 border-blue-200',
  Invoiced: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-red-100 text-red-700 border-red-200',
};

type SalesItemForm = {
  inventoryItemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

const emptyForm = () => ({
  clientId: '',
  orderDate: format(new Date(), 'yyyy-MM-dd'),
  expectedDate: '',
  status: 'Draft' as SalesOrderStatus,
  notes: '',
  items: [{ inventoryItemId: '', description: '', quantity: '1', unitPrice: '0' }] as SalesItemForm[],
});

export function SalesPage() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const { t, language } = useI18n();
  const { money, amount } = useCompanyCurrency();
  const [orders, setOrders] = React.useState<SalesOrder[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [invoiceIds, setInvoiceIds] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const [openCreate, setOpenCreate] = React.useState(false);
  const [selectedOrderForDocs, setSelectedOrderForDocs] = React.useState<SalesOrder | null>(null);
  const [form, setForm] = React.useState(emptyForm);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | SalesOrderStatus>('all');
  const locale = language === 'ar' ? 'ar' : 'en-US';

  const statusLabel = React.useCallback(
    (status: SalesOrderStatus) => {
      const keyByStatus: Record<SalesOrderStatus, string> = {
        Draft: 'sales.statusDraft',
        Confirmed: 'sales.statusConfirmed',
        Invoiced: 'sales.statusInvoiced',
        Cancelled: 'sales.statusCancelled',
      };
      return t(keyByStatus[status]);
    },
    [t],
  );

  const load = React.useCallback(async () => {
    if (!selectedCompany) {
      setOrders([]);
      setClients([]);
      setItems([]);
      setInvoiceIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [orderData, clientData, itemData, invoiceData] = await Promise.all([
        getSalesOrders(selectedCompany.id),
        getClients(selectedCompany.id),
        getInventoryItems(selectedCompany.id),
        getInvoices(selectedCompany.id),
      ]);
      setOrders(orderData);
      setClients(clientData);
      setItems(itemData);
      setInvoiceIds(new Set(invoiceData.map((invoice) => invoice.id)));
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('sales.unavailableTitle'),
        description: error?.message || t('sales.unavailableDescription'),
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const clientMap = React.useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const inventoryMap = React.useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const stats = React.useMemo(() => {
    const openOrders = orders.filter((order) => order.status === 'Draft' || order.status === 'Confirmed');
    return {
      openOrders: openOrders.length,
      confirmedValue: orders
        .filter((order) => order.status === 'Confirmed')
        .reduce((sum, order) => sum + order.totalAmount, 0),
      invoicedValue: orders
        .filter((order) => order.status === 'Invoiced')
        .reduce((sum, order) => sum + order.totalAmount, 0),
      cancelled: orders.filter((order) => order.status === 'Cancelled').length,
    };
  }, [orders]);

  const estimatedTotal = React.useMemo(
    () =>
      form.items.reduce(
        (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
        0,
      ),
    [form.items],
  );

  const filteredOrders = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      const clientName = clientMap.get(order.clientId)?.name || '';
      const matchesQuery =
        !query ||
        [order.orderNumber, clientName, order.notes || ''].some((value) =>
          value.toLowerCase().includes(query),
        ) ||
        order.items.some((item) =>
          [item.description, item.sku || ''].some((value) => value.toLowerCase().includes(query)),
        );
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [clientMap, orders, search, statusFilter]);

  const resetForm = () => setForm(emptyForm());

  const updateItemRow = (index: number, updates: Partial<SalesItemForm>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...updates } : item)),
    }));
  };

  const addItemRow = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { inventoryItemId: '', description: '', quantity: '1', unitPrice: '0' }],
    }));
  };

  const removeItemRow = (index: number) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, itemIndex) => itemIndex !== index) }));
  };

  const handleCreate = async () => {
    if (!selectedCompany) return;
    if (!form.clientId || !form.orderDate) {
      toast({ variant: 'destructive', title: t('sales.missingFieldsTitle'), description: t('sales.missingFieldsDescription') });
      return;
    }

    const preparedItems = form.items
      .map((item) => {
        const inventoryItem = item.inventoryItemId ? inventoryMap.get(item.inventoryItemId) : undefined;
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(item.unitPrice || inventoryItem?.salePrice || 0);
        const description = inventoryItem?.name || item.description.trim();
        if (!description || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice)) return null;
        return {
          inventoryItemId: inventoryItem?.id,
          sku: inventoryItem?.sku,
          description,
          quantity,
          unitPrice,
          lineTotal: quantity * unitPrice,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (!preparedItems.length) {
      toast({ variant: 'destructive', title: t('sales.lineItemsRequiredTitle'), description: t('sales.lineItemsRequiredDescription') });
      return;
    }

    try {
      await createSalesOrder(selectedCompany.id, {
        clientId: form.clientId,
        orderDate: new Date(form.orderDate),
        expectedDate: form.expectedDate ? new Date(form.expectedDate) : undefined,
        status: form.status,
        notes: form.notes || undefined,
        items: preparedItems,
      });
      setOpenCreate(false);
      resetForm();
      await load();
      toast({ title: t('sales.createdToast') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('sales.createFailedTitle'), description: error?.message || t('sales.createFailedDescription') });
    }
  };

  const handleStatusUpdate = async (orderId: string, status: SalesOrderStatus) => {
    try {
      await updateSalesOrderStatus(orderId, status);
      await load();
      toast({
        title: t('sales.updatedToast'),
        description: interpolate(t('sales.updatedToastDescription'), { status: statusLabel(status) }),
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('sales.updateFailedTitle'), description: error?.message || t('sales.updateFailedDescription') });
    }
  };

  const handleCreateInvoice = async (order: SalesOrder) => {
    try {
      const invoice = await createInvoiceFromSalesOrder(order.id);
      await load();
      toast({
        title: t('sales.invoiceCreatedToast'),
        description: interpolate(t('sales.invoiceCreatedDescription'), {
          invoiceNumber: invoice.invoiceNumber,
          orderNumber: order.orderNumber,
        }),
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('sales.invoiceFailedTitle'), description: error?.message || t('sales.invoiceFailedDescription') });
    }
  };

  if (!selectedCompany) {
    return (
      <SectionPageShell title={t('sales.title')} description={t('sales.emptySubtitle')}>
        <SectionEmptyState
          title={t('sales.emptyTitle')}
          description={t('sales.emptyDescription')}
        />
      </SectionPageShell>
    );
  }

  return (
    <SectionPageShell title={t('sales.title')} description={t('sales.subtitle')}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t('sales.openOrders')}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.openOrders}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t('sales.confirmedValue')}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-600">{amount(stats.confirmedValue)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t('sales.invoicedValue')}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-600">{amount(stats.invoicedValue)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t('sales.cancelled')}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">{stats.cancelled}</div></CardContent>
        </Card>
      </div>

      <SectionToolbar
        search={<Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('sales.searchPlaceholder')} className="max-w-md" />}
        filters={(
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | SalesOrderStatus)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('sales.allStatuses')}</SelectItem>
              <SelectItem value="Draft">{statusLabel('Draft')}</SelectItem>
              <SelectItem value="Confirmed">{statusLabel('Confirmed')}</SelectItem>
              <SelectItem value="Invoiced">{statusLabel('Invoiced')}</SelectItem>
              <SelectItem value="Cancelled">{statusLabel('Cancelled')}</SelectItem>
            </SelectContent>
          </Select>
        )}
        summary={interpolate(t('sales.showingSummary'), { shown: filteredOrders.length, total: orders.length })}
        actions={(
          <Dialog open={openCreate} onOpenChange={(open) => { setOpenCreate(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button disabled={!clients.length}>
                <PlusCircle className="me-2 h-4 w-4" />
                {t('sales.newOrder')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>{t('sales.createTitle')}</DialogTitle>
                <DialogDescription>{t('sales.createDescription')}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t('sales.orderNumber')}</Label>
                  <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">{t('sales.autoGenerated')}</div>
                </div>
                <div className="space-y-1">
                  <Label>{t('sales.client')}</Label>
                  <Select value={form.clientId} onValueChange={(value) => setForm((prev) => ({ ...prev, clientId: value }))}>
                    <SelectTrigger><SelectValue placeholder={t('sales.selectClient')} /></SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>{client.reference} - {client.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t('sales.orderDate')}</Label>
                  <Input type="date" value={form.orderDate} onChange={(event) => setForm((prev) => ({ ...prev, orderDate: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>{t('sales.expectedDate')}</Label>
                  <Input type="date" value={form.expectedDate} onChange={(event) => setForm((prev) => ({ ...prev, expectedDate: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>{t('sales.initialStatus')}</Label>
                  <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as SalesOrderStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Draft">{statusLabel('Draft')}</SelectItem>
                      <SelectItem value="Confirmed">{statusLabel('Confirmed')}</SelectItem>
                      <SelectItem value="Cancelled">{statusLabel('Cancelled')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t('sales.estimatedTotal')}</Label>
                  <div className="flex h-10 items-center rounded-md border px-3 text-sm">{amount(estimatedTotal)}</div>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>{t('sales.notes')}</Label>
                  <Textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder={t('sales.optionalNotes')} />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>{t('sales.items')}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItemRow}>{t('sales.addItem')}</Button>
                </div>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('sales.inventoryItem')}</TableHead>
                        <TableHead>{t('sales.description')}</TableHead>
                        <TableHead className="w-24 text-end">{t('sales.qty')}</TableHead>
                        <TableHead className="w-32 text-end">{t('sales.unitPrice')}</TableHead>
                        <TableHead className="w-20 text-end">{t('sales.remove')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {form.items.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Select
                              value={item.inventoryItemId || 'manual'}
                              onValueChange={(value) => {
                                if (value === 'manual') {
                                  updateItemRow(index, { inventoryItemId: '', description: '', unitPrice: '0' });
                                  return;
                                }
                                const inventoryItem = inventoryMap.get(value);
                                updateItemRow(index, {
                                  inventoryItemId: value,
                                  description: inventoryItem?.name || '',
                                  unitPrice: String(inventoryItem?.salePrice || 0),
                                });
                              }}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="manual">{t('sales.manualItem')}</SelectItem>
                                {items.map((inventoryItem) => (
                                  <SelectItem key={inventoryItem.id} value={inventoryItem.id}>
                                    {inventoryItem.sku} - {inventoryItem.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input value={item.description} onChange={(event) => updateItemRow(index, { description: event.target.value })} placeholder={t('sales.description')} />
                          </TableCell>
                          <TableCell>
                            <Input className="text-end" type="number" value={item.quantity} onChange={(event) => updateItemRow(index, { quantity: event.target.value })} />
                          </TableCell>
                          <TableCell>
                            <Input className="text-end" type="number" value={item.unitPrice} onChange={(event) => updateItemRow(index, { unitPrice: event.target.value })} />
                          </TableCell>
                          <TableCell className="text-end">
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeItemRow(index)} disabled={form.items.length === 1}>{t('sales.remove')}</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenCreate(false)}>{t('common.cancel')}</Button>
                <Button onClick={handleCreate}>{t('sales.createOrder')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('sales.orderHash')}</TableHead>
              <TableHead>{t('sales.client')}</TableHead>
              <TableHead>{t('sales.dates')}</TableHead>
              <TableHead>{t('sales.items')}</TableHead>
              <TableHead className="text-end">{t('sales.total')}</TableHead>
              <TableHead>{t('sales.status')}</TableHead>
              <TableHead>{t('sales.invoice')}</TableHead>
              <TableHead className="text-end">{t('sales.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">{t('sales.loadingOrders')}</TableCell></TableRow>
            )}
            {!loading && filteredOrders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">{order.orderNumber}</TableCell>
                <TableCell>{clientMap.get(order.clientId)?.name || t('sales.unknownClient')}</TableCell>
                <TableCell>
                  <div className="text-sm">{formatDisplayDate(order.orderDate, locale)}</div>
                  <div className="text-xs text-muted-foreground">
                    {order.expectedDate
                      ? interpolate(t('sales.expectedPrefix'), { date: formatDisplayDate(order.expectedDate, locale) })
                      : t('sales.noExpectedDate')}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {order.items.slice(0, 3).map((item, index) => (
                      <Badge key={`${order.id}-${index}`} variant="outline">{item.description}</Badge>
                    ))}
                    {order.items.length > 3 && <Badge variant="outline">+{order.items.length - 3}</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-end">{amount(order.totalAmount)}</TableCell>
                <TableCell>
                  <Select value={order.status} onValueChange={(value) => handleStatusUpdate(order.id, value as SalesOrderStatus)} disabled={order.status === 'Invoiced'}>
                    <SelectTrigger className="w-[145px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Draft">{statusLabel('Draft')}</SelectItem>
                      <SelectItem value="Confirmed">{statusLabel('Confirmed')}</SelectItem>
                      <SelectItem value="Cancelled">{statusLabel('Cancelled')}</SelectItem>
                      <SelectItem value="Invoiced" disabled={!order.invoiceId}>{statusLabel('Invoiced')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant="outline" className={`mt-2 block w-fit ${statusStyles[order.status]}`}>{statusLabel(order.status)}</Badge>
                </TableCell>
                <TableCell>
                  {order.invoiceId && invoiceIds.has(order.invoiceId) ? (
                    <a className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/finance">{t('sales.openInFinance')}</a>
                  ) : order.invoiceId ? (
                    <span className="text-sm text-muted-foreground">{t('sales.linked')}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">{t('sales.notInvoiced')}</span>
                  )}
                </TableCell>
                <TableCell className="text-end">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedOrderForDocs(order)}>{t('sales.docs')}</Button>
                    <Button variant="outline" size="sm" onClick={() => handleCreateInvoice(order)} disabled={order.status !== 'Confirmed' || Boolean(order.invoiceId)}>
                      <FileText className="me-2 h-4 w-4" />
                      {t('sales.createInvoice')}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && filteredOrders.length === 0 && (
              <TableRow><TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">{t('sales.noMatches')}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(selectedOrderForDocs)} onOpenChange={(open) => !open && setSelectedOrderForDocs(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('sales.supportTitle')}</DialogTitle>
            <DialogDescription>
              {interpolate(t('sales.supportDescription'), { orderNumber: selectedOrderForDocs?.orderNumber || '' })}
            </DialogDescription>
          </DialogHeader>
          {selectedOrderForDocs && (
            <RecordSupportPanel
              companyId={selectedOrderForDocs.companyId}
              entityType="sales_order"
              entityId={selectedOrderForDocs.id}
              title={t('sales.supportPanelTitle')}
            />
          )}
        </DialogContent>
      </Dialog>
    </SectionPageShell>
  );
}
