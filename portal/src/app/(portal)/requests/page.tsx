import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState, PageHeader, RowLink, SectionTitle, button, list } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { getProposals, getRequests } from '@/lib/requests';
import { currentLang } from '@/lib/session';

/**
 * Requests the client sent and proposals the team sent back. A proposal can
 * arrive without a request, so open proposals lead the page on their own.
 */
export default async function RequestsPage() {
  requireAudience('client');
  const lang = await currentLang();
  const [requests, proposals] = await Promise.all([getRequests(), getProposals()]);
  const fromRequests = new Set(requests.flatMap((r) => r.proposals.map((p) => p.id)));
  const waiting = proposals.filter((p) => p.status === 'sent');
  const answered = proposals.filter((p) => p.status !== 'sent' && !fromRequests.has(p.id));

  return (
    <div className="space-y-10">
      <PageHeader
        title={t(lang, 'req.titleBoth')}
        subtitle={t(lang, 'req.subtitle')}
        actions={<Link href="/requests/new" className={button.primary}>{t(lang, 'req.new')}</Link>}
      />

      {waiting.length > 0 && (
        <section aria-labelledby="waiting-title">
          <SectionTitle id="waiting-title">{t(lang, 'req.waiting')}</SectionTitle>
          <ul className={list}>
            {waiting.map((p) => (
              <li key={p.id}>
                <RowLink href={`/proposals/${p.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <p className="min-w-0 truncate font-semibold"><bdi>{p.title}</bdi></p>
                    <StatusBadge lang={lang} proposal={p.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-ink-soft">{t(lang, 'prop.title')} <bdi dir="ltr">{p.number}</bdi></p>
                </RowLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="requests-title">
        <SectionTitle id="requests-title">{t(lang, 'req.yours')}</SectionTitle>
        {requests.length === 0 ? (
          <EmptyState title={t(lang, 'req.emptyTitle')} body={t(lang, 'req.emptyBody')}
            action={<Link href="/influencers" className={button.secondary}>{t(lang, 'dash.client.browse')}</Link>} />
        ) : (
          <ul className={list}>
            {requests.map((r) => (
              <li key={r.id}>
                <RowLink href={`/requests/${r.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <p className="min-w-0 truncate font-semibold"><bdi>{r.title}</bdi></p>
                    <StatusBadge lang={lang} request={r.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-ink-soft">{t(lang, 'req.created')} <bdi>{formatDate(r.createdAt, lang)}</bdi></p>
                </RowLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      {answered.length > 0 && (
        <section aria-labelledby="answered-title">
          <SectionTitle id="answered-title">{t(lang, 'req.otherProposals')}</SectionTitle>
          <ul className={list}>
            {answered.map((p) => (
              <li key={p.id}>
                <RowLink href={`/proposals/${p.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <p className="min-w-0 truncate font-medium"><bdi>{p.title}</bdi></p>
                    <StatusBadge lang={lang} proposal={p.status} />
                  </div>
                </RowLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
