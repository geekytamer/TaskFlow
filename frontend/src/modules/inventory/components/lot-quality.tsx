'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Check, PlusCircle, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { inspectLot, traceLot, type InspectionCheck, type InspectionStage, type LotTrace } from '@/services/qualityService';

type Tr = (en: string, ar: string) => string;

export const lotStatusLabel = (status: string, tr: Tr) => ({
  Active: tr('Available', 'متاحة'),
  Depleted: tr('Used up', 'نفدت'),
  Expired: tr('Expired', 'منتهية'),
  Quarantine: tr('Awaiting QC', 'بانتظار الفحص'),
  Rejected: tr('Rejected', 'مرفوضة'),
}[status] ?? status);

export function LotStatusBadge({ status, tr }: { status: string; tr: Tr }) {
  const tone = status === 'Quarantine' ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100'
    : status === 'Rejected' ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
      : status === 'Active' ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : '';
  return <Badge variant="outline" className={tone}>{lotStatusLabel(status, tr)}</Badge>;
}

const stageLabel = (s: InspectionStage, tr: Tr) => ({ incoming: tr('Incoming (on receipt)', 'عند الاستلام'), in_process: tr('In process', 'أثناء الإنتاج'), final: tr('Final (before shipping)', 'نهائي (قبل الشحن)') }[s]);

