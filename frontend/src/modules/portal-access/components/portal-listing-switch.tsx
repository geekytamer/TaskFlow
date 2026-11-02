'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/context/i18n-context';
import { usePermissions } from '@/context/permissions-context';
import { HiddenValue } from '@/components/hidden-value';
import { useToast } from '@/hooks/use-toast';
import type { Contact } from '@/services/contactService';
import { getPortalPriceRange, listPortalCatalogue, setPortalListing, setPortalPriceRange } from '@/services/portalAccessService';

/**
 * Whether this influencer appears in the client portal (on unless staff hide
 * them), and the price range clients see around their own price.
 */
export function PortalListingSwitch({ contact }: { contact: Contact }) {
  const { language } = useI18n();
  // The price range sits around the influencer's rate card (sensitive field).
  const rateCards = usePermissions().field('rate_cards');
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [listed, setListed] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setListed(null);
    listPortalCatalogue(contact.companyId)
      .then((ids) => { if (!cancelled) setListed(ids.includes(contact.id)); })
      .catch(() => { if (!cancelled) setListed(false); });
    return () => { cancelled = true; };
  }, [contact.companyId, contact.id]);

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      await setPortalListing(contact.companyId, contact.id, next);
      setListed(next);
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : tr('Could not update', 'تعذّر التحديث'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const id = `portal-listing-${contact.id}`;
  return (
    <div className="space-y-3 rounded-md border p-3">
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={id} className="text-sm font-semibold">{tr('Show in client portal', 'إظهار في بوابة العملاء')}</Label>
        <p className="text-xs text-muted-foreground">
          {tr(
            'Clients see the profile and accounts, and a price from their own terms. Never the rate, contact details or notes.',
            'يرى العملاء الملف والحسابات وسعرًا وفق شروطهم، ولا يرون أبدًا السعر الفعلي أو بيانات التواصل أو الملاحظات.',
          )}
        </p>
      </div>
      <Switch id={id} checked={Boolean(listed)} disabled={listed === null || busy} onCheckedChange={toggle} />
    </div>
    {rateCards.view ? (
      <PriceRangeFields contact={contact} canEdit={rateCards.edit} />
    ) : (
      <div className="space-y-1 border-t pt-3">
        <p className="text-sm font-semibold">{tr('Price range shown to clients', 'نطاق السعر المعروض للعملاء')}</p>
        <HiddenValue className="text-sm" />
      </div>
    )}
    </div>
  );
}

/** Clients see "price − below% to price + above%", never the price itself. */
function PriceRangeFields({ contact, canEdit }: { contact: Contact; canEdit: boolean }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [below, setBelow] = React.useState('');
  const [above, setAbove] = React.useState('');
  const [saved, setSaved] = React.useState<{ below: string; above: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    getPortalPriceRange(contact.companyId, contact.id)
      .then((r) => {
        if (cancelled) return;
        const next = { below: String(r.belowPercent), above: String(r.abovePercent) };
        setBelow(next.below); setAbove(next.above); setSaved(next);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [contact.companyId, contact.id]);

  const save = async () => {
    const b = Number(below);
    const a = Number(above);
    if (below === '' || above === '' || !(b >= 0 && b <= 90) || !(a >= 0 && a <= 300)) {
      toast({ title: tr('Below must be 0 to 90% and above 0 to 300%.', 'يجب أن يكون الأدنى بين 0 و90٪ والأعلى بين 0 و300٪.'), variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const r = await setPortalPriceRange(contact.companyId, contact.id, { belowPercent: b, abovePercent: a });
      setSaved({ below: String(r.belowPercent), above: String(r.abovePercent) });
      toast({ title: tr('Price range saved', 'تم حفظ نطاق السعر') });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : tr('Could not update', 'تعذّر التحديث'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const dirty = saved !== null && (saved.below !== below || saved.above !== above);
  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-sm font-semibold">{tr('Price range shown to clients', 'نطاق السعر المعروض للعملاء')}</p>
      <p className="text-xs text-muted-foreground">
        {tr('Around each client\'s own price. Default 30% below to 30% above.', 'حول سعر كل عميل. الافتراضي 30٪ أقل إلى 30٪ أعلى.')}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={`range-below-${contact.id}`} className="text-xs">{tr('Below (%)', 'أقل (٪)')}</Label>
          <Input id={`range-below-${contact.id}`} type="number" inputMode="decimal" min={0} max={90} value={below} onChange={(e) => setBelow(e.target.value)} className="h-9 w-24" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`range-above-${contact.id}`} className="text-xs">{tr('Above (%)', 'أعلى (٪)')}</Label>
          <Input id={`range-above-${contact.id}`} type="number" inputMode="decimal" min={0} max={300} value={above} onChange={(e) => setAbove(e.target.value)} className="h-9 w-24" />
        </div>
        <Button type="button" size="sm" variant="secondary" disabled={!dirty || busy || !canEdit} onClick={save}>{tr('Save range', 'حفظ النطاق')}</Button>
      </div>
    </div>
  );
}
