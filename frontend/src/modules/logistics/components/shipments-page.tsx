'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { ArrowDownToLine, ArrowUpFromLine, Check, Circle, PlusCircle, Ship, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import {
  createShipment, deleteShipment, getShipments, moveShipment, updateShipment,
  type Shipment, type ShipmentDirection, type ShipmentMode, type ShipmentStatus,
} from '@/services/shipmentService';

type Tr = (en: string, ar: string) => string;
const FLOW: ShipmentStatus[] = ['planned', 'in_transit', 'arrived', 'cleared', 'delivered'];

const statusLabel = (s: ShipmentStatus, tr: Tr) => ({
  planned: tr('Planned', 'مخطط'), in_transit: tr('In transit', 'في الطريق'), arrived: tr('Arrived', 'وصلت'),
  cleared: tr('Cleared customs', 'تخلّصت جمركياً'), delivered: tr('Delivered', 'سُلّمت'), cancelled: tr('Cancelled', 'ملغاة'),
}[s]);
const modeLabel = (m: ShipmentMode, tr: Tr) => ({ sea: tr('Sea', 'بحري'), air: tr('Air', 'جوي'), land: tr('Land', 'بري') }[m]);

/**
 * Containers on the way in and out: where each one is, when it is due, and
 * which papers are still missing. Clearing waits for every document.
 */
