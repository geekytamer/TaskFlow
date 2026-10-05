import { RequestForm } from '@/components/request-form';
import { getCatalogue } from '@/lib/catalogue';
import { formatCompact, listSep } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { currentLang } from '@/lib/session';
import { PageHeader } from '@/components/ui';

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  requireAudience('client');
  const lang = await currentLang();
  const params = await searchParams;
  const preselected = ([] as string[]).concat(params.with ?? []);
  const catalogue = await getCatalogue('');

  const options = catalogue.items.map((entry) => {
    const top = [...entry.platforms].sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))[0];
    const detail = [entry.niche, top ? `${top.platform} ${formatCompact(top.followers, lang)}` : null].filter(Boolean).join(listSep(lang));
    return { id: entry.id, name: entry.name, detail };
  });

  return (
    <div className="max-w-3xl space-y-10">
      <PageHeader back={{ href: '/requests', label: t(lang, 'req.back') }} title={t(lang, 'req.new')} subtitle={t(lang, 'req.subtitle')} />
      <RequestForm lang={lang} currency={catalogue.currency} options={options} platforms={catalogue.facets.platforms} preselected={preselected} />
    </div>
  );
}
