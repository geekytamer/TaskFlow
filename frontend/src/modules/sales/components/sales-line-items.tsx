'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useI18n } from '@/context/i18n-context';
import { useCompanyCurrency } from '@/lib/currency';
import type { SalesOrderLineItem } from '@/modules/finance/types';
import type { InventoryItem } from '@/modules/operations/types';

export type SalesItemForm = {
  inventoryItemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  discountType: 'percent' | 'amount';
};

export const emptyItemRow = (): SalesItemForm => ({
  inventoryItemId: '', description: '', quantity: '1', unitPrice: '0', discount: '0', discountType: 'percent',
});

/** Net line total after applying a percent or fixed-amount discount. */
export const lineNet = (quantity: number, unitPrice: number, discount: number, discountType: 'percent' | 'amount') => {
  const gross = quantity * unitPrice;
  if (!discount || discount <= 0) return gross;
  const off = discountType === 'percent' ? gross * (Math.min(discount, 100) / 100) : Math.min(discount, gross);
  return Math.max(0, gross - off);
};

export const formItemsTotal = (rows: SalesItemForm[]) =>
  rows.reduce((sum, item) => sum + lineNet(Number(item.quantity || 0), Number(item.unitPrice || 0), Number(item.discount || 0), item.discountType), 0);

/** Turns saved lines back into editable rows. */
export const itemsToForm = (items: SalesOrderLineItem[]): SalesItemForm[] =>
  items.length
    ? items.map((item) => ({
        inventoryItemId: item.inventoryItemId || '',
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
        discount: String(item.discount ?? 0),
        discountType: item.discountType === 'amount' ? 'amount' : 'percent',
      }))
    : [emptyItemRow()];

/** Validated lines ready for the API; rows without a description or quantity are dropped. */
export const prepareItems = (rows: SalesItemForm[], inventoryMap: Map<string, InventoryItem>): SalesOrderLineItem[] =>
  rows
    .map((item) => {
      const inventoryItem = item.inventoryItemId ? inventoryMap.get(item.inventoryItemId) : undefined;
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || inventoryItem?.salePrice || 0);
      const discount = Number(item.discount || 0);
      const description = item.description.trim() || inventoryItem?.name || '';
      if (!description || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice)) return null;
      return {
        inventoryItemId: inventoryItem?.id,
        sku: inventoryItem?.sku,
        description,
        quantity,
        unitPrice,
        discount: discount > 0 ? discount : undefined,
        discountType: discount > 0 ? item.discountType : undefined,
        lineTotal: lineNet(quantity, unitPrice, discount, item.discountType),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

/** The editable lines table shared by sales orders and quotations. */
export function SalesLineItemsEditor({
  rows,
  onChange,
  inventory,
}: {
  rows: SalesItemForm[];
  onChange: (rows: SalesItemForm[]) => void;
  inventory: InventoryItem[];
}) {
  const { t } = useI18n();
  const { money } = useCompanyCurrency();
  const inventoryMap = React.useMemo(() => new Map(inventory.map((item) => [item.id, item])), [inventory]);
  const update = (index: number, updates: Partial<SalesItemForm>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...updates } : row)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label data-tutorial="sales-form-items">{t('sales.items')}</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, emptyItemRow()])}>{t('sales.addItem')}</Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('sales.inventoryItem')}</TableHead>
              <TableHead>{t('sales.description')}</TableHead>
              <TableHead className="w-20 text-end">{t('sales.qty')}</TableHead>
              <TableHead className="w-28 text-end">{t('sales.unitPrice')}</TableHead>
              <TableHead className="w-36 text-end">{t('sales.discount', 'Discount')}</TableHead>
              <TableHead className="w-28 text-end">{t('sales.lineTotal', 'Total')}</TableHead>
              <TableHead className="w-16 text-end">{t('sales.remove')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((item, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Select
                    value={item.inventoryItemId || 'manual'}
                    onValueChange={(value) => {
                      if (value === 'manual') {
                        update(index, { inventoryItemId: '', description: '', unitPrice: '0' });
                        return;
                      }
                      const inventoryItem = inventoryMap.get(value);
                      update(index, {
                        inventoryItemId: value,
                        description: inventoryItem?.name || '',
                        unitPrice: String(inventoryItem?.salePrice || 0),
                      });
                    }}
                  >
                    <SelectTrigger className="min-w-[9rem]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">{t('sales.manualItem')}</SelectItem>
                      {inventory.map((inventoryItem) => (
                        <SelectItem key={inventoryItem.id} value={inventoryItem.id}>
                          {inventoryItem.sku} - {inventoryItem.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input dir="auto" className="min-w-[10rem]" value={item.description} onChange={(event) => update(index, { description: event.target.value })} placeholder={t('sales.description')} />
                </TableCell>
                <TableCell>
                  <Input className="min-w-[4.5rem] text-end" type="number" min="0" value={item.quantity} onChange={(event) => update(index, { quantity: event.target.value })} />
                </TableCell>
                <TableCell>
                  <Input className="min-w-[6.5rem] text-end" type="number" min="0" value={item.unitPrice} onChange={(event) => update(index, { unitPrice: event.target.value })} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Input className="min-w-[4.5rem] text-end" type="number" min="0" value={item.discount} onChange={(event) => update(index, { discount: event.target.value })} />
                    <Select value={item.discountType} onValueChange={(value) => update(index, { discountType: value as 'percent' | 'amount' })}>
                      <SelectTrigger className="w-16 px-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">%</SelectItem>
                        <SelectItem value="amount">{t('sales.fixed', 'Fixed')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
                <TableCell className="text-end font-medium">
                  {money(lineNet(Number(item.quantity || 0), Number(item.unitPrice || 0), Number(item.discount || 0), item.discountType))}
                </TableCell>
                <TableCell className="text-end">
                  <Button type="button" variant="ghost" size="sm" onClick={() => onChange(rows.filter((_, i) => i !== index))} disabled={rows.length === 1}>{t('sales.remove')}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
