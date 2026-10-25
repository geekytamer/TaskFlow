import { CompareView } from '@/components/compare-view';
import { EmptyState, PageHeader } from '@/components/ui';
import { getCatalogue } from '@/lib/catalogue';
import { readCompareIds } from '@/lib/compare';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Two or three creators side by side. The picks come from the URL (?ids=),
 * so a comparison opened from the directory, or shared, shows the same people.
 */
export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  requireAudience('client');
  const params = await searchParams;
  const lang = await currentLang();
  const catalogue = await getCatalogue('');
  const initial = readCompareIds(params.ids, new Set(catalogue.items.map((e) => e.id)));

  return (
    <div className="space-y-8">
      <PageHeader title={t(lang, 'cmp.title')} subtitle={t(lang, 'cmp.subtitle')} />
      {catalogue.total === 0
        ? <EmptyState title={t(lang, 'cat.emptyTitle')} body={t(lang, 'cat.emptyBody')} />
        : <CompareView all={catalogue.items} initial={initial} lang={lang} />}
    </div>
  );
}
