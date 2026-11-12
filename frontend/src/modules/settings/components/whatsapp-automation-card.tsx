'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import {
  getWhatsappAutomation,
  getWhatsappOptOuts,
  saveWhatsappAutomation,
  setWhatsappOptOut,
  type WhatsAppAutomation,
} from '@/services/whatsappService';
import { BellOff, Bot, Loader2, X } from 'lucide-react';

/**
 * Welcome and away messages, and the numbers that asked not to get
 * campaigns. Working hours come from Settings → Inbox response times.
 */
export function WhatsappAutomationCard() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const companyId = selectedCompany?.id;
  const [value, setValue] = React.useState<WhatsAppAutomation | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [optOuts, setOptOuts] = React.useState<Array<{ phone: string; reason?: string; createdAt: string }>>([]);
  const [newOptOut, setNewOptOut] = React.useState('');

  const load = React.useCallback(async () => {
    if (!companyId) return;
    try {
      const [auto, outs] = await Promise.all([getWhatsappAutomation(companyId), getWhatsappOptOuts(companyId)]);
      setValue(auto);
      setOptOuts(outs);
    } catch {
      setValue({ welcomeEnabled: false, welcomeText: '', awayEnabled: false, awayText: '' });
    }
  }, [companyId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!companyId || !value) return;
    setSaving(true);
    try {
      setValue(await saveWhatsappAutomation(companyId, value));
      toast({ title: tr('Saved', 'تم الحفظ') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not save', 'تعذّر الحفظ'), description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const changeOptOut = async (phone: string, optedOut: boolean) => {
    if (!companyId) return;
    try {
      await setWhatsappOptOut(companyId, phone, optedOut);
      setNewOptOut('');
      setOptOuts(await getWhatsappOptOuts(companyId));
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not save', 'تعذّر الحفظ'), description: error?.message });
    }
  };

  if (!companyId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          {tr('Automatic replies', 'الردود التلقائية')}
        </CardTitle>
        <CardDescription>
          {tr(
            'Sent by themselves when a customer writes. Working hours are those of Settings → Inbox response times.',
            'تُرسل تلقائياً عندما يكتب العميل. ساعات الدوام هي نفسها في الإعدادات ← أوقات الرد.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!value ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            {([
              ['welcome', tr('Welcome message', 'رسالة الترحيب'), tr('To a number\'s very first message.', 'لأول رسالة من رقم جديد.')],
              ['away', tr('Away message', 'رسالة خارج الدوام'), tr('Outside working hours, at most once per chat every 12 hours.', 'خارج ساعات الدوام، مرة واحدة كل ١٢ ساعة لكل محادثة.')],
            ] as const).map(([key, title, hint]) => {
              const enabledKey = key === 'welcome' ? 'welcomeEnabled' : 'awayEnabled';
              const textKey = key === 'welcome' ? 'welcomeText' : 'awayText';
              return (
                <div key={key} className="space-y-2 rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label htmlFor={`wa-auto-${key}`} className="text-sm font-semibold">{title}</Label>
                      <p className="text-xs text-muted-foreground">{hint}</p>
                    </div>
                    <Switch
                      id={`wa-auto-${key}`}
                      checked={value[enabledKey]}
                      onCheckedChange={(checked) => setValue((v) => (v ? { ...v, [enabledKey]: checked } : v))}
                    />
                  </div>
                  <Textarea
                    rows={3}
                    maxLength={1000}
                    value={value[textKey]}
                    onChange={(e) => setValue((v) => (v ? { ...v, [textKey]: e.target.value } : v))}
                    placeholder={
                      key === 'welcome'
                        ? tr('Hello and welcome! How can we help?', 'أهلاً وسهلاً! كيف نقدر نخدمك؟')
                        : tr('We are closed now and will reply first thing tomorrow.', 'نحن خارج الدوام الآن، وسنرد عليك صباح الغد.')
                    }
                  />
                </div>
              );
            })}
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {tr('Save', 'حفظ')}
            </Button>

            <div className="space-y-2 rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <BellOff className="h-4 w-4" />
                {tr('Not in campaigns', 'مستبعدون من الحملات')}
              </div>
              <p className="text-xs text-muted-foreground">
                {tr('A customer who writes "stop" or "إيقاف" is added here by themselves.', 'يُضاف هنا تلقائياً كل عميل يكتب «إيقاف» أو «stop».')}
              </p>
              <div className="flex gap-2">
                <Input dir="ltr" value={newOptOut} onChange={(e) => setNewOptOut(e.target.value)} placeholder="+968 9xxx xxxx" className="h-9" />
                <Button variant="outline" size="sm" disabled={newOptOut.replace(/\D/g, '').length < 7} onClick={() => changeOptOut(newOptOut, true)}>
                  {tr('Add', 'إضافة')}
                </Button>
              </div>
              {optOuts.length === 0 ? (
                <p className="text-xs text-muted-foreground">{tr('Nobody yet.', 'لا أحد بعد.')}</p>
              ) : (
                <ul className="divide-y text-sm">
                  {optOuts.map((o) => (
                    <li key={o.phone} className="flex items-center justify-between gap-2 py-1.5">
                      <span dir="ltr">+{o.phone}</span>
                      <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => changeOptOut(o.phone, false)} aria-label={tr(`Put +${o.phone} back`, `إعادة +${o.phone}`)} title={tr('Put back', 'إعادة')}>
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
