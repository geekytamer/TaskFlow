import Link from 'next/link';
import { Progress } from '@/components/client-home';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState, PageHeader, RowLink, SectionTitle, button, list } from '@/components/ui';
import { getCampaigns, type CampaignSummary } from '@/lib/campaigns';
import { formatDate } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t, type Lang } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

const FINISHED = new Set(['completed', 'cancelled', 'archived']);

function CampaignList({ campaigns, lang }: { campaigns: CampaignSummary[]; lang: Lang }) {
  return (
    <ul className={list}>
      {campaigns.map((c) => (
        <li key={c.id}>
          <RowLink href={`/campaigns/${c.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <p className="min-w-0 truncate font-semibold"><bdi>{c.name}</bdi></p>
              <StatusBadge lang={lang} campaign={c.status} />
            </div>
            {(c.startDate || c.endDate) && (
              <p className="mt-0.5 text-sm text-ink-soft"><bdi>{formatDate(c.startDate, lang)}</bdi> {t(lang, 'common.to')} <bdi>{formatDate(c.endDate, lang)}</bdi></p>
            )}
            <Progress lang={lang} campaign={c} />
          </RowLink>
        </li>
      ))}
    </ul>
  );
}

export default async function CampaignsPage() {
  requireAudience('client');
  const lang = await currentLang();
  const campaigns = await getCampaigns();
  // Work that needs the client first, then what is running, then the past.
  const current = campaigns.filter((c) => !FINISHED.has(c.status)).sort((a, b) => b.deliverables.awaitingReview - a.deliverables.awaitingReview);
  const past = campaigns.filter((c) => FINISHED.has(c.status));

  return (
    <div className="space-y-10">
      <PageHeader title={t(lang, 'camp.title')} subtitle={t(lang, 'camp.subtitle')} />
      {campaigns.length === 0 ? (
        <EmptyState title={t(lang, 'camp.emptyTitle')} body={t(lang, 'camp.emptyBody')}
          action={<Link href="/requests/new" className={button.secondary}>{t(lang, 'req.new')}</Link>} />
      ) : (
        <>
          {current.length > 0 && <section aria-labelledby="current-title"><SectionTitle id="current-title">{t(lang, 'camp.current')}</SectionTitle><CampaignList campaigns={current} lang={lang} /></section>}
          {past.length > 0 && <section aria-labelledby="past-title"><SectionTitle id="past-title">{t(lang, 'camp.past')}</SectionTitle><CampaignList campaigns={past} lang={lang} /></section>}
        </>
      )}
    </div>
  );
}
