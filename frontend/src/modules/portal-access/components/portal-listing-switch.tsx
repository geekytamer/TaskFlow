'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import type { Contact } from '@/services/contactService';
import { listPortalCatalogue, setPortalListing } from '@/services/portalAccessService';

/** Whether this influencer appears in the client portal's catalogue. Off until staff turn it on. */
export function PortalListingSwitch({ contact }: { contact: Contact }) {
  const { language } = useI18n();
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
    <div className="flex items-start justify-between gap-4 rounded-md border p-3">
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
  );
}