export function ShipmentsPage() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr: Tr = React.useCallback((en, ar) => (language === 'ar' ? ar : en), [language]);
  const { toast } = useToast();
  const confirm = useConfirm();
  const companyId = selectedCompany?.id ?? '';
  const [items, setItems] = React.useState<Shipment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showClosed, setShowClosed] = React.useState(false);
  const [editing, setEditing] = React.useState<Shipment | 'new' | null>(null);

  const load = React.useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try { setItems(await getShipments(companyId)); }
    catch (error: any) { toast({ variant: 'destructive', title: tr('Could not load shipments', 'تعذّر تحميل الشحنات'), description: error?.message }); }
    finally { setLoading(false); }
  }, [companyId, toast, tr]);
  React.useEffect(() => { void load(); }, [load]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const visible = items.filter((s) => showClosed || (s.status !== 'delivered' && s.status !== 'cancelled'));
  const act = async (fn: () => Promise<unknown>, fail: string) => {
    try { await fn(); await load(); } catch (error: any) { toast({ variant: 'destructive', title: fail, description: error?.message }); }
  };

  return (
    <SectionPageShell
      title={tr('Shipments', 'الشحنات')}
      description={tr('Imports and exports on the way: where each one is, when it is due, and which papers are still missing.', 'الواردات والصادرات في الطريق: أين كل شحنة، ومتى تصل، وما المستندات الناقصة.')}
      actions={<Button onClick={() => setEditing('new')}><PlusCircle className="me-2 h-4 w-4" />{tr('New shipment', 'شحنة جديدة')}</Button>}
    >
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={showClosed} onCheckedChange={(v) => setShowClosed(v === true)} />{tr('Show delivered and cancelled', 'إظهار المسلّمة والملغاة')}
      </label>
      {loading ? <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p> : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed py-14 text-center text-muted-foreground">
          <Ship className="mx-auto mb-2 h-7 w-7" />{tr('No shipments on the way.', 'لا توجد شحنات في الطريق.')}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((s) => {
            const missing = s.documents.filter((d) => !d.received);
            const late = s.eta && s.eta < today && (s.status === 'planned' || s.status === 'in_transit');
            const stepIndex = FLOW.indexOf(s.status);
            const nextStatus = stepIndex >= 0 && stepIndex < FLOW.length - 1 ? FLOW[stepIndex + 1] : null;
            return (
              <article key={s.id} className="rounded-lg border p-4">
                <header className="flex flex-wrap items-center gap-2">
                  {s.direction === 'import' ? <ArrowDownToLine className="h-4 w-4 text-sky-600" aria-label={tr('Import', 'وارد')} /> : <ArrowUpFromLine className="h-4 w-4 text-violet-600" aria-label={tr('Export', 'صادر')} />}
                  <h3 className="font-semibold">{s.reference}</h3>
                  <span className="text-sm text-muted-foreground">{modeLabel(s.mode, tr)}{s.carrier ? ` · ${s.carrier}` : ''}</span>
                  <Badge variant="outline" className={cn('ms-auto', s.status === 'cancelled' && 'opacity-60', late && 'border-red-300 text-red-800 dark:text-red-200')}>
                    {late ? tr('Late', 'متأخرة') : statusLabel(s.status, tr)}
                  </Badge>
                </header>
                <p className="mt-1 text-sm" dir="auto">{s.origin || '—'} → {s.destination || '—'}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {tr('Departs', 'المغادرة')} {s.etd ?? '—'} · {tr('Arrives', 'الوصول')} {s.eta ?? '—'}
                  {s.containers.length > 0 && <> · {s.containers.join(', ')}</>}
                </p>
                {s.status !== 'cancelled' && (
                  <ol className="mt-3 flex items-center gap-1 text-[11px]" aria-label={tr('Progress', 'التقدم')}>
                    {FLOW.map((step, i) => (
                      <li key={step} className={cn('flex flex-1 items-center gap-1', i <= stepIndex ? 'text-foreground' : 'text-muted-foreground')}>
                        {i <= stepIndex ? <Check className="h-3 w-3 text-emerald-600" /> : <Circle className="h-3 w-3" />}
                        <span className="truncate">{statusLabel(step, tr)}</span>
                      </li>
                    ))}
                  </ol>
                )}
                <div className="mt-3 text-sm">
                  {missing.length === 0
                    ? <p className="text-emerald-700 dark:text-emerald-400">{tr('All documents in.', 'كل المستندات متوفرة.')}</p>
                    : <p className={cn(s.status !== 'cancelled' && 'text-amber-800 dark:text-amber-300')}>{tr(`Missing: ${missing.map((d) => d.name).join(', ')}`, `ناقص: ${missing.map((d) => d.name).join('، ')}`)}</p>}
                </div>
                {s.status !== 'delivered' && s.status !== 'cancelled' && (
                  <footer className="mt-3 flex flex-wrap gap-2">
                    {nextStatus && <Button size="sm" onClick={() => act(() => moveShipment(s.id, nextStatus), tr('Could not move it on', 'تعذّر تحديث الحالة'))}>{tr(`Mark ${statusLabel(nextStatus, tr).toLowerCase()}`, `تحديد: ${statusLabel(nextStatus, tr)}`)}</Button>}
                    <Button size="sm" variant="outline" onClick={() => setEditing(s)}>{tr('Details & documents', 'التفاصيل والمستندات')}</Button>
                    {FLOW.indexOf(s.status) < FLOW.indexOf('cleared') && (
                      <Button size="sm" variant="ghost" onClick={async () => {
                        if (!(await confirm({ title: tr(`Cancel ${s.reference}?`, `إلغاء ${s.reference}؟`), confirmText: tr('Cancel shipment', 'إلغاء الشحنة'), cancelText: tr('Keep', 'إبقاء'), destructive: true }))) return;
                        await act(() => moveShipment(s.id, 'cancelled'), tr('Could not cancel', 'تعذّر الإلغاء'));
                      }}><X className="me-1 h-4 w-4" />{tr('Cancel', 'إلغاء')}</Button>
                    )}
                    {s.status === 'planned' && (
                      <Button size="icon" variant="ghost" aria-label={tr(`Delete ${s.reference}`, `حذف ${s.reference}`)} onClick={async () => {
                        if (!(await confirm({ title: tr(`Delete ${s.reference}?`, `حذف ${s.reference}؟`), confirmText: tr('Delete', 'حذف'), cancelText: tr('Keep', 'إبقاء'), destructive: true }))) return;
                        await act(() => deleteShipment(s.id), tr('Could not delete', 'تعذّر الحذف'));
                      }}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      )}
      {editing && (
        <ShipmentDialog shipment={editing === 'new' ? null : editing} tr={tr} onClose={() => setEditing(null)} onSave={async (data) => {
          try {
            if (editing === 'new') await createShipment(companyId, data);
            else await updateShipment(editing.id, data);
            setEditing(null);
            await load();
          } catch (error: any) {
            toast({ variant: 'destructive', title: tr('Could not save', 'تعذّر الحفظ'), description: error?.message });
          }
        }} />
      )}
    </SectionPageShell>
  );
}

function ShipmentDialog({ shipment, tr, onClose, onSave }: {
  shipment: Shipment | null; tr: Tr; onClose: () => void; onSave: (data: Parameters<typeof createShipment>[1]) => Promise<void>;
}) {
  const [f, setF] = React.useState({
    direction: (shipment?.direction ?? 'import') as ShipmentDirection, mode: (shipment?.mode ?? 'sea') as ShipmentMode,
    carrier: shipment?.carrier ?? '', containers: shipment?.containers.join(', ') ?? '', origin: shipment?.origin ?? '', destination: shipment?.destination ?? '',
    etd: shipment?.etd ?? '', eta: shipment?.eta ?? '', notes: shipment?.notes ?? '',
  });
  const [docs, setDocs] = React.useState(shipment?.documents.map((d) => ({ name: d.name, received: d.received })) ?? []);
  const [newDoc, setNewDoc] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{shipment ? shipment.reference : tr('New shipment', 'شحنة جديدة')}</DialogTitle>
          <DialogDescription>{shipment ? tr('Tick each document as it arrives. Remove ones that do not apply to this shipment.', 'أشّر على كل مستند عند وصوله. واحذف ما لا ينطبق على هذه الشحنة.') : tr('The usual documents are listed for you once it is saved.', 'تُدرج المستندات المعتادة تلقائياً بعد الحفظ.')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {!shipment && (
            <div className="space-y-1.5">
              <Label>{tr('Direction', 'الاتجاه')}</Label>
              <Select value={f.direction} onValueChange={(v) => set({ direction: v as ShipmentDirection })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="import">{tr('Import (coming in)', 'وارد')}</SelectItem><SelectItem value="export">{tr('Export (going out)', 'صادر')}</SelectItem></SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{tr('By', 'الوسيلة')}</Label>
            <Select value={f.mode} onValueChange={(v) => set({ mode: v as ShipmentMode })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(['sea', 'air', 'land'] as ShipmentMode[]).map((m) => <SelectItem key={m} value={m}>{modeLabel(m, tr)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="sh-carrier">{tr('Carrier', 'الناقل')}</Label><Input id="sh-carrier" value={f.carrier} onChange={(e) => set({ carrier: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="sh-cont">{tr('Container numbers', 'أرقام الحاويات')}</Label><Input id="sh-cont" value={f.containers} placeholder="MSCU1234567, …" onChange={(e) => set({ containers: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="sh-from">{tr('From', 'من')}</Label><Input id="sh-from" value={f.origin} onChange={(e) => set({ origin: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="sh-to">{tr('To', 'إلى')}</Label><Input id="sh-to" value={f.destination} onChange={(e) => set({ destination: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="sh-etd">{tr('Departs (ETD)', 'المغادرة المتوقعة')}</Label><Input id="sh-etd" type="date" value={f.etd} onChange={(e) => set({ etd: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="sh-eta">{tr('Arrives (ETA)', 'الوصول المتوقع')}</Label><Input id="sh-eta" type="date" value={f.eta} min={f.etd || undefined} onChange={(e) => set({ eta: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="sh-notes">{tr('Notes', 'ملاحظات')}</Label><Textarea id="sh-notes" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
        </div>
        {shipment && (
          <div className="space-y-2">
            <Label>{tr('Documents', 'المستندات')}</Label>
            <ul className="divide-y rounded-md border">
              {docs.map((d, i) => (
                <li key={d.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Checkbox checked={d.received} onCheckedChange={(v) => setDocs((x) => x.map((y, j) => (j === i ? { ...y, received: v === true } : y)))} aria-label={tr(`${d.name} received`, `استُلم ${d.name}`)} />
                  <span className={cn('flex-1', d.received && 'text-muted-foreground')}>{d.name}</span>
                  <Button size="icon" variant="ghost" aria-label={tr(`Remove ${d.name}`, `حذف ${d.name}`)} onClick={() => setDocs((x) => x.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input value={newDoc} placeholder={tr('Another document, e.g. Halal certificate', 'مستند آخر، مثل شهادة حلال')} onChange={(e) => setNewDoc(e.target.value)} />
              <Button variant="outline" disabled={newDoc.trim().length < 2 || docs.some((d) => d.name === newDoc.trim())} onClick={() => { setDocs((x) => [...x, { name: newDoc.trim(), received: false }]); setNewDoc(''); }}>{tr('Add', 'إضافة')}</Button>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
          <Button disabled={saving} onClick={async () => {
            setSaving(true);
            try {
              await onSave({
                ...(shipment ? {} : { direction: f.direction }), mode: f.mode, carrier: f.carrier, containers: f.containers, origin: f.origin, destination: f.destination,
                etd: f.etd || null, eta: f.eta || null, notes: f.notes, ...(shipment ? { documents: docs } : {}),
              });
            } finally { setSaving(false); }
          }}>{tr('Save', 'حفظ')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
