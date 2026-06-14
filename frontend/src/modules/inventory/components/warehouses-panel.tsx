'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, Warehouse as WarehouseIcon } from 'lucide-react';
import {
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} from '@/services/operationsService';
import type { InventoryItem, InventoryLocationBalance, Warehouse } from '@/modules/operations/types';

type FormState = {
  name: string;
  code: string;
  address: string;
  isDefault: boolean;
  isActive: boolean;
};

const emptyForm = (): FormState => ({ name: '', code: '', address: '', isDefault: false, isActive: true });

export function WarehousesPanel({
  companyId,
  warehouses,
  balances,
  items,
  onChanged,
  tr,
}: {
  companyId: string;
  warehouses: Warehouse[];
  balances: InventoryLocationBalance[];
  items: InventoryItem[];
  onChanged: () => void | Promise<void>;
  tr: (en: string, ar: string) => string;
}) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Warehouse | null>(null);
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const itemById = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // Stocked line items per warehouse name.
  const stockByWarehouse = React.useMemo(() => {
    const map = new Map<string, InventoryLocationBalance[]>();
    for (const b of balances) {
      if (b.quantity === 0) continue;
      const arr = map.get(b.location) || [];
      arr.push(b);
      map.set(b.location, arr);
    }
    return map;
  }, [balances]);

  // SKU count + total quantity per warehouse name, from current balances.
  const summary = React.useMemo(() => {
    const map = new Map<string, { skus: number; qty: number }>();
    for (const b of balances) {
      const entry = map.get(b.location) || { skus: 0, qty: 0 };
      entry.skus += b.quantity !== 0 ? 1 : 0;
      entry.qty += b.quantity;
      map.set(b.location, entry);
    }
    return map;
  }, [balances]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (warehouse: Warehouse) => {
    setEditing(warehouse);
    setForm({
      name: warehouse.name,
      code: warehouse.code ?? '',
      address: warehouse.address ?? '',
      isDefault: warehouse.isDefault,
      isActive: warehouse.isActive,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ variant: 'destructive', title: tr('Name is required', 'الاسم مطلوب') });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        address: form.address.trim() || undefined,
        isDefault: form.isDefault,
        isActive: form.isActive,
      };
      if (editing) {
        await updateWarehouse(editing.id, payload);
      } else {
        await createWarehouse(companyId, payload);
      }
      setDialogOpen(false);
      await onChanged();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Could not save warehouse', 'تعذر حفظ المستودع'),
        description: error?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (warehouse: Warehouse) => {
    if (!window.confirm(tr(`Delete warehouse "${warehouse.name}"?`, `حذف المستودع «${warehouse.name}»؟`))) return;
    try {
      await deleteWarehouse(warehouse.id);
      await onChanged();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Could not delete warehouse', 'تعذر حذف المستودع'),
        description: error?.message,
      });
    }
  };

  return (
    <Card data-tutorial="inventory-warehouses">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <WarehouseIcon className="h-4 w-4 text-muted-foreground" />
          {tr('Warehouses', 'المستودعات')}
        </CardTitle>
        <Button size="sm" onClick={openCreate} className="gap-1">
          <Plus className="h-4 w-4" />
          {tr('Add warehouse', 'إضافة مستودع')}
        </Button>
      </CardHeader>
      <CardContent>
        {warehouses.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {tr(
              'No warehouses yet. Add one to start tracking stock by location.',
              'لا توجد مستودعات بعد. أضف مستودعًا لتتبع المخزون حسب الموقع.',
            )}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('Name', 'الاسم')}</TableHead>
                <TableHead>{tr('Address', 'العنوان')}</TableHead>
                <TableHead className="text-end">{tr('SKUs', 'الأصناف')}</TableHead>
                <TableHead className="text-end">{tr('Total Qty', 'إجمالي الكمية')}</TableHead>
                <TableHead className="text-end">{tr('Actions', 'إجراءات')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouses.map((w) => {
                const s = summary.get(w.name) || { skus: 0, qty: 0 };
                const stock = stockByWarehouse.get(w.name) || [];
                const isOpen = expanded === w.id;
                return (
                  <React.Fragment key={w.id}>
                    <TableRow className={w.isActive ? '' : 'opacity-60'}>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="text-muted-foreground disabled:opacity-30"
                            onClick={() => setExpanded(isOpen ? null : w.id)}
                            disabled={stock.length === 0}
                            aria-label={isOpen ? tr('Collapse', 'طي') : tr('Expand', 'توسيع')}
                          >
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                          <span className="font-medium">{w.name}</span>
                          {w.code ? <span className="text-xs text-muted-foreground">({w.code})</span> : null}
                          {w.isDefault ? <Badge variant="secondary">{tr('Default', 'افتراضي')}</Badge> : null}
                          {!w.isActive ? <Badge variant="outline">{tr('Inactive', 'غير نشط')}</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{w.address || '—'}</TableCell>
                      <TableCell className="text-end">{s.skus}</TableCell>
                      <TableCell className="text-end font-medium">{s.qty}</TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(w)} aria-label={tr('Edit', 'تعديل')}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => remove(w)}
                            aria-label={tr('Delete', 'حذف')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isOpen && stock.length > 0 ? (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={5} className="p-0">
                          <div className="px-10 py-2">
                            {stock.map((b) => {
                              const it = itemById.get(b.inventoryItemId);
                              return (
                                <div key={b.inventoryItemId} className="flex items-center justify-between border-b py-1 text-sm last:border-b-0">
                                  <span>
                                    {it?.name ?? b.inventoryItemId}
                                    {it?.sku ? <span className="ms-2 text-xs text-muted-foreground">{it.sku}</span> : null}
                                  </span>
                                  <span className="font-medium">{b.quantity}{it?.unit ? ` ${it.unit}` : ''}</span>
                                </div>
                              );
                            })}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? tr('Edit warehouse', 'تعديل المستودع') : tr('Add warehouse', 'إضافة مستودع')}
            </DialogTitle>
            <DialogDescription>
              {tr('Warehouses are the locations stock is stored, issued, and transferred between.', 'المستودعات هي المواقع التي يُخزَّن فيها المخزون ويُصرف ويُحوَّل بينها.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>{tr('Name', 'الاسم')}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder={tr('e.g. Main Warehouse', 'مثال: المستودع الرئيسي')}
              />
              {editing ? (
                <p className="text-[11px] text-muted-foreground">
                  {tr('Renaming moves existing stock at this location to the new name.', 'تغيير الاسم ينقل المخزون الحالي في هذا الموقع إلى الاسم الجديد.')}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{tr('Code', 'الرمز')}</Label>
                <Input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} placeholder={tr('Optional', 'اختياري')} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{tr('Address', 'العنوان')}</Label>
              <Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder={tr('Optional', 'اختياري')} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{tr('Default warehouse', 'المستودع الافتراضي')}</p>
                <p className="text-xs text-muted-foreground">{tr('Pre-selected for new stock.', 'محدد مسبقًا للمخزون الجديد.')}</p>
              </div>
              <Switch checked={form.isDefault} onCheckedChange={(v) => setForm((p) => ({ ...p, isDefault: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{tr('Active', 'نشط')}</p>
                <p className="text-xs text-muted-foreground">{tr('Inactive warehouses can’t receive new stock.', 'المستودعات غير النشطة لا يمكنها استقبال مخزون جديد.')}</p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tr('Cancel', 'إلغاء')}
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? tr('Saving…', 'جارٍ الحفظ…') : tr('Save', 'حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
