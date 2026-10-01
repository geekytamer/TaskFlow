'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { getContact, type Contact } from '@/services/contactService';
import { decideChangeRequest, listChangeRequests, type ProfileChangeRequest } from '@/services/portalAccessService';

type Tr = (en: string, ar: string) => string;

const fieldLabel = (tr: Tr, key: string) => ({
  niche: tr('Niche', 'المجال'),
  location: tr('Location', 'الموقع'),
  languages: tr('Languages', 'اللغات'),
  rateCardAmount: tr('Rate card', 'الأسعار'),
  accounts: tr('Accounts', 'الحسابات'),
} as Record<string, string>)[key] ?? key;

/** Old value next to the requested one, so staff see exactly what would change. */
function describe(contact: Contact, key: string, value: unknown): { before: string; after: string } {
  const show = (v: unknown) => (v === undefined || v === null || v === '' ? '-' : Array.isArray(v) ? v.join(', ') : String(v));
  if (key === 'accounts') {
    const list = (value as Array<Record<string, unknown>>).map((a) => `${a.platform} ${a.handle ?? ''} ${a.followers != null ? `(${a.followers})` : ''}`.trim());
    const current = (contact.influencerAccounts ?? []).map((a) => `${a.platform} ${a.handle ?? ''} ${a.followers != null ? `(${a.followers})` : ''}`.trim());
    return { before: current.join(' · ') || '-', after: list.join(' · ') };
  }
  const current = { niche: contact.influencerNiche, location: contact.location, languages: contact.languages, rateCardAmount: contact.rateCardAmount }[key];
  return { before: show(current), after: show(value) };
}

/** Profile changes an influencer asked for in the portal, waiting for staff. */
export function ChangeRequestsSection({ contact, onApplied }: { contact: Contact; onApplied?: (updated: Contact) => void }) {
  const { language } = useI18n();
  const tr: Tr = (en, ar) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [requests, setRequests] = React.useState<ProfileChangeRequest[] | null>(null);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setRequests(await listChangeRequests(contact.companyId, contact.id));
    } catch {
      setRequests([]);
    }
  }, [contact.companyId, contact.id]);

  React.useEffect(() => { void load(); }, [load]);

  const pending = requests?.find((r) => r.status === 'pending');
  if (!pending) return null;

  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(true);
    try {
      await decideChangeRequest(contact.companyId, contact.id, pending.id, decision, note || undefined);
      toast({ title: decision === 'approve' ? tr('Changes applied', 'تم تطبيق التعديلات') : tr('Request rejected', 'تم رفض الطلب') });
      setNote('');
      await load();
      if (decision === 'approve' && onApplied) onApplied(await getContact(contact.id));
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : tr('Could not save', 'تعذّر الحفظ'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-md border border-primary/40 p-3">
      <div>
        <h3 className="text-sm font-semibold">{tr('Profile changes requested', 'تعديلات مطلوبة على الملف')}</h3>
        <p className="text-xs text-muted-foreground">
          {tr('Requested in the portal by', 'طُلبت عبر البوابة من')} {pending.requestedBy ?? '-'} · {new Date(pending.createdAt).toLocaleDateString(language === 'ar' ? 'ar-u-nu-latn' : 'en')}
        </p>
      </div>
      <dl className="space-y-2 text-sm">
        {Object.entries(pending.changes).map(([key, value]) => {
          const { before, after } = describe(contact, key, value);
          return (
            <div key={key} className="grid gap-1 sm:grid-cols-[110px_1fr]">
              <dt className="text-muted-foreground">{fieldLabel(tr, key)}</dt>
              <dd>
                <span className="text-muted-foreground line-through" dir="auto">{before}</span>
                <span className="mx-1.5" aria-hidden="true">{language === 'ar' ? '←' : '→'}</span>
                <span className="sr-only">{tr('becomes', 'يصبح')}</span>
                <span className="font-medium" dir="auto">{after}</span>
              </dd>
            </div>
          );
        })}
      </dl>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={tr('Note to the influencer (optional)', 'ملاحظة للمؤثر (اختياري)')}
        aria-label={tr('Note to the influencer', 'ملاحظة للمؤثر')}
        dir="auto"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => decide('reject')}>{tr('Reject', 'رفض')}</Button>
        <Button type="button" size="sm" disabled={busy} onClick={() => decide('approve')}>{tr('Approve and apply', 'اعتماد وتطبيق')}</Button>
      </div>
    </section>
  );
}
