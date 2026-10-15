'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getConversationSettings, saveConversationSettings, type ConversationSettings } from '@/services/conversationService';

const FALLBACK_ZONES = ['Asia/Muscat', 'Asia/Dubai', 'Asia/Riyadh', 'Africa/Cairo', 'Europe/London', 'UTC'];

function zoneList(current: string): string[] {
  let zones = FALLBACK_ZONES;
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone');
    if (supported?.length) zones = Array.from(new Set(['Asia/Muscat', ...supported, 'UTC']));
  } catch { /* older browsers keep the short list */ }
  return zones.includes(current) ? zones : [current, ...zones];
}

/** Response-time target and working hours that drive the amber/red waiting chips in the inbox. */
export function ConversationSettingsPanel({ canEdit }: { canEdit: boolean }) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const companyId = selectedCompany?.id;
  const [form, setForm] = React.useState<ConversationSettings | null>(null);
  const [hours, setHours] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!companyId) return;
    let live = true;
    getConversationSettings(companyId)
      .then((s) => { if (live) { setForm(s); setHours(String(s.responseTargetHours)); } })
      .catch(() => { if (live) setForm(null); });
    return () => { live = false; };
  }, [companyId]);

  const zones = React.useMemo(() => zoneList(form?.timeZone ?? 'Asia/Muscat'), [form?.timeZone]);
  if (!companyId || !form) return null;

  const dayNames = language === 'ar'
    ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const toggleDay = (d: number) => {
    const has = form.workDays.includes(d);
    setForm({ ...form, workDays: has ? form.workDays.filter((x) => x !== d) : [...form.workDays, d].sort() });
  };

  const save = async () => {
    const target = Number(hours);
    if (!Number.isFinite(target) || target < 0.5 || target > 72) {
      setError(tr('Enter a target between 0.5 and 72 hours.', 'أدخل مدة بين 0.5 و72 ساعة.'));
      return;
    }
    if (form.workDays.length === 0) {
      setError(tr('Pick at least one working day.', 'اختر يوم عمل واحدًا على الأقل.'));
      return;
    }
    if (form.dayStart >= form.dayEnd) {
      setError(tr('The day must end after it starts.', 'يجب أن ينتهي اليوم بعد بدايته.'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const next = await saveConversationSettings(companyId, { ...form, responseTargetHours: target });
      setForm(next);
      setHours(String(next.responseTargetHours));
      toast({ title: tr('Response times saved', 'تم حفظ أوقات الرد') });
    } catch (e) {
      setError((e as Error)?.message || tr('Could not save. Try again.', 'تعذّر الحفظ. حاول مجددًا.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr('Conversation response times', 'أوقات الرد على المحادثات')}</CardTitle>
        <CardDescription>
          {tr('How fast we aim to reply. Only working hours count, so a message on Friday night is not late on Saturday.', 'المدة التي نهدف للردّ خلالها. تُحتسب ساعات العمل فقط، فلا تتأخر رسالة ليلة الجمعة صباح السبت.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="conv-target">{tr('Reply within (working hours)', 'الردّ خلال (ساعات عمل)')}</Label>
          <Input id="conv-target" type="number" inputMode="decimal" min={0.5} max={72} step={0.5} className="w-28" value={hours} disabled={!canEdit} onChange={(e) => setHours(e.target.value)} />
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">{tr('Working days', 'أيام العمل')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {dayNames.map((name, d) => {
              const on = form.workDays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  disabled={!canEdit}
                  onClick={() => toggleDay(d)}
                  className={cn(
                    'min-h-9 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                    on ? 'border-transparent bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="conv-start">{tr('Day starts', 'بداية اليوم')}</Label>
            <Input id="conv-start" type="time" className="w-32" value={form.dayStart} disabled={!canEdit} onChange={(e) => setForm({ ...form, dayStart: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conv-end">{tr('Day ends', 'نهاية اليوم')}</Label>
            <Input id="conv-end" type="time" className="w-32" value={form.dayEnd} disabled={!canEdit} onChange={(e) => setForm({ ...form, dayEnd: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="conv-zone">{tr('Time zone', 'المنطقة الزمنية')}</Label>
          <select
            id="conv-zone"
            value={form.timeZone}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, timeZone: e.target.value })}
            className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {canEdit ? (
          <Button onClick={() => void save()} disabled={saving}>{saving ? tr('Saving…', 'جارٍ الحفظ…') : tr('Save response times', 'حفظ أوقات الرد')}</Button>
        ) : (
          <p className="text-xs text-muted-foreground">{tr('Only admins and managers can change these.', 'يمكن للمدراء فقط تغيير هذه الإعدادات.')}</p>
        )}
      </CardContent>
    </Card>
  );
}
