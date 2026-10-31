import { redirect } from 'next/navigation';
import { FlexiApplyForm } from '@/components/flexi-apply-form';
import { PageHeader } from '@/components/ui';
import { getFlexi } from '@/lib/flexi';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

export default async function FlexiActivatePage() {
  requireAudience('client');
  const lang = await currentLang();
  const data = await getFlexi();
  if (data.open) redirect('/');
  if (data.balance.enabled) redirect('/flexi/increase');
  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader back={{ href: '/', label: t(lang, 'fx.back') }} title={t(lang, 'fx.activateTitle')} subtitle={t(lang, 'fx.activateSubtitle')} />
      <FlexiApplyForm lang={lang} kind="activation" balance={data.balance.balance} currency={data.currency} />
    </div>
  );
}
