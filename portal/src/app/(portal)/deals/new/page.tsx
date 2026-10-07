import { DealForm } from '@/components/deal-form';
import { PageHeader } from '@/components/ui';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { currentLang } from '@/lib/session';
import { getContacts, getWorkspaceSettings } from '@/lib/workspace';

export default async function NewDealPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  requireAudience('influencer');
  const lang = await currentLang();
  const preset = (await searchParams).contact;
  const [contacts, settings] = await Promise.all([getContacts(), getWorkspaceSettings()]);
  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader title={t(lang, 'deal.new')} back={{ href: '/deals', label: t(lang, 'deal.back') }} />
      <DealForm lang={lang} contacts={contacts} defaultCurrency={settings.defaultCurrency} presetContactId={typeof preset === 'string' ? preset : undefined} />
    </div>
  );
}
