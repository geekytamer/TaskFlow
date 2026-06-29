'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import {
  getInventoryItems,
  getInventoryLocationBalances,
  getInventoryLots,
  getWarehouses,
} from '@/services/operationsService';
import type {
  InventoryItem,
  InventoryLocationBalance,
  InventoryLot,
  Warehouse,
} from '@/modules/operations/types';
import { ArrowLeft, Warehouse as WarehouseIcon } from 'lucide-react';
import { ExpiryBadge } from './inventory-lots-dialog';

export function WarehouseDetailPage({ warehouseId }: { warehouseId: string }) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = React.useCallback(
    (en: string, ar: string) => (language === 'ar' ? ar : en),
    [language],
  );

  const [warehouse, setWarehouse] = React.useState<Warehouse | null>(null);
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [balances, setBalances] = React.useState<InventoryLocationBalance[]>([]);
  const [lots, setLots] = React.useState<InventoryLot[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!selectedCompany) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getWarehouses(selectedCompany.id),
      getInventoryItems(selectedCompany.id),
      getInventoryLocationBalances(selectedCompany.id),
      getInventoryLots(selectedCompany.id),
    ])
      .then(([warehouseData, itemData, balanceData, lotData]) => {
        if (cancelled) return;
        setWarehouse(warehouseData.find((w) => w.id === warehouseId) ?? null);
        setItems(itemData);
        setBalances(balanceData);
        setLots(lotData);
      })
      .catch((error: any) => {
        if (!cancelled)
          toast({
            variant: 'destructive',
            title: tr('Warehouse unavailable', 'المستودع غير متاح'),
            description: error?.message,
          });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCompany, warehouseId, toast, tr]);

  const itemById = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const stock = React.useMemo(
    () =>
      balances
        .filter((b) => warehouse && b.location === warehouse.name && b.quantity !== 0)
        .sort((a, b) => b.quantity - a.quantity),
    [balances, warehouse],
  );

  const warehouseLots = React.useMemo(
    () =>
      lots
        .filter((l) => warehouse && l.location === warehouse.name && l.status === 'Active')
        .sort((a, b) => {
          const da = a.expiryDate ? a.expiryDate.getTime() : Infinity;
          const db = b.expiryDate ? b.expiryDate.getTime() : Infinity;
          return da - db;
        }),
    [lots, warehouse],
  );

  const totalQty = React.useMemo(() => stock.reduce((sum, b) => sum + b.quantity, 0), [stock]);

  const backLink = (
    <Button variant="ghost" size="sm" asChild className="gap-1">
      <Link href="/inventory">
        <ArrowLeft className="h-4 w-4" />
        {tr('Back to Inventory', 'العودة إلى المخزون')}
      </Link>
    </Button>
  );

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {backLink}
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!warehouse) {
    return (
      <div className="space-y-4 p-4">
        {backLink}
        <p className="text-sm text-muted-foreground">
          {tr('Warehouse not found.', 'المستودع غير موجود.')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {backLink}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <WarehouseIcon className="h-5 w-5 text-muted-foreground" />
            {warehouse.name}
            {warehouse.code ? (
              <span className="text-sm text-muted-foreground">({warehouse.code})</span>
            ) : null}
            {warehouse.isDefault ? (
              <Badge variant="secondary">{tr('Default', 'افتراضي')}</Badge>
            ) : null}
            {!warehouse.isActive ? (
              <Badge variant="outline">{tr('Inactive', 'غير نشط')}</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">{tr('Address', 'العنوان')}</p>
            <p className="text-sm">{warehouse.address || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{tr('Stocked SKUs', 'الأصناف المخزنة')}</p>
            <p className="text-2xl font-bold">{stock.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{tr('Total Quantity', 'إجمالي الكمية')}</p>
            <p className="text-2xl font-bold">{totalQty}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr('Stock on Hand', 'المخزون المتاح')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[55vh] overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>{tr('SKU', 'SKU')}</TableHead>
                  <TableHead>{tr('Item', 'الصنف')}</TableHead>
                  <TableHead>{tr('Category', 'الفئة')}</TableHead>
                  <TableHead className="text-end">{tr('Quantity', 'الكمية')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.map((b) => {
                  const it = itemById.get(b.inventoryItemId);
                  return (
                    <TableRow key={b.inventoryItemId}>
                      <TableCell className="font-medium">{it?.sku ?? '—'}</TableCell>
                      <TableCell>{it?.name ?? b.inventoryItemId}</TableCell>
                      <TableCell>{it?.category ?? '—'}</TableCell>
                      <TableCell className="text-end font-medium">
                        {b.quantity}
                        {it?.unit ? ` ${it.unit}` : ''}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {stock.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      {tr('No stock currently held at this warehouse.', 'لا يوجد مخزون في هذا المستودع حاليًا.')}
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
          <CardTitle>{tr('Active Lots & Batches', 'الدفعات النشطة')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[55vh] overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>{tr('Lot No.', 'رقم الدفعة')}</TableHead>
                  <TableHead>{tr('Item', 'الصنف')}</TableHead>
                  <TableHead className="text-end">{tr('Remaining', 'المتبقي')}</TableHead>
                  <TableHead>{tr('Expiry', 'الانتهاء')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warehouseLots.map((lot) => {
                  const it = itemById.get(lot.inventoryItemId);
                  return (
                    <TableRow key={lot.id}>
                      <TableCell className="font-medium">{lot.lotNumber}</TableCell>
                      <TableCell>{it ? `${it.sku} · ${it.name}` : lot.inventoryItemId}</TableCell>
                      <TableCell className="text-end">
                        {lot.quantity}
                        {it?.unit ? ` ${it.unit}` : ''}
                      </TableCell>
                      <TableCell>
                        <ExpiryBadge expiryDate={lot.expiryDate} tr={tr} />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {warehouseLots.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      {tr('No active lots at this warehouse.', 'لا توجد دفعات نشطة في هذا المستودع.')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
