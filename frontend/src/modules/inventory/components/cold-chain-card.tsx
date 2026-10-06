'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Thermometer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { addReading, getStorage, setStorage, type StorageView } from '@/services/coldChainService';

type Tr = (en: string, ar: string) => string;

/**
 * Storage conditions for a warehouse: the safe range, a quick way to log a
 * reading, and the readings so far. Out-of-range readings alert managers.
 */
export function ColdChainCard({ warehouseId, canConfigure, tr }: { warehouseId: string; canConfigure: boolean; tr: Tr }) {
  const { toast } = useToast();
  const [view, setView] = React.useState<StorageView | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [range, setRange] = React.useState({ tempMin: '', tempMax: '', humidityMax: '', interval: '12' });
  const [reading, setReading] = React.useState({ temperature: '', humidity: '', note: '' });
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try { setView(await getStorage(warehouseId)); } catch { setView({ conditions: null, readings: [] }); }
  }, [warehouseId]);
  React.useEffect(() => { void load(); }, [load]);

  const c = view?.conditions ?? null;
  const startEdit = () => {
    setRange({ tempMin: c ? String(c.tempMin) : '', tempMax: c ? String(c.tempMax) : '', humidityMax: c?.humidityMax != null ? String(c.humidityMax) : '', interval: String(c?.readingIntervalHours ?? 12) });
    setEditing(true);
  };
  const saveRange = async () => {
    setBusy(true);
    try {
      setView(await setStorage(warehouseId, { tempMin: Number(range.tempMin), tempMax: Number(range.tempMax), humidityMax: range.humidityMax === '' ? null : Number(range.humidityMax), readingIntervalHours: Number(range.interval) || 12 }));
      setEditing(false);
      toast({ title: tr('Storage conditions saved', 'تم حفظ شروط التخزين') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not save', 'تعذّر الحفظ'), description: error?.message });
    } finally { setBusy(false); }
  };
  const log = async () => {
    setBusy(true);
    try {
      const r = await addReading(warehouseId, { temperature: Number(reading.temperature), humidity: reading.humidity === '' ? null : Number(reading.humidity), note: reading.note.trim() || undefined });
      setReading({ temperature: '', humidity: '', note: '' });
      toast(r.excursion
        ? { variant: 'destructive', title: tr('Out of range: managers have been alerted', 'خارج النطاق: نُبّه المديرون'), description: tr('Check the batches stored here before they are used or shipped.', 'افحص الدفعات المخزنة هنا قبل استخدامها أو شحنها.') }
        : { title: tr('Reading recorded', 'تم تسجيل القراءة') });
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not record', 'تعذّر التسجيل'), description: error?.message });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Thermometer className="h-5 w-5 text-muted-foreground" />{tr('Storage conditions', 'شروط التخزين')}</CardTitle>
          <CardDescription>
            {c
              ? tr(`Safe range ${c.tempMin} to ${c.tempMax} °C${c.humidityMax != null ? `, humidity up to ${c.humidityMax}%` : ''}. A reading is due every ${c.readingIntervalHours} hours.`, `النطاق الآمن ${c.tempMin} إلى ${c.tempMax} °م${c.humidityMax != null ? `، والرطوبة حتى ${c.humidityMax}%` : ''}. تُستحق قراءة كل ${c.readingIntervalHours} ساعة.`)
              : tr('Not monitored. Set a temperature range for cold stores and freezers.', 'غير مراقَب. حدّد نطاق حرارة للمخازن المبرّدة والمجمدات.')}
          </CardDescription>
        </div>
        {canConfigure && !editing && <Button variant="outline" size="sm" onClick={startEdit}>{c ? tr('Change range', 'تغيير النطاق') : tr('Monitor this store', 'مراقبة هذا المخزن')}</Button>}
      </CardHeader>
      <CardContent className="space-y-4">
        {editing && (
          <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
            <div className="space-y-1"><Label htmlFor="cc-min">{tr('Min °C', 'الأدنى °م')}</Label><Input id="cc-min" type="number" step="0.1" className="w-24" value={range.tempMin} onChange={(e) => setRange((r) => ({ ...r, tempMin: e.target.value }))} /></div>
            <div className="space-y-1"><Label htmlFor="cc-max">{tr('Max °C', 'الأعلى °م')}</Label><Input id="cc-max" type="number" step="0.1" className="w-24" value={range.tempMax} onChange={(e) => setRange((r) => ({ ...r, tempMax: e.target.value }))} /></div>
            <div className="space-y-1"><Label htmlFor="cc-hum">{tr('Max humidity % (optional)', 'أقصى رطوبة % (اختياري)')}</Label><Input id="cc-hum" type="number" className="w-28" value={range.humidityMax} onChange={(e) => setRange((r) => ({ ...r, humidityMax: e.target.value }))} /></div>
            <div className="space-y-1"><Label htmlFor="cc-int">{tr('Reading every (hours)', 'قراءة كل (ساعات)')}</Label><Input id="cc-int" type="number" min={1} max={168} className="w-24" value={range.interval} onChange={(e) => setRange((r) => ({ ...r, interval: e.target.value }))} /></div>
            <Button size="sm" disabled={busy || range.tempMin === '' || range.tempMax === ''} onClick={saveRange}>{tr('Save', 'حفظ')}</Button>
            {c && <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { setBusy(true); try { setView(await setStorage(warehouseId, { monitored: false })); setEditing(false); } finally { setBusy(false); } }}>{tr('Stop monitoring', 'إيقاف المراقبة')}</Button>}
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{tr('Cancel', 'إلغاء')}</Button>
          </div>
        )}
        {c && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><Label htmlFor="cc-t">{tr('Temperature °C', 'الحرارة °م')}</Label><Input id="cc-t" type="number" step="0.1" className="w-28" value={reading.temperature} onChange={(e) => setReading((r) => ({ ...r, temperature: e.target.value }))} /></div>
            {c.humidityMax != null && <div className="space-y-1"><Label htmlFor="cc-h">{tr('Humidity %', 'الرطوبة %')}</Label><Input id="cc-h" type="number" className="w-24" value={reading.humidity} onChange={(e) => setReading((r) => ({ ...r, humidity: e.target.value }))} /></div>}
            <div className="min-w-48 flex-1 space-y-1"><Label htmlFor="cc-n">{tr('Note (optional)', 'ملاحظة (اختياري)')}</Label><Input id="cc-n" value={reading.note} onChange={(e) => setReading((r) => ({ ...r, note: e.target.value }))} /></div>
            <Button disabled={busy || reading.temperature === ''} onClick={log}>{tr('Record reading', 'تسجيل قراءة')}</Button>
          </div>
        )}
        {view && view.readings.length > 0 && (
          <div className="max-h-72 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr('When', 'الوقت')}</TableHead>
                  <TableHead className="text-end">{tr('Temperature', 'الحرارة')}</TableHead>
                  <TableHead className="text-end">{tr('Humidity', 'الرطوبة')}</TableHead>
                  <TableHead>{tr('By', 'بواسطة')}</TableHead>
                  <TableHead>{tr('Note', 'ملاحظة')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.readings.map((r) => (
                  <TableRow key={r.id} className={cn(r.excursion && 'bg-red-50 dark:bg-red-950/30')}>
                    <TableCell className="tabular-nums">{format(new Date(r.recordedAt), 'dd MMM HH:mm')}</TableCell>
                    <TableCell className={cn('text-end tabular-nums', r.excursion && 'font-semibold text-destructive')}>
                      {r.excursion && <AlertTriangle className="me-1 inline h-3.5 w-3.5" aria-label={tr('Out of range', 'خارج النطاق')} />}{r.temperature} °C
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{r.humidity != null ? `${r.humidity}%` : '—'}</TableCell>
                    <TableCell dir="auto">{r.recordedByName ?? '—'}</TableCell>
                    <TableCell dir="auto" className="text-muted-foreground">{r.note ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {c && view?.readings.some((r) => r.excursion) && <Badge variant="outline" className="border-red-300 text-red-800 dark:text-red-200">{tr(`${view.readings.filter((r) => r.excursion).length} out-of-range readings shown`, `${view.readings.filter((r) => r.excursion).length} قراءات خارج النطاق معروضة`)}</Badge>}
      </CardContent>
    </Card>
  );
}
