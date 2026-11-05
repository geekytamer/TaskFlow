'use client';

import * as React from 'react';
import { Pencil, PlusCircle, Tags, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { usePermissions } from '@/context/permissions-context';
import { useToast } from '@/hooks/use-toast';
import { CurrencyAmount } from '@/lib/currency';
import type { InventoryItem } from '@/modules/operations/types';
import { createService, deleteService, getServices, updateService } from '@/services/servicesService';

/** Sales → Services & prices: the company's price list of non-stock items. */
export function ServicesPanel() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { can } = usePermissions();
  const { toast } = useToast();
  const confirm = useConfirm();
  const companyId = selectedCompany?.id ?? '';
  const canCreate = can('sales.create');
  const canEdit = can('sales.edit');
  const canDelete = can('sales.delete');

  const [services, setServices] = React.useState<InventoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState('');
  const [editing, setEditing] = React.useState<InventoryItem | 'new' | null>(null);

  const load = React.useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setServices(await getServices(companyId));
    } catch (error: any) {
      setServices([]);
      toast({ variant: 'destructive', title: tr('Services could not be loaded', 'تعذّر تحميل الخدمات'), description: error?.message });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, toast]);

  React.useEffect(() => { load(); }, [load]);

  const remove = async (service: InventoryItem) => {
    const ok = await confirm({
      title: tr('Remove this service?', 'حذف هذه الخدمة؟'),
      description: tr('Quotations and invoices that already use it keep it.', 'العروض والفواتير اللي تستخدمها تبقى كما هي.'),
      confirmText: tr('Remove', 'حذف'),
    });
    if (!ok) return;
    try {
      await deleteService(service.id);
      load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not remove the service', 'تعذّر حذف الخدمة'), description: error?.message });
    }
  };

  const q = query.trim().toLowerCase();
  const shown = q ? services.filter((s) => s.name.toLowerCase().includes(q)) : services;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tr('Search services', 'ابحث في الخدمات')}
          className="max-w-xs"
          dir="auto"
          aria-label={tr('Search services', 'ابحث في الخدمات')}
        />
        <div className="flex-1" />
        {canCreate && (
          <Button onClick={() => setEditing('new')}>
            <PlusCircle className="me-2 h-4 w-4" aria-hidden />
            {tr('New service', 'خدمة جديدة')}
          </Button>
        )}
      </div>

      {loading && !services.length ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : !services.length ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Tags className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{tr('No services yet', 'لا توجد خدمات بعد')}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {tr(
              'Add what you sell with its price — a reels package, a monthly plan, a design. It then fills quotations and invoices in one click.',
              'أضف ما تبيعه بسعره — باقة ريلز، اشتراك شهري، تصميم. بعدها يتعبّى في عروض الأسعار والفواتير بضغطة.',
            )}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('Service', 'الخدمة')}</TableHead>
                <TableHead>{tr('Unit', 'الوحدة')}</TableHead>
                <TableHead>{tr('VAT', 'الضريبة')}</TableHead>
                <TableHead className="text-end">{tr('Price', 'السعر')}</TableHead>
                {(canEdit || canDelete) && <TableHead className="text-end">{tr('Actions', 'الإجراءات')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((service) => (
                <TableRow key={service.id}>
                  <TableCell className="font-medium"><bdi>{service.name}</bdi></TableCell>
                  <TableCell className="text-muted-foreground"><bdi>{service.unit}</bdi></TableCell>
                  <TableCell className="text-muted-foreground">{service.vatApplicable === false ? tr('No VAT', 'بدون ضريبة') : tr('VAT', 'عليها ضريبة')}</TableCell>
                  <TableCell className="text-end tabular-nums"><CurrencyAmount value={service.salePrice ?? 0} /></TableCell>
                  {(canEdit || canDelete) && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <Button size="icon" variant="ghost" onClick={() => setEditing(service)} aria-label={tr('Edit', 'تعديل')} title={tr('Edit', 'تعديل')}>
                            <Pencil className="h-4 w-4" aria-hidden />
                          </Button>
                        )}
                        {canDelete && (
                          <Button size="icon" variant="ghost" onClick={() => remove(service)} aria-label={tr('Remove', 'حذف')} title={tr('Remove', 'حذف')}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ServiceDialog
        companyId={companyId}
        service={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </div>
  );
}

/** Add or edit one service. Also used from a quotation line ("save as service"). */
export function ServiceDialog({
  companyId,
  service,
  initial,
  onClose,
  onSaved,
}: {
  companyId: string;
  service: InventoryItem | 'new' | null;
  /** Prefill for a new service (from a typed quotation line). */
  initial?: { name?: string; salePrice?: number };
  onClose: () => void;
  onSaved: (service: InventoryItem) => void;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [name, setName] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [unit, setUnit] = React.useState('');
  const [vat, setVat] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const open = service !== null;

  React.useEffect(() => {
    if (!open) return;
    const existing = service === 'new' ? null : service;
    setName(existing?.name ?? initial?.name ?? '');
    setPrice(String(existing?.salePrice ?? initial?.salePrice ?? ''));
    setUnit(existing?.unit ?? '');
    setVat(existing ? existing.vatApplicable !== false : true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service]);

  const priceValue = Number(price);
  const valid = name.trim() !== '' && price.trim() !== '' && Number.isFinite(priceValue) && priceValue >= 0;

  const save = async () => {
    if (!valid || !service) return;
    setSaving(true);
    try {
      const input = { name: name.trim(), salePrice: priceValue, unit: unit.trim() || undefined, vatApplicable: vat };
      const saved = service === 'new' ? await createService(companyId, input) : await updateService(service.id, input);
      toast({ title: service === 'new' ? tr('Service added', 'تمت إضافة الخدمة') : tr('Service saved', 'تم حفظ الخدمة') });
      onSaved(saved);
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not save the service', 'تعذّر حفظ الخدمة'), description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service === 'new' ? tr('New service', 'خدمة جديدة') : tr('Edit service', 'تعديل الخدمة')}</DialogTitle>
          <DialogDescription>{tr('It appears in quotations, orders and invoices with this price.', 'تظهر في عروض الأسعار والأوامر والفواتير بهذا السعر.')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="service-name">{tr('Name', 'الاسم')}</Label>
            <Input id="service-name" value={name} onChange={(e) => setName(e.target.value)} dir="auto" maxLength={200} placeholder={tr('e.g. Reels package (4 videos)', 'مثلاً: باقة ريلز (٤ فيديوهات)')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="service-price">{tr('Price', 'السعر')}</Label>
            <Input id="service-price" type="number" min="0" step="0.001" className="text-end" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="service-unit">{tr('Unit (optional)', 'الوحدة (اختياري)')}</Label>
            <Input id="service-unit" value={unit} onChange={(e) => setUnit(e.target.value)} dir="auto" maxLength={40} placeholder={tr('service, month, video…', 'خدمة، شهر، فيديو…')} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3 sm:col-span-2">
            <Label htmlFor="service-vat" className="cursor-pointer">{tr('VAT applies', 'عليها ضريبة القيمة المضافة')}</Label>
            <Switch id="service-vat" checked={vat} onCheckedChange={setVat} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={save} disabled={!valid || saving}>{saving ? tr('Saving…', 'جارٍ الحفظ…') : tr('Save', 'حفظ')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
