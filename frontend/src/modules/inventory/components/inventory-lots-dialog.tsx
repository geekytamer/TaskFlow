'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getCurrentLocale } from '@/lib/locale';
import { getInventoryLots, receiveInventoryLot } from '@/services/operationsService';
import type { InventoryItem, InventoryLot, Supplier } from '@/modules/operations/types';

type Tr = (en: string, ar: string) => string;

/** Days-to-expiry and a colour tone, shared by the dialog and the expiry panel. */
export function lotExpiryInfo(expiryDate?: Date): {
  days: number | null;
  tone: 'expired' | 'critical' | 'warning' | 'ok' | 'none';
} {
  if (!expiryDate) return { days: null, tone: 'none' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(expiryDate);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { days, tone: 'expired' };
  if (days <= 7) return { days, tone: 'critical' };
  if (days <= 30) return { days, tone: 'warning' };
  return { days, tone: 'ok' };
}

const TONE_CLASS: Record<string, string> = {
  expired: 'bg-red-100 text-red-700 border-red-200',
  critical: 'bg-red-100 text-red-700 border-red-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  ok: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  none: 'bg-muted text-muted-foreground',
};

export function ExpiryBadge({ expiryDate, tr }: { expiryDate?: Date; tr: Tr }) {
  const { days, tone } = lotExpiryInfo(expiryDate);
  if (!expiryDate || days === null) {
    return <span className="text-muted-foreground">{tr('No expiry', 'بدون انتهاء')}</span>;
  }
  const date = expiryDate.toLocaleDateString(getCurrentLocale());
  const label =
    tone === 'expired'
      ? tr(`Expired (${Math.abs(days)}d ago)`, `منتهٍ (منذ ${Math.abs(days)} يوم)`)
      : tr(`${days}d left`, `${days} يوم متبقٍ`);
  return (
    <div className="flex flex-col gap-1">
      <span>{date}</span>
      <Badge variant="outline" className={`w-fit ${TONE_CLASS[tone]}`}>
        {label}
      </Badge>
    </div>
  );
}

function LocationSelect({
  value,
  onChange,
  options,
  tr,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  tr: Tr;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={tr('Select a warehouse', 'اختر مستودعًا')} />
      </SelectTrigger>
      <SelectContent>
        {options.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {tr('No warehouses yet', 'لا توجد مستودعات بعد')}
          </div>
        ) : (
          options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

type ReceiveForm = {
  lotNumber: string;
  quantity: string;
  location: string;
  unitCost: string;
  expiryDate: string;
  manufactureDate: string;
  supplierId: string;
  note: string;
};

export function InventoryLotsDialog({
  item,
  companyId,
  locationOptions,
  defaultWarehouseName,
  suppliers,
  amount,
  canManage,
  tr,
  onClose,
  onChanged,
}: {
  item: InventoryItem | null;
  companyId: string;
  locationOptions: string[];
  defaultWarehouseName: string;
  suppliers: Supplier[];
  amount: (value: number) => React.ReactNode;
  canManage: boolean;
  tr: Tr;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [lots, setLots] = React.useState<InventoryLot[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const emptyForm = React.useCallback(
    (): ReceiveForm => ({
      lotNumber: '',
      quantity: '',
      location: item?.location || defaultWarehouseName || '',
      unitCost: item ? String(item.unitCost) : '',
      expiryDate: '',
      manufactureDate: '',
      supplierId: item?.preferredSupplierId || '',
      note: '',
    }),
    [item, defaultWarehouseName],
  );
  const [form, setForm] = React.useState<ReceiveForm>(emptyForm);

  const reload = React.useCallback(async () => {
    if (!item) return;
    setLoading(true);
    try {
      setLots(await getInventoryLots(companyId, item.id));
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Could not load lots', 'تعذر تحميل الدفعات'),
        description: error?.message,
      });
    } finally {
      setLoading(false);
    }
  }, [companyId, item, toast, tr]);

  React.useEffect(() => {
    if (item) {
      setForm(emptyForm());
      reload();
    } else {
      setLots([]);
    }
  }, [item, emptyForm, reload]);

  const activeTotal = React.useMemo(
    () => lots.filter((l) => l.status === 'Active').reduce((sum, l) => sum + l.quantity, 0),
    [lots],
  );

  const handleReceive = async () => {
    if (!item) return;
    if (!form.lotNumber.trim() || !form.quantity || Number(form.quantity) <= 0) {
      toast({
        variant: 'destructive',
        title: tr('Missing required fields', 'حقول مطلوبة مفقودة'),
        description: tr('Lot number and a positive quantity are required.', 'رقم الدفعة وكمية موجبة مطلوبة.'),
      });
      return;
    }
    setSaving(true);
    try {
      await receiveInventoryLot(companyId, item.id, {
        lotNumber: form.lotNumber.trim(),
        quantity: Number(form.quantity),
        location: form.location || undefined,
        unitCost: form.unitCost ? Number(form.unitCost) : undefined,
        expiryDate: form.expiryDate || undefined,
        manufactureDate: form.manufactureDate || undefined,
        supplierId: form.supplierId || undefined,
        note: form.note || undefined,
      });
      setForm(emptyForm());
      await reload();
      onChanged();
      toast({ title: tr('Lot received', 'تم استلام الدفعة') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Could not receive lot', 'تعذر استلام الدفعة'),
        description: error?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {tr('Lots & Batches', 'الدفعات')} — {item?.sku} · {item?.name}
          </DialogTitle>
          <DialogDescription>
            {tr(
              'Receive batches with expiry dates. Stock is consumed first-expiry-first-out (FEFO).',
              'استلم الدفعات مع تواريخ الانتهاء. يُصرف المخزون حسب الأقرب انتهاءً أولًا (FEFO).',
            )}
          </DialogDescription>
        </DialogHeader>

        {canManage && (
          <div className="rounded-lg border p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>{tr('Lot / Batch No.', 'رقم الدفعة')}</Label>
                <Input
                  value={form.lotNumber}
                  onChange={(e) => setForm((p) => ({ ...p, lotNumber: e.target.value }))}
                  placeholder={tr('e.g. LOT-2026-001', 'مثال: LOT-2026-001')}
                />
              </div>
              <div className="space-y-1">
                <Label>{tr('Quantity', 'الكمية')}</Label>
                <Input
                  type="number"
                  value={form.quantity}
                  onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{tr('Warehouse', 'المستودع')}</Label>
                <LocationSelect
                  value={form.location}
                  onChange={(v) => setForm((p) => ({ ...p, location: v }))}
                  options={locationOptions}
                  tr={tr}
                />
              </div>
              <div className="space-y-1">
                <Label>{tr('Expiry Date', 'تاريخ الانتهاء')}</Label>
                <Input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm((p) => ({ ...p, expiryDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{tr('Manufacture Date', 'تاريخ الإنتاج')}</Label>
                <Input
                  type="date"
                  value={form.manufactureDate}
                  onChange={(e) => setForm((p) => ({ ...p, manufactureDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{tr('Unit Cost', 'تكلفة الوحدة')}</Label>
                <Input
                  type="number"
                  value={form.unitCost}
                  onChange={(e) => setForm((p) => ({ ...p, unitCost: e.target.value }))}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>{tr('Supplier (optional)', 'المورد (اختياري)')}</Label>
                <Select
                  value={form.supplierId || '__none__'}
                  onValueChange={(v) => setForm((p) => ({ ...p, supplierId: v === '__none__' ? '' : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tr('No supplier', 'بدون مورد')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{tr('No supplier', 'بدون مورد')}</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{tr('Note', 'ملاحظة')}</Label>
                <Input
                  value={form.note}
                  onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={handleReceive} disabled={saving}>
                {tr('Receive Lot', 'استلام الدفعة')}
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {tr('Active lot stock', 'مخزون الدفعات النشطة')}: {activeTotal} {item?.unit}
          </span>
        </div>

        <div className="max-h-[40vh] overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('Lot No.', 'رقم الدفعة')}</TableHead>
                <TableHead>{tr('Warehouse', 'المستودع')}</TableHead>
                <TableHead className="text-end">{tr('Remaining', 'المتبقي')}</TableHead>
                <TableHead>{tr('Expiry', 'الانتهاء')}</TableHead>
                <TableHead className="text-end">{tr('Unit Cost', 'تكلفة الوحدة')}</TableHead>
                <TableHead>{tr('Status', 'الحالة')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-16" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!loading &&
                lots.map((lot) => (
                  <TableRow key={lot.id} className={lot.status !== 'Active' ? 'opacity-60' : undefined}>
                    <TableCell className="font-medium">{lot.lotNumber}</TableCell>
                    <TableCell>{lot.location}</TableCell>
                    <TableCell className="text-end">
                      {lot.quantity}
                      <span className="text-muted-foreground"> / {lot.initialQuantity}</span>
                    </TableCell>
                    <TableCell>
                      <ExpiryBadge expiryDate={lot.expiryDate} tr={tr} />
                    </TableCell>
                    <TableCell className="text-end">{amount(lot.unitCost)}</TableCell>
                    <TableCell>{lot.status}</TableCell>
                  </TableRow>
                ))}
              {!loading && lots.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                    {tr('No lots received yet for this item.', 'لم يتم استلام دفعات لهذا الصنف بعد.')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
