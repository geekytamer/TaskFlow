'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/context/i18n-context';
import { Clock, Trash2 } from 'lucide-react';
import { getTimeEntries, logTime, deleteTimeEntry } from '@/services/projectService';
import type { TimeEntry } from '@/modules/projects/types';

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function TaskTimePanel({ taskId }: { taskId: string }) {
  const { toast } = useToast();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [entries, setEntries] = React.useState<TimeEntry[]>([]);
  const [hours, setHours] = React.useState('');
  const [note, setNote] = React.useState('');
  const [spentOn, setSpentOn] = React.useState(todayIso());
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    getTimeEntries(taskId).then(setEntries).catch(() => undefined);
  }, [taskId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);

  const submit = async () => {
    const value = Number(hours);
    if (!Number.isFinite(value) || value <= 0) {
      toast({ variant: 'destructive', title: tr('Enter hours greater than zero.', 'أدخل عدد ساعات أكبر من صفر.') });
      return;
    }
    setSaving(true);
    try {
      await logTime(taskId, { hours: value, note: note.trim() || undefined, spentOn });
      setHours('');
      setNote('');
      setSpentOn(todayIso());
      load();
    } catch (error) {
      toast({ variant: 'destructive', title: tr('Could not log time', 'تعذر تسجيل الوقت'), description: error instanceof Error ? error.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteTimeEntry(id);
      load();
    } catch (error) {
      toast({ variant: 'destructive', title: tr('Could not delete entry', 'تعذر حذف الإدخال'), description: error instanceof Error ? error.message : undefined });
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> {tr('Time tracking', 'تتبّع الوقت')}
        </p>
        {totalMinutes > 0 ? (
          <span className="text-sm font-medium">{formatDuration(totalMinutes)} {tr('logged', 'مُسجَّل')}</span>
        ) : null}
      </div>

      <div className="grid grid-cols-[80px_1fr_auto] items-end gap-2">
        <div className="space-y-1">
          <Label className="text-[11px]">{tr('Hours', 'الساعات')}</Label>
          <Input className="h-8" type="number" step="0.25" min="0" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="1.5" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{tr('Note', 'ملاحظة')}</Label>
          <Input className="h-8" value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr('What did you work on?', 'بماذا عملت؟')} />
        </div>
        <Button size="sm" className="h-8" onClick={submit} disabled={saving}>
          {saving ? tr('Logging…', 'جارٍ التسجيل…') : tr('Log', 'تسجيل')}
        </Button>
      </div>
      <div className="mt-2 w-[80px]">
        <Input className="h-8" type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
      </div>

      {entries.length > 0 ? (
        <div className="mt-3 space-y-1">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm">
              <div className="min-w-0">
                <span className="font-medium">{formatDuration(e.minutes)}</span>
                <span className="ms-2 text-xs text-muted-foreground">
                  {e.userName ? `${e.userName} · ` : ''}{e.spentOn.toLocaleDateString()}
                </span>
                {e.note ? <div className="truncate text-xs text-muted-foreground">{e.note}</div> : null}
              </div>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => remove(e.id)}
                aria-label={tr('Delete time entry', 'حذف إدخال الوقت')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">{tr('No time logged yet.', 'لم يُسجَّل أي وقت بعد.')}</p>
      )}
    </div>
  );
}