/** Record an inspection: every check must pass for the batch to be released; any failure rejects it. */
export function InspectDialog({ lot, tr, onClose, onDone }: {
  lot: { id: string; lotNumber: string; status: string }; tr: Tr; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [stage, setStage] = React.useState<InspectionStage>(lot.status === 'Quarantine' ? 'incoming' : 'final');
  const [checks, setChecks] = React.useState<InspectionCheck[]>([{ name: '', expected: '', actual: '', pass: true }]);
  const [notes, setNotes] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const setCheck = (i: number, patch: Partial<InspectionCheck>) => setChecks((c) => c.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const filled = checks.filter((c) => c.name.trim());
  const willPass = filled.length > 0 && filled.every((c) => c.pass);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tr(`Inspect batch ${lot.lotNumber}`, `فحص الدفعة ${lot.lotNumber}`)}</DialogTitle>
          <DialogDescription>{tr('If every check passes, the batch is released for use and shipping. One failed check rejects it for good.', 'إن نجحت كل الفحوص تُعتمد الدفعة للاستخدام والشحن. وفحص واحد فاشل يرفضها نهائياً.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5 sm:w-72">
            <Label>{tr('Stage', 'المرحلة')}</Label>
            <Select value={stage} onValueChange={(v) => setStage(v as InspectionStage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(['incoming', 'in_process', 'final'] as InspectionStage[]).map((s) => <SelectItem key={s} value={s}>{stageLabel(s, tr)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{tr('Checks', 'الفحوص')}</Label>
            {checks.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_7rem_7rem_auto_2rem] items-center gap-2">
                <Input value={c.name} placeholder={tr('e.g. Core temperature', 'مثال: درجة الحرارة الداخلية')} aria-label={tr(`Check ${i + 1}`, `الفحص ${i + 1}`)} onChange={(e) => setCheck(i, { name: e.target.value })} />
                <Input value={c.expected ?? ''} placeholder={tr('Expected', 'المتوقع')} aria-label={tr(`Check ${i + 1} expected`, `المتوقع للفحص ${i + 1}`)} onChange={(e) => setCheck(i, { expected: e.target.value })} />
                <Input value={c.actual ?? ''} placeholder={tr('Found', 'الفعلي')} aria-label={tr(`Check ${i + 1} found`, `الفعلي للفحص ${i + 1}`)} onChange={(e) => setCheck(i, { actual: e.target.value })} />
                <label className="flex items-center gap-1.5 text-sm">
                  <Switch checked={c.pass} onCheckedChange={(v) => setCheck(i, { pass: v })} aria-label={tr(`Check ${i + 1} passed`, `نجح الفحص ${i + 1}`)} />
                  <span className={cn('w-10', c.pass ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive')}>{c.pass ? tr('Pass', 'ناجح') : tr('Fail', 'فاشل')}</span>
                </label>
                <Button variant="ghost" size="icon" disabled={checks.length === 1} aria-label={tr(`Remove check ${i + 1}`, `حذف الفحص ${i + 1}`)} onClick={() => setChecks((x) => x.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setChecks((c) => [...c, { name: '', expected: '', actual: '', pass: true }])}><PlusCircle className="me-2 h-4 w-4" />{tr('Add check', 'إضافة فحص')}</Button>
          </div>
          <div className="space-y-1.5"><Label htmlFor="qc-notes">{tr('Notes', 'ملاحظات')}</Label><Textarea id="qc-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className={cn('text-sm font-medium', willPass ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive')}>
            {filled.length === 0 ? ' ' : willPass ? tr('Result: pass, the batch will be released', 'النتيجة: ناجح، ستُعتمد الدفعة') : tr('Result: fail, the batch will be rejected', 'النتيجة: فاشل، ستُرفض الدفعة')}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
            <Button variant={filled.length > 0 && !willPass ? 'destructive' : 'default'} disabled={filled.length === 0 || saving} onClick={async () => {
              setSaving(true);
              try {
                const res = await inspectLot(lot.id, { stage, checks: filled.map((c) => ({ ...c, name: c.name.trim() })), notes: notes.trim() || undefined });
                toast({ title: res.inspection.result === 'pass' ? tr(`Batch ${lot.lotNumber} released`, `اعتُمدت الدفعة ${lot.lotNumber}`) : tr(`Batch ${lot.lotNumber} rejected`, `رُفضت الدفعة ${lot.lotNumber}`) });
                onDone();
              } catch (error: any) {
                toast({ variant: 'destructive', title: tr('Could not record the inspection', 'تعذّر تسجيل الفحص'), description: error?.message });
              } finally { setSaving(false); }
            }}>{tr('Record inspection', 'تسجيل الفحص')}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Where a batch came from and everywhere it went: for recalls and complaints. */
export function TraceDialog({ lotId, tr, onClose }: { lotId: string; tr: Tr; onClose: () => void }) {
  const [trace, setTrace] = React.useState<LotTrace | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { traceLot(lotId).then(setTrace).catch((e) => setError(e?.message ?? 'Error')); }, [lotId]);
  const day = (iso?: string | null) => (iso ? format(new Date(iso), 'dd MMM yyyy') : '—');
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{trace ? tr(`Batch ${trace.lot.lotNumber}: where it came from and went`, `الدفعة ${trace.lot.lotNumber}: مصدرها ووجهتها`) : tr('Batch trace', 'تتبع الدفعة')}</DialogTitle>
          {trace?.item && <DialogDescription dir="auto">{trace.item.name} · {trace.item.sku}</DialogDescription>}
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!trace && !error && <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>}
        {trace && (
          <div className="space-y-4 text-sm">
            <section>
              <h4 className="mb-1 font-semibold">{tr('Came from', 'المصدر')}</h4>
              <p>{trace.supplier ? <span dir="auto">{trace.supplier.name}</span> : tr('No supplier recorded', 'لا يوجد مورّد مسجّل')} · {tr('received', 'استُلمت')} {day(trace.lot.receivedAt)} · {trace.lot.initialQuantity} {trace.item?.unit}</p>
              {trace.lot.note && <p className="text-muted-foreground" dir="auto">{trace.lot.note}</p>}
            </section>
            <section>
              <h4 className="mb-1 font-semibold">{tr('Inspections', 'الفحوص')}</h4>
              {trace.inspections.length === 0 ? <p className="text-muted-foreground">{tr('None yet.', 'لا يوجد بعد.')}</p> : trace.inspections.map((i) => (
                <div key={i.id} className="mb-1.5 rounded-md border p-2">
                  <p className="flex items-center gap-2">
                    {i.result === 'pass' ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-destructive" />}
                    <span className="font-medium">{stageLabel(i.stage, tr)}</span>
                    <span className="text-muted-foreground">{day(i.inspectedAt)}{i.inspectedByName ? ` · ${i.inspectedByName}` : ''}</span>
                  </p>
                  <ul className="mt-1 ps-6 text-muted-foreground">
                    {i.checks.map((c, k) => <li key={k} className={cn(!c.pass && 'text-destructive')} dir="auto">{c.name}{c.expected ? ` (${tr('expected', 'المتوقع')} ${c.expected})` : ''}{c.actual ? `: ${c.actual}` : ''}</li>)}
                  </ul>
                </div>
              ))}
            </section>
            <section>
              <h4 className="mb-1 font-semibold">{tr('Went to', 'الوجهة')}</h4>
              {trace.shipments.length === 0 ? <p className="text-muted-foreground">{tr('Not shipped to anyone yet.', 'لم تُشحن لأحد بعد.')}</p> : (
                <ul className="space-y-1">
                  {trace.shipments.map((s) => (
                    <li key={`${s.deliveryId}-${s.quantity}`} className="flex flex-wrap gap-x-2">
                      <span className="font-medium" dir="auto">{s.clientName ?? '—'}</span>
                      <span className="text-muted-foreground">{s.quantity} {trace.item?.unit} · {s.deliveryNumber}{s.salesOrderNumber ? ` (${s.salesOrderNumber})` : ''} · {day(s.dispatchedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {trace.movements.length > 0 && (
              <section>
                <h4 className="mb-1 font-semibold">{tr('Other stock movements', 'حركات المخزون الأخرى')}</h4>
                <ul className="space-y-0.5 text-muted-foreground">
                  {trace.movements.map((m, i) => <li key={i}>{day(m.at)} · {m.type} · {m.quantity > 0 ? `+${m.quantity}` : m.quantity}{m.note ? ` · ${m.note}` : ''}</li>)}
                </ul>
              </section>
            )}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>{tr('Close', 'إغلاق')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
