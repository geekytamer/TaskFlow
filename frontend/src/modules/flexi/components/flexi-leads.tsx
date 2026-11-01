'use client';

import * as React from 'react';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { inviteFlexiLead, listFlexiLeads } from '@/services/flexiService';
import { useCanManageFlexi } from '@/modules/flexi/lib/use-can-manage-flexi';
import { EmptyState, PageTitle, shortDate, useCompanyLoad, useTr } from './flexi-ui';

/** Companies that applied on the public page and have no portal account yet. */
export function FlexiLeadsPage() {
  const { tr, language } = useTr();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const canManage = useCanManageFlexi();
  const { data, reload } = useCompanyLoad(selectedCompany?.id, listFlexiLeads, (m) => toast({ title: m, variant: 'destructive' }));
  const [busy, setBusy] = React.useState<string | null>(null);

  async function invite(contactId: string) {
    if (!selectedCompany) return;
    setBusy(contactId);
    try {
      const result = await inviteFlexiLead(selectedCompany.id, contactId);
      toast({
        title: result.emailSent ? tr('Invitation sent.', 'انرسلت الدعوة.') : tr('Invitation created, but the email did not go out. Copy the link from the contact page.', 'انعملت الدعوة، بس الإيميل ما انرسل. انسخ الرابط من صفحة جهة الاتصال.'),
      });
      reload();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : tr('Could not invite', 'تعذّرت الدعوة'), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle title={tr('Website leads', 'عملاء محتملين')} subtitle={tr('Companies that applied on the Peak Flexi page and have no portal account yet.', 'شركات قدّمت من صفحة بيك فلكسي وما عندها حساب في البوابة لسا.')} />
      {data === null ? (
        <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>
      ) : data.length === 0 ? (
        <EmptyState icon={UserPlus} title={tr('No leads waiting', 'ما فيه عملاء ينتظرون')} body={tr('When a company applies on the public page it appears here until you invite it to the portal.', 'لما تقدّم شركة من الصفحة العامة تظهر هنا لين تدعوها للبوابة.')} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {data.map((l) => (
            <li key={l.contactId} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_auto] md:items-center md:gap-6">
              <span className="min-w-0">
                <Link href={`/contacts/${l.contactId}`} className="truncate font-semibold hover:text-primary">{l.company}</Link>
                <span className="block text-sm text-muted-foreground">{[l.person, l.role].filter(Boolean).join(' · ')} · {shortDate(l.createdAt, language)}</span>
              </span>
              <span className="min-w-0 text-sm">
                <span className="block truncate" dir="ltr">{[l.phone, l.email].filter(Boolean).join(' · ')}</span>
                <span className="block truncate text-muted-foreground">{[l.crNumber && `${tr('CR', 'السجل')} ${l.crNumber}`, l.services].filter(Boolean).join(' · ')}</span>
              </span>
              {canManage && (
                <span className="flex flex-col items-start gap-1 md:items-end">
                  <Button size="sm" disabled={!l.email || busy === l.contactId} onClick={() => invite(l.contactId)}>{tr('Invite to the portal', 'ادعه للبوابة')}</Button>
                  {!l.email && <span className="text-xs text-muted-foreground">{tr('No email: add one on the contact first.', 'ما فيه إيميل: أضفه في جهة الاتصال أول.')}</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
