'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { InventoryItem, InventoryLot } from '@/modules/operations/types';
import { ExpiryBadge, lotExpiryInfo } from './inventory-lots-dialog';

type Tr = (en: string, ar: string) => string;

/** Company-wide view of lots expiring within the horizon (or already expired). */
export function ExpiringLotsPanel({
  lots,
  items,
  tr,
}: {
  lots: InventoryLot[];
  items: InventoryItem[];
  tr: Tr;
}) {
  const itemMap = React.useMemo(() => {
    const map = new Map<string, InventoryItem>();
    items.forEach((item) => map.set(item.id, item));
    return map;
  }, [items]);

  // Earliest expiry first; expired lots float to the top.
  const sorted = React.useMemo(
    () =>
      [...lots].sort((a, b) => {
        const da = a.expiryDate ? a.expiryDate.getTime() : Infinity;
        const db = b.expiryDate ? b.expiryDate.getTime() : Infinity;
        return da - db;
      }),
    [lots],
  );

  if (sorted.length === 0) return null;

  const expiredCount = sorted.filter((l) => lotExpiryInfo(l.expiryDate).tone === 'expired').length;

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="text-amber-700">
          {tr('Expiring Soon', 'قرب الانتهاء')}
          {' · '}
          {tr(`${sorted.length} lot(s) within 30 days`, `${sorted.length} دفعة خلال 30 يومًا`)}
          {expiredCount > 0
            ? tr(`, ${expiredCount} expired`, `، ${expiredCount} منتهية`)
            : ''}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-[50vh] overflow-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead>{tr('Item', 'الصنف')}</TableHead>
                <TableHead>{tr('Lot No.', 'رقم الدفعة')}</TableHead>
                <TableHead>{tr('Warehouse', 'المستودع')}</TableHead>
                <TableHead className="text-end">{tr('Remaining', 'المتبقي')}</TableHead>
                <TableHead>{tr('Expiry', 'الانتهاء')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((lot) => {
                const item = itemMap.get(lot.inventoryItemId);
                return (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium">
                      {item ? `${item.sku} · ${item.name}` : lot.inventoryItemId}
                    </TableCell>
                    <TableCell>{lot.lotNumber}</TableCell>
                    <TableCell>{lot.location}</TableCell>
                    <TableCell className="text-end">
                      {lot.quantity} {item?.unit}
                    </TableCell>
                    <TableCell>
                      <ExpiryBadge expiryDate={lot.expiryDate} tr={tr} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
