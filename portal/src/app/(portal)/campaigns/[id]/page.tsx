import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DeliverableReview } from '@/components/deliverable-review';
import { InvoiceList } from '@/components/invoice-list';
import { ResultsFigures } from '@/components/results-figures';
import { StatusBadge } from '@/components/status-badge';
import { Figure, PageHeader, SectionTitle, list, panel, textLink } from '@/components/ui';
import { VerifiedMark } from '@/components/verified-mark';
import { getStatement, statementHref } from '@/lib/billing';
import { deliverableView, getCampaign, type Deliverable } from '@/lib/campaigns';
import { formatDate, listSep } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t, type Key, type Lang } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

const reviewable = (d: Deliverable) => d.status === 'ready_for_review' && Boolean(d.contentUrl) && !d.review;

function DeliverableRow({ d, lang, campaignId }: { d: Deliverable; lang: Lang; campaignId: string }) {
  return (
    <li className="grid gap-4 px-4 py-5 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">
            {d.contentUrl
              ? <Link href={`/campaigns/${campaignId}/content/${d.id}`} className="underline-offset-4 hover:underline"><bdi>{d.title}</bdi></Link>
              : <bdi>{d.title}</bdi>}
          </p>
          <StatusBadge lang={lang} deliverable={deliverableView(d)} />
        </div>
        <p className="text-sm text-ink-soft">
          {[d.influencer, d.platform].filter(Boolean).map((part, i) => <span key={i}>{i > 0 && listSep(lang)}<bdi>{part}</bdi></span>)}
          {d.dueDate && <span>{(d.influencer || d.platform) && listSep(lang)}{t(lang, 'camp.due')} <bdi>{formatDate(d.dueDate, lang)}</bdi></span>}
        </p>
        {d.contentUrl && (
          <a href={d.contentUrl} target="_blank" rel="noopener noreferrer" className={textLink}>
            {t(lang, 'camp.open')}<span aria-hidden="true" className="ms-1">↗</span>
          </a>
        )}
        {d.results && (
          <div className="space-y-1 pt-1">
            <p className="text-xs text-ink-soft">{t(lang, `social.after.${d.results.checkpoint}` as Key)}</p>
            <ResultsFigures figures={d.results} lang={lang} />
          </div>
        )}
        {d.review && (
          <p className="text-sm">
            <span className={d.review.decision === 'approved' ? 'font-semibold text-success' : 'font-semibold'}>
              {t(lang, d.review.decision === 'approved' ? 'rev.youApprovedTold' : 'rev.youAsked')}
            </span>
            {d.review.comment && <span dir="auto" className="mt-1 block text-ink-soft">{d.review.comment}</span>}
          </p>
        )}
      </div>
      {reviewable(d) && (
        <div className="md:w-80">
          <DeliverableReview lang={lang} campaignId={campaignId} deliverableId={d.id} title={d.title} />
        </div>
      )}
    </li>
  );
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  requireAudience('client');
  const { id } = await params;
  const lang = await currentLang();
  const [campaign, statement] = await Promise.all([getCampaign(id), getStatement(id)]);
  if (!campaign) notFound();

  const toReview = campaign.deliverables.filter(reviewable);
  const others = campaign.deliverables.filter((d) => !reviewable(d));
  const published = campaign.deliverables.filter((d) => d.status === 'published').length;
  const inProgress = campaign.deliverables.length - published - toReview.length;

  return (
    <div className="space-y-10">
      <PageHeader
        back={{ href: '/campaigns', label: t(lang, 'camp.back') }}
        title={<span className="inline-flex flex-wrap items-center gap-3"><bdi>{campaign.name}</bdi><StatusBadge lang={lang} campaign={campaign.status} /></span>}
        subtitle={(campaign.startDate || campaign.endDate) && <><bdi>{formatDate(campaign.startDate, lang)}</bdi> {t(lang, 'common.to')} <bdi>{formatDate(campaign.endDate, lang)}</bdi></>}
      />

      <dl className={`${panel} grid grid-cols-3 gap-4 p-5 sm:p-6`}>
        <Figure label={t(lang, 'camp.toReview')} value={<bdi>{toReview.length}</bdi>} tone={toReview.length ? 'ink' : 'ink'} />
        <Figure label={t(lang, 'camp.inProgress')} value={<bdi>{Math.max(0, inProgress)}</bdi>} />
        <Figure label={t(lang, 'camp.published')} value={<bdi>{published}</bdi>} tone={published ? 'success' : 'ink'} />
      </dl>

      {campaign.influencers.length > 0 && (
        <p className="text-sm">
          <span className="text-ink-soft">{t(lang, 'camp.influencers')}: </span>
          {campaign.influencers.map((i, index) => (
            <span key={`${i.name}-${index}`}>
              {index > 0 && listSep(lang)}
              <span className="font-medium"><bdi>{i.name}</bdi></span>
              {i.handle && <span className="text-ink-soft"> <bdi dir="ltr">{i.handle}</bdi></span>}
            </span>
          ))}
        </p>
      )}

      {toReview.length > 0 && (
        <section aria-labelledby="review-title">
          <SectionTitle id="review-title">{t(lang, 'camp.readyForReview')}</SectionTitle>
          <ul className={list}>{toReview.map((d) => <DeliverableRow key={d.id} d={d} lang={lang} campaignId={campaign.id} />)}</ul>
        </section>
      )}

      {campaign.results && (
        <section aria-labelledby="results-title">
          <SectionTitle id="results-title" aside={<span className="flex items-center gap-2 text-sm text-ink-soft">{t(lang, 'social.posts').replace('{n}', String(campaign.results.posts))}<VerifiedMark lang={lang} compact /></span>}>
            {t(lang, 'social.results')}
          </SectionTitle>
          <div className={`${panel} p-5`}><ResultsFigures figures={campaign.results} lang={lang} size="lg" /></div>
        </section>
      )}

      <section aria-labelledby="content-title">
        <SectionTitle id="content-title">{toReview.length ? t(lang, 'camp.otherContent') : t(lang, 'camp.content')}</SectionTitle>
        {others.length === 0 ? (
          <p className="text-ink-soft">{t(lang, 'camp.noContent')}</p>
        ) : (
          <ul className={list}>{others.map((d) => <DeliverableRow key={d.id} d={d} lang={lang} campaignId={campaign.id} />)}</ul>
        )}
      </section>

      {statement && statement.invoices.length > 0 && (
        <section aria-labelledby="billing-title">
          <SectionTitle id="billing-title" aside={<a href={statementHref(campaign.id)} download className={textLink}>{t(lang, 'bill.statement')}</a>}>
            {t(lang, 'bill.forCampaign')}
          </SectionTitle>
          <InvoiceList invoices={statement.invoices} lang={lang} showCampaign={false} />
        </section>
      )}
    </div>
  );
}
