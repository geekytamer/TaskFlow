import Link from 'next/link';
import { RequestForm } from '@/components/request-form';
import { getCatalogue } from '@/lib/catalogue';
import { formatCompact } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  requireAudience('client');
  const lang = await currentLang();
  const params = await searchParams;
  const preselected = ([] as string[]).concat(params.with ?? []);
  const catalogue = await getCatalogue('');

  const options = catalogue.items.map((entry) => {
    const top = [...entry.platforms].sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))[0];
    const detail = [entry.niche, top ? `${top.platform} ${formatCompact(top.followers, lang)}` : null].filter(Boolean).join(', ');
    return { id: entry.id, name: entry.name, detail };
  });

  return (
    <div className="max-w-3xl space-y-10">
      <Link href="/requests" className="text-sm font-medium text-ink-soft underline underline-offset-4 hover:text-ink">{t(lang, 'req.back')}</Link>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t(lang, 'req.new')}</h1>
        <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'req.subtitle')}</p>
      </header>
      <RequestForm lang={lang} currency={catalogue.currency} options={options} platforms={catalogue.facets.platforms} preselected={preselected} />
    </div>
  );
}
