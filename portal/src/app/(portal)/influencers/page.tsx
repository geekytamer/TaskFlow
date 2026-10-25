import { DirectoryProvider } from '@/components/directory-filters';
import { DirectoryView } from '@/components/directory-results';
import { EmptyState, PageHeader } from '@/components/ui';
import { getCatalogue } from '@/lib/catalogue';
import { readParams } from '@/lib/directory-view';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { parseShortlist } from '@/lib/shortlist';
import { CompareProvider, CompareTray } from '@/components/compare-pick';
import { ShortlistBar, ShortlistProvider } from '@/components/shortlist';
import { currentLang } from '@/lib/session';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The influencer directory. It loads every creator this client may see once
 * (the backend sends the whole list with this client's own prices) and hands
 * it to the browser, where filters, order and Help me choose answer at once.
 * The URL's filters set the first view, so a shared link opens the same page.
 */
export default async function InfluencersPage({ searchParams }: { searchParams: SearchParams }) {
  requireAudience('client');
  const params = await searchParams;
  const lang = await currentLang();
  const catalogue = await getCatalogue('');
  const shortlist = parseShortlist(params.with);
  const view = (Array.isArray(params.view) ? params.view[0] : params.view) === 'list' ? 'list' : 'cards';

  return (
    <div className="space-y-8">
      <PageHeader title={t(lang, 'cat.title')} subtitle={t(lang, 'cat.subtitle')} />

      {catalogue.total === 0 ? (
        <EmptyState title={t(lang, 'cat.emptyTitle')} body={t(lang, 'cat.emptyBody')} />
      ) : (
        // Keyed on the URL's shortlist: a Back/Forward that restores another
        // page starts from that page's `with`, not the one held in memory.
        <ShortlistProvider key={shortlist.join(',')} initial={shortlist}>
          <CompareProvider>
          <DirectoryProvider initialValues={readParams(params)} initialView={view}>
            <DirectoryView all={catalogue.items} facets={catalogue.facets} currency={catalogue.currency} lang={lang} markSrc={process.env.PORTAL_MARK_URL || null} />
          </DirectoryProvider>
          <ShortlistBar lang={lang} />
          <CompareTray lang={lang} />
          </CompareProvider>
        </ShortlistProvider>
      )}
    </div>
  );
}
