'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import type { Contact } from '@/services/contactService';
import { getPricingProfile, savePricingProfile, type PricingMode } from '@/services/portalAccessService';

type ModeChoice = PricingMode | 'none';

/**
 * How this client's portal prices influencers. There is deliberately no mode
 * that shows the influencer's real rate.
 */
export function PortalPricingSection({ contact }: { contact: Contact }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [mode, setMode] = React.useState<ModeChoice>('none');
  const [markup, setMarkup] = React.useState('');
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    getPricingProfile(contact.companyId, contact.id)
      .then((profile) => {
        if (cancelled) return;
        setMode(profile?.mode ?? 'none');
        setMarkup(profile?.markupPercent != null ? String(profile.markupPercent) : '');
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [contact.companyId, contact.id]);

  const markupValue = Number(markup);
  const markupValid = markup.trim() !== '' && Number.isFinite(markupValue) && markupValue >= 0 && markupValue <= 500;
  const canSave = loaded && mode !== 'none' && (mode === 'retainer' || markupValid);

  const save = async () => {
    if (mode === 'none') return;
    setBusy(true);
    try {
      await savePricingProfile(contact.companyId, contact.id, mode === 'markup' ? { mode, markupPercent: markupValue } : { mode });
      toast({ title: tr('Portal pricing saved', 'تم حفظ تسعير البوابة') });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : tr('Could not save', 'تعذّر الحفظ'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 border-t pt-4">
      <div>
        <h3 className="text-sm font-semibold">{tr('Portal pricing', 'تسعير البوابة')}</h3>
        <p className="text-xs text-muted-foreground">
          {tr(
            'What this client sees as the price of an influencer. They never see the real rate.',
            'ما يراه هذا العميل كسعر للمؤثر. لا يرى السعر الفعلي أبدًا.',
          )}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">{tr('Pricing', 'التسعير')}</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as ModeChoice)} disabled={!loaded}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{tr('Not set (price on request)', 'غير محدد (السعر عند الطلب)')}</SelectItem>
              <SelectItem value="markup">{tr('Rate plus markup', 'السعر مع هامش')}</SelectItem>
              <SelectItem value="retainer">{tr('Included in a retainer', 'مشمول في عقد خدمة')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {mode === 'markup' && (
          <div>
            <Label htmlFor={`markup-${contact.id}`} className="text-xs">{tr('Markup (%)', 'الهامش (%)')}</Label>
            <Input
              id={`markup-${contact.id}`}
              type="number"
              min={0}
              max={500}
              step="0.5"
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
              aria-invalid={markup !== '' && !markupValid}
            />
            {markup !== '' && !markupValid && (
              <p className="mt-1 text-xs text-destructive">{tr('Use a number from 0 to 500.', 'استخدم رقمًا من 0 إلى 500.')}</p>
            )}
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={save} disabled={!canSave || busy}>{tr('Save pricing', 'حفظ التسعير')}</Button>
      </div>
    </section>
  );
}
