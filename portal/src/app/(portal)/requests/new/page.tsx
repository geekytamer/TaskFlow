import { RequestWizard } from '@/components/request-wizard';
import { getCatalogue } from '@/lib/catalogue';
import { formatCompact, listSep } from '@/lib/format';
import { nicheLabel } from '@/lib/directory-labels';
import { splitNiches } from '@/lib/directory-match';
import { isUnavailable } from '@/lib/directory-view';
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

  // Creators marked unavailable cannot be requested, so they are not offered.
  const options = catalogue.items.filter((entry) => !isUnavailable(entry)).map((entry) => ({
    id: entry.id,
    name: entry.name,
    photoAt: entry.photoAt,
    followers: formatCompact(entry.followers, lang),
    niche: splitNiches(entry.niche).map((n) => nicheLabel(n, lang)).slice(0, 2).join(listSep(lang)),
  }));

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader back={{ href: '/requests', label: t(lang, 'req.back') }} title={t(lang, 'wiz.pageTitle')} subtitle={t(lang, 'wiz.pageSubtitle')}
        actions={<span className="inline-flex h-9 items-center gap-2 rounded-full border border-white/[0.16] px-4 text-sm text-ink">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></svg>
          {t(lang, 'wiz.time')}
        </span>} />
      <RequestWizard lang={lang} currency={catalogue.currency} options={options} platforms={catalogue.facets.platforms} preselected={preselected} />
    </div>
  );
}
