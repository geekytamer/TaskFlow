'use client';

import { Combobox } from '@/components/ui/combobox';
import { allNames, displayName } from '@/lib/display-name';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useI18n } from '@/context/i18n-context';
import { formatCurrency, useCompanyCurrency } from '@/lib/currency';
import type { SalesOrderLineItem } from '@/modules/finance/types';
import type { InventoryItem } from '@/modules/operations/types';

export type SalesItemForm = {
  inventoryItemId: string;
  /** Kept from a saved line, so an item archived since still round-trips. */
  sku?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  discountType: 'percent' | 'amount';
  /** The picked item's name in each language; cleared when the description is typed over. */
  descriptionAr?: string;
  descriptionEn?: string;
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

/** What the form's lines cost before discounts, how much came off, and what is left. */
export const formDiscountTotals = (rows: SalesItemForm[]) => {
  const r2 = (n: number) => Number(n.toFixed(2));
  const gross = rows.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  const net = formItemsTotal(rows);
  return { gross: r2(gross), discount: r2(Math.max(0, gross - net)), net: r2(net) };
};

/** Turns saved lines back into editable rows. */
export const itemsToForm = (items: SalesOrderLineItem[]): SalesItemForm[] =>
  items.length
    ? items.map((item) => ({
        inventoryItemId: item.inventoryItemId || '',
        sku: item.sku,
        description: item.description,
        descriptionAr: item.descriptionAr,
        descriptionEn: item.descriptionEn,
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
        // An item archived since the line was saved is not in the map; keep its link.
        inventoryItemId: inventoryItem?.id ?? (item.inventoryItemId || undefined),
        sku: inventoryItem?.sku ?? item.sku,
        description,
        descriptionAr: item.descriptionAr || undefined,
        descriptionEn: item.descriptionEn || undefined,
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
  currencyCode,
  onSaveAsService,
  documentLanguage,
}: {
  rows: SalesItemForm[];
  onChange: (rows: SalesItemForm[]) => void;
  inventory: InventoryItem[];
  /** Offered on a typed line: keep it in the price list for next time. */
  onSaveAsService?: (index: number) => void;
  /** The currency of the company the document is in; default the selected company's. */
  currencyCode?: string;
  /** The document's language: a picked item's name is shown in it. Default the interface language. */
  documentLanguage?: 'ar' | 'en';
}) {
  const { t, language } = useI18n();
  const { money: companyMoney } = useCompanyCurrency();
  const money = (value: number) => (currencyCode ? formatCurrency(value, currencyCode) : companyMoney(value));
  const inventoryMap = React.useMemo(() => new Map(inventory.map((item) => [item.id, item])), [inventory]);
  const docLanguage = documentLanguage ?? (language === 'ar' ? 'ar' : 'en');
  // Search finds an item by either name or its code; it is listed in the document's language.
  const pickerOptions = React.useMemo(() => inventory.map((inventoryItem) => ({
    value: inventoryItem.id,
    label: `${inventoryItem.sku} - ${displayName(inventoryItem, docLanguage)}`,
    keywords: allNames(inventoryItem),
  })), [inventory, docLanguage]);
  // A line picked from an item follows the document's language when it changes.
  React.useEffect(() => {
    const next = rows.map((row) => {
      if (!row.descriptionAr && !row.descriptionEn) return row;
      const wanted = displayName({ nameAr: row.descriptionAr, nameEn: row.descriptionEn }, docLanguage);
      return wanted && wanted !== row.description ? { ...row, description: wanted } : row;
    });
    if (next.some((row, i) => row !== rows[i])) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docLanguage]);
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
                  <Combobox
                    className="min-w-[11rem]"
                    value={item.inventoryItemId}
                    placeholder={t('sales.manualItem')}
                    clearLabel={t('sales.manualItem')}
                    searchPlaceholder={language === 'ar' ? 'ابحث بالاسم أو الرمز…' : 'Search by name or code…'}
                    emptyText={language === 'ar' ? 'لا توجد نتائج' : 'No results'}
                    options={pickerOptions}
                    onValueChange={(value) => {
                      if (!value) {
                        update(index, { inventoryItemId: '', description: '', descriptionAr: undefined, descriptionEn: undefined, unitPrice: '0' });
                        return;
                      }
                      const inventoryItem = inventoryMap.get(value);
                      update(index, {
                        inventoryItemId: value,
                        sku: inventoryItem?.sku,
                        description: displayName(inventoryItem, docLanguage),
                        descriptionAr: inventoryItem?.nameAr,
                        descriptionEn: inventoryItem?.nameEn,
                        unitPrice: String(inventoryItem?.salePrice || 0),
                      });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input dir="auto" className="min-w-[10rem]" value={item.description} onChange={(event) => update(index, { description: event.target.value, descriptionAr: undefined, descriptionEn: undefined })} placeholder={t('sales.description')} />
                  {onSaveAsService && !item.inventoryItemId && item.description.trim() && (
                    <button
                      type="button"
                      className="mt-1 text-xs text-primary hover:underline"
                      onClick={() => onSaveAsService(index)}
                    >
                      {language === 'ar' ? '+ احفظها كخدمة' : '+ Save as a service'}
                    </button>
                  )}
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
