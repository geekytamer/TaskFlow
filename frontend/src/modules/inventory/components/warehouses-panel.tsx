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
import { useRouter } from 'next/navigation';
import { ChevronRight, Pencil, Plus, Trash2, Warehouse as WarehouseIcon } from 'lucide-react';
import {
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} from '@/services/operationsService';
import type { InventoryLocationBalance, Warehouse } from '@/modules/operations/types';

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
  onChanged,
  tr,
}: {
  companyId: string;
  warehouses: Warehouse[];
  balances: InventoryLocationBalance[];
  onChanged: () => void | Promise<void>;
  tr: (en: string, ar: string) => string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Warehouse | null>(null);
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [saving, setSaving] = React.useState(false);

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
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
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
                  const goToDetail = () => router.push(`/inventory/warehouses/${w.id}`);
                  return (
                    <TableRow
                      key={w.id}
                      className={`cursor-pointer ${w.isActive ? '' : 'opacity-60'}`}
                      onClick={goToDetail}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') goToDetail();
                      }}
                    >
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEdit(w);
                            }}
                            aria-label={tr('Edit', 'تعديل')}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              remove(w);
                            }}
                            aria-label={tr('Delete', 'حذف')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
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
