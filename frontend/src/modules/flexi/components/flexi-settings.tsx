'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { getFlexiSettings, saveFlexiSettings, type FlexiSettings } from '@/services/flexiService';
import { useCanManageFlexi } from '@/modules/flexi/lib/use-can-manage-flexi';
import { PageTitle, shortDate, useCompanyLoad, useTr } from './flexi-ui';

const MONTH_CHOICES = [1, 2, 3, 4, 6, 9, 12, 18, 24];

/** The standard balance, default terms, allowed months and the client terms text. */
export function FlexiSettingsPage() {
  const { tr, language } = useTr();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const canManage = useCanManageFlexi();
  const { data, setData } = useCompanyLoad(selectedCompany?.id, getFlexiSettings, (m) => toast({ title: m, variant: 'destructive' }));
  const [draft, setDraft] = React.useState<FlexiSettings | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (data) setDraft(data); }, [data]);

  if (!draft) return <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>;
  const set = <K extends keyof FlexiSettings>(key: K, value: FlexiSettings[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const toggleMonth = (m: number) => {
    const next = draft.allowedMonths.includes(m) ? draft.allowedMonths.filter((x) => x !== m) : [...draft.allowedMonths, m].sort((a, b) => a - b);
    set('allowedMonths', next);
  };

  async function save() {
    if (!selectedCompany || !draft) return;
    setBusy(true);
    try {
      const saved = await saveFlexiSettings(selectedCompany.id, {
        standardAmount: Number(draft.standardAmount), defaultUpfrontPct: Number(draft.defaultUpfrontPct), allowedMonths: draft.allowedMonths,
        activationMonths: Number(draft.activationMonths), increaseMonths: Number(draft.increaseMonths), termsAr: draft.termsAr, termsEn: draft.termsEn,
      });
      setData(saved);
      toast({ title: saved.termsVersion !== data?.termsVersion ? tr(`Saved. Terms are now version ${saved.termsVersion}; new applications must accept them.`, `تم الحفظ. الشروط صارت النسخة ${saved.termsVersion}، والطلبات الجديدة لازم توافق عليها.`) : tr('Saved.', 'تم الحفظ.') });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : tr('Could not save', 'تعذّر الحفظ'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  const ro = !canManage;
  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle title={tr('Peak Flexi settings', 'إعدادات بيك فلكسي')} subtitle={ro ? tr('Only Admins and Accountants can change these.', 'التعديل للأدمن والمحاسب بس.') : undefined} />
      <Card>
        <CardHeader><CardTitle className="text-base">{tr('Balance and terms', 'الرصيد والشروط')}</CardTitle><CardDescription>{tr('Defaults the reviewer starts from. Each client can still get their own.', 'القيم اللي يبدأ منها المراجع، وكل عميل ممكن ياخذ غيرها.')}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="fs-standard">{tr('Standard balance', 'الرصيد الأساسي')}</Label><Input id="fs-standard" type="number" min={1} disabled={ro} value={draft.standardAmount} onChange={(e) => set('standardAmount', e.target.value as unknown as number)} /></div>
            <div className="space-y-1"><Label htmlFor="fs-upfront">{tr('Default down payment %', 'الدفعة المقدمة الافتراضية %')}</Label><Input id="fs-upfront" type="number" min={0} max={100} disabled={ro} value={draft.defaultUpfrontPct} onChange={(e) => set('defaultUpfrontPct', e.target.value as unknown as number)} /></div>
          </div>
          <div className="space-y-2">
            <Label>{tr('Allowed instalment months', 'مدد الأقساط المسموحة')}</Label>
            <div className="flex flex-wrap gap-2">
              {MONTH_CHOICES.map((m) => (
                <Button key={m} type="button" size="sm" disabled={ro} variant={draft.allowedMonths.includes(m) ? 'default' : 'outline'} aria-pressed={draft.allowedMonths.includes(m)} onClick={() => toggleMonth(m)}>{m}</Button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <MonthSelect id="fs-activation" label={tr('Max months for a new balance', 'أقصى مدة للرصيد الجديد')} value={draft.activationMonths} options={draft.allowedMonths} disabled={ro} onChange={(v) => set('activationMonths', v)} />
            <MonthSelect id="fs-increase" label={tr('Max months after an increase', 'أقصى مدة بعد الزيادة')} value={draft.increaseMonths} options={draft.allowedMonths} disabled={ro} onChange={(v) => set('increaseMonths', v)} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tr('Client terms', 'شروط العميل')} · {tr('version', 'النسخة')} {draft.termsVersion}</CardTitle>
          <CardDescription>{tr('Clients must accept these before applying. Changing them makes a new version. Have them checked by a lawyer.', 'العميل لازم يوافق عليها قبل ما يقدّم. أي تعديل يعمل نسخة جديدة. خلّ محامي يراجعها.')}{draft.updatedAt ? ` · ${tr('updated', 'آخر تعديل')} ${shortDate(draft.updatedAt, language)}` : ''}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1"><Label htmlFor="fs-ar">العربية</Label><Textarea id="fs-ar" dir="rtl" rows={8} disabled={ro} value={draft.termsAr} onChange={(e) => set('termsAr', e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="fs-en">English</Label><Textarea id="fs-en" dir="ltr" rows={8} disabled={ro} value={draft.termsEn} onChange={(e) => set('termsEn', e.target.value)} /></div>
        </CardContent>
      </Card>
      {canManage && <Button disabled={busy || draft.allowedMonths.length === 0} onClick={save}>{tr('Save settings', 'احفظ الإعدادات')}</Button>}
    </div>
  );
}

function MonthSelect({ id, label, value, options, disabled, onChange }: { id: string; label: string; value: number; options: number[]; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} disabled={disabled} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
        {(options.includes(value) ? options : [...options, value].sort((a, b) => a - b)).map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  );
}
