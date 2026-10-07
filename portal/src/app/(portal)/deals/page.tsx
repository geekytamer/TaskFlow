import Link from 'next/link';
import { DealFilter, DealGroup, OfferCard } from '@/components/deal-list';
import { EmptyState, PageHeader, button } from '@/components/ui';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { getAssignments } from '@/lib/influencer';
import { currentLang } from '@/lib/session';
import { dealSort, getDeals, isOffer } from '@/lib/workspace';

export default async function DealsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  requireAudience('influencer');
  const lang = await currentLang();
  const raw = (await searchParams).source;
  const current = raw === 'own' || raw === 'peak' ? raw : 'all';
  const [all, assignments] = await Promise.all([getDeals(), getAssignments()]);
  const counts = { all: all.length, own: all.filter((d) => d.source === 'own').length, peak: all.filter((d) => d.source === 'peak').length };
  const shown = dealSort(current === 'all' ? all : all.filter((d) => d.source === current));
  const offers = current === 'own' ? [] : assignments.filter((a) => a.status === 'awaiting_reply');
  const live = shown.filter((d) => !isOffer(d) && d.status !== 'paid' && d.status !== 'cancelled');
  const closed = shown.filter((d) => d.status === 'paid' || d.status === 'cancelled');

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        title={t(lang, 'deal.title')}
        subtitle={t(lang, 'deal.subtitle')}
        actions={<Link href="/deals/new" className={button.primary}>{t(lang, 'deal.new')}</Link>}
      />

      {all.length === 0 ? (
        <EmptyState
          title={t(lang, 'deal.emptyTitle')}
          body={t(lang, 'deal.emptyBody')}
          action={<Link href="/deals/new" className={button.primary}>{t(lang, 'deal.new')}</Link>}
        />
      ) : (
        <>
          <DealFilter lang={lang} current={current} counts={counts} />
          {offers.length > 0 && (
            <section aria-labelledby="offers-title" className="space-y-3">
              <h2 id="offers-title" className="text-base font-semibold">{t(lang, 'deal.offers')}</h2>
              {offers.map((o) => <OfferCard key={o.id} offer={o} lang={lang} />)}
            </section>
          )}
          <DealGroup title={t(lang, 'deal.live')} deals={live} lang={lang} />
          <DealGroup title={t(lang, 'deal.closed')} deals={closed} lang={lang} />
          {offers.length === 0 && live.length === 0 && closed.length === 0 && <p className="text-ink-soft">{t(lang, 'deal.emptyFiltered')}</p>}
        </>
      )}
    </div>
  );
}
