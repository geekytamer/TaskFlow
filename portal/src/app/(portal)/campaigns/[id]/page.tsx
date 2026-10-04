import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DeliverableReview } from '@/components/deliverable-review';
import { InvoiceList } from '@/components/invoice-list';
import { getStatement, statementHref } from '@/lib/billing';
import { StatusBadge } from '@/components/status-badge';
import { deliverableView, getCampaign } from '@/lib/campaigns';
import { formatDate, listSep } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { currentLang } from '@/lib/session';
import { backLink } from '@/components/field';

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  requireAudience('client');
  const { id } = await params;
  const lang = await currentLang();
  const [campaign, statement] = await Promise.all([getCampaign(id), getStatement(id)]);
  if (!campaign) notFound();

  return (
    <div className="space-y-10">
      <Link href="/campaigns" className={backLink}>{t(lang, 'camp.back')}</Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 dir="auto" className="text-3xl font-semibold tracking-tight md:text-4xl">{campaign.name}</h1>
          <StatusBadge lang={lang} campaign={campaign.status} />
        </div>
        {(campaign.startDate || campaign.endDate) && (
          <p className="text-sm text-ink-soft">
            <bdi>{formatDate(campaign.startDate, lang)}</bdi> {lang === 'ar' ? 'إلى' : 'to'} <bdi>{formatDate(campaign.endDate, lang)}</bdi>
          </p>
        )}
        {campaign.influencers.length > 0 && (
          <p className="text-sm">
            <span className="text-ink-soft">{t(lang, 'camp.influencers')}: </span>
            {campaign.influencers.map((i, index) => (
              <span key={`${i.name}-${index}`}>
                {index > 0 && listSep(lang)}
                <span className="font-medium">{i.name}</span>
                {i.handle && <span className="text-ink-soft"> <bdi dir="ltr">{i.handle}</bdi></span>}
              </span>
            ))}
          </p>
        )}
      </header>

      <section aria-labelledby="content-title">
        <h2 id="content-title" className="mb-3 text-base font-semibold">{t(lang, 'camp.content')}</h2>
        {campaign.deliverables.length === 0 ? (
          <p className="text-ink-soft">{t(lang, 'camp.noContent')}</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {campaign.deliverables.map((d) => (
              <li key={d.id} className="grid gap-4 px-1 py-5 sm:px-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p dir="auto" className="font-semibold">{d.title}</p>
                    <StatusBadge lang={lang} deliverable={deliverableView(d)} />
                  </div>
                  <p className="text-sm text-ink-soft">
                    {[d.influencer, d.platform].filter(Boolean).map((part, i) => <span key={i}>{i > 0 && listSep(lang)}<bdi>{part}</bdi></span>)}
                    {d.dueDate && <span>{(d.influencer || d.platform) && listSep(lang)}{t(lang, 'camp.due')} <bdi>{formatDate(d.dueDate, lang)}</bdi></span>}
                  </p>
                  {d.contentUrl && (
                    <a href={d.contentUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-medium underline underline-offset-4">
                      {t(lang, 'camp.open')}
                    </a>
                  )}
                  {d.review && (
                    <p className="text-sm">
                      <span className={d.review.decision === 'approved' ? 'font-medium text-accent' : 'font-medium'}>
                        {t(lang, d.review.decision === 'approved' ? 'rev.youApproved' : 'rev.youAsked')}
                      </span>
                      {d.review.comment && <span dir="auto" className="mt-1 block text-ink-soft">{d.review.comment}</span>}
                    </p>
                  )}
                </div>
                {d.status === 'ready_for_review' && d.contentUrl && !d.review && (
                  <div className="md:w-72">
                    <DeliverableReview lang={lang} campaignId={campaign.id} deliverableId={d.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {statement && statement.invoices.length > 0 && (
        <section aria-labelledby="billing-title" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="billing-title" className="text-base font-semibold">{t(lang, 'bill.forCampaign')}</h2>
            <a href={statementHref(campaign.id)} download className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">{t(lang, 'bill.statement')}</a>
          </div>
          <InvoiceList invoices={statement.invoices} lang={lang} showCampaign={false} />
        </section>
      )}
    </div>
  );
}
