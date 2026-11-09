'use client';

import { BilingualNameFields, namesOf, namesPayload, type BilingualNames } from '@/components/bilingual-name-fields';
import { displayName } from '@/lib/display-name';
import { matchesSearch } from '@/lib/search-normalize';
import * as React from 'react';
import { Languages, Loader2, Pencil, PlusCircle, Tags, Trash2 } from 'lucide-react';
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
import { suggestName } from '@/services/nameSuggestionService';
import { Checkbox } from '@/components/ui/checkbox';

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
  const [fillingNames, setFillingNames] = React.useState(false);
  const missingNames = services.filter((s) => !(s.nameAr && s.nameEn));

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

  const shown = query.trim() ? services.filter((s) => matchesSearch(query, s.name, s.nameAr, s.nameEn)) : services;

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
        {canEdit && missingNames.length > 0 && (
          <Button variant="outline" onClick={() => setFillingNames(true)}>
            <Languages className="me-2 h-4 w-4" aria-hidden />
            {tr(`Suggest missing names (${missingNames.length})`, `اقترح الأسماء الناقصة (${missingNames.length})`)}
          </Button>
        )}
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
                  <TableCell className="font-medium"><bdi>{displayName(service, language)}</bdi>{service.nameAr && service.nameEn && <div className="text-xs font-normal text-muted-foreground"><bdi>{displayName(service, language === 'ar' ? 'en' : 'ar')}</bdi></div>}</TableCell>
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

      <MissingNamesDialog
        open={fillingNames}
        companyId={companyId}
        services={missingNames}
        onClose={() => setFillingNames(false)}
        onSaved={() => { setFillingNames(false); load(); }}
      />
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
  const [names, setNames] = React.useState<BilingualNames>({ nameAr: '', nameEn: '' });
  const [price, setPrice] = React.useState('');
  const [unit, setUnit] = React.useState('');
  const [vat, setVat] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const open = service !== null;

  React.useEffect(() => {
    if (!open) return;
    const existing = service === 'new' ? null : service;
    setNames(existing ? namesOf(existing) : namesOf({ name: initial?.name ?? '' }));
    setPrice(String(existing?.salePrice ?? initial?.salePrice ?? ''));
    setUnit(existing?.unit ?? '');
    setVat(existing ? existing.vatApplicable !== false : true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service]);

  const priceValue = Number(price);
  const valid = (names.nameAr.trim() !== '' || names.nameEn.trim() !== '') && price.trim() !== '' && Number.isFinite(priceValue) && priceValue >= 0;

  const save = async () => {
    if (!valid || !service) return;
    setSaving(true);
    try {
      const input = { ...namesPayload(names, language), salePrice: priceValue, unit: unit.trim() || undefined, vatApplicable: vat };
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
          <div className="sm:col-span-2">
            <BilingualNameFields value={names} onChange={setNames} companyId={companyId} kind="term" idPrefix="service-name" />
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

/**
 * Suggests the missing other-language name for every service at once, from the
 * assistant's model. Nothing is saved until the person reviews the list, edits
 * what is wrong, and saves the ticked rows (spec 2026-11-10-bilingual-names-design).
 */
function MissingNamesDialog({ open, companyId, services, onClose, onSaved }: {
  open: boolean;
  companyId: string;
  services: InventoryItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  type Row = { id: string; source: string; target: 'ar' | 'en'; text: string; picked: boolean; state: 'waiting' | 'done' | 'failed' };
  const [rows, setRows] = React.useState<Row[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [offline, setOffline] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let live = true;
    const start: Row[] = services.map((s) => {
      const target: 'ar' | 'en' = s.nameAr ? 'en' : 'ar';
      return { id: s.id, source: (target === 'en' ? s.nameAr : s.nameEn) || s.name, target, text: '', picked: false, state: 'waiting' };
    });
    setRows(start);
    setOffline(false);
    // One at a time: the model runs on one machine, and the list fills in as answers come.
    (async () => {
      for (const row of start) {
        if (!live) return;
        try {
          const suggestion = await suggestName(companyId, { text: row.source, from: row.target === 'ar' ? 'en' : 'ar', kind: 'term' });
          if (live) setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, text: suggestion, picked: true, state: 'done' } : r)));
        } catch (error: any) {
          if (!live) return;
          setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, state: 'failed' } : r)));
          if (error?.status === 503) { setOffline(true); return; }
        }
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    const chosen = rows.filter((r) => r.picked && r.text.trim());
    setSaving(true);
    try {
      for (const r of chosen) {
        await updateService(r.id, r.target === 'ar' ? { nameAr: r.text.trim() } : { nameEn: r.text.trim() });
      }
      toast({ title: tr(`${chosen.length} names saved`, `تم حفظ ${chosen.length} اسم`) });
      onSaved();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not save the names', 'تعذّر حفظ الأسماء'), description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const picked = rows.filter((r) => r.picked && r.text.trim()).length;
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tr('Suggest missing names', 'اقترح الأسماء الناقصة')}</DialogTitle>
          <DialogDescription>
            {tr('Suggestions from the assistant. Check each one, fix what is wrong, untick what you do not want, then save.',
              'اقتراحات من المساعد. راجع كل اسم، صحّح الخطأ، وألغِ تحديد ما لا تريده، ثم احفظ.')}
          </DialogDescription>
        </DialogHeader>
        {offline && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            {tr('The assistant is offline right now, so the rest have no suggestion. You can type them here.', 'المساعد غير متاح حاليًا، فالباقي بدون اقتراح. تقدر تكتبها هنا.')}
          </p>
        )}
        <div className="max-h-[55vh] space-y-2 overflow-y-auto">
          {rows.map((r) => (
            <div key={r.id} className="grid grid-cols-[auto_1fr_1fr] items-center gap-2">
              <Checkbox checked={r.picked} onCheckedChange={(v) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, picked: Boolean(v) } : x)))} aria-label={r.source} />
              <bdi className="truncate text-sm">{r.source}</bdi>
              <div className="relative">
                <Input
                  dir={r.target === 'ar' ? 'rtl' : 'ltr'}
                  lang={r.target}
                  value={r.text}
                  placeholder={r.state === 'waiting' ? tr('Suggesting…', 'جارٍ الاقتراح…') : r.target === 'ar' ? 'الاسم بالعربي' : 'Name in English'}
                  onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, text: e.target.value, picked: Boolean(e.target.value.trim()) } : x)))}
                />
                {r.state === 'waiting' && !offline && <Loader2 className="absolute end-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={save} disabled={saving || picked === 0}>{tr(`Save ${picked}`, `احفظ ${picked}`)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
