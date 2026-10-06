'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { getReminderSettings, setReminderSettings, type ReminderSettings } from '@/services/clientEmailService';

/** Whether clients get emailed reminders for overdue invoices, and on which days past due. */
export function ClientRemindersPanel({ canEdit }: { canEdit: boolean }) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<ReminderSettings | null>(null);
  const [days, setDays] = React.useState('');

  React.useEffect(() => {
    if (!selectedCompany) return;
    getReminderSettings(selectedCompany.id).then((s) => { setSettings(s); setDays(s.days.join(', ')); }).catch(() => setSettings(null));
  }, [selectedCompany]);
  if (!selectedCompany || !settings) return null;

  const save = async (enabled: boolean) => {
    const list = days.split(/[\s,]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    try {
      const next = await setReminderSettings(selectedCompany.id, { enabled, days: list.length ? list : undefined });
      setSettings(next); setDays(next.days.join(', '));
      toast({ title: tr('Reminder settings saved', 'تم حفظ إعدادات التذكير') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not save', 'تعذّر الحفظ'), description: error?.message });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr('Payment reminders to clients', 'تذكير العملاء بالدفع')}</CardTitle>
        <CardDescription>{tr('Clients get a polite email when an invoice is overdue, once at each step. Practice companies never email.', 'يتلقى العملاء بريداً لطيفاً عند تأخر فاتورة، مرة عند كل مرحلة. الشركات التدريبية لا ترسل بريداً أبداً.')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!settings.emailConfigured && (
          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{tr('Email is not set up on this server yet, so nothing will be sent until the provider key is added.', 'لم يُضبط البريد على هذا الخادم بعد، فلن يُرسل شيء حتى يُضاف مفتاح المزوّد.')}
          </p>
        )}
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={settings.enabled} disabled={!canEdit} onCheckedChange={(v) => save(v)} />
          {settings.enabled ? tr('On', 'مفعّل') : tr('Off', 'متوقف')}
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="rem-days">{tr('Days past due', 'أيام بعد الاستحقاق')}</Label>
            <Input id="rem-days" className="w-48" value={days} disabled={!canEdit} onChange={(e) => setDays(e.target.value)} placeholder="1, 7, 14, 30" />
          </div>
          {canEdit && <Button variant="outline" onClick={() => save(settings.enabled)}>{tr('Save days', 'حفظ الأيام')}</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
