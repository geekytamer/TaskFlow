import { notFound } from 'next/navigation';
import { DeliverableReview } from '@/components/deliverable-review';
import { ResultsFigures } from '@/components/results-figures';
import { StatusBadge } from '@/components/status-badge';
import { PageHeader, SectionTitle, button, panel, textLink } from '@/components/ui';
import { deliverableView, getCampaignContent } from '@/lib/campaigns';
import { formatDate, formatDateTime, listSep } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t, type Key } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

/**
 * One piece of content, where the review alert lands: open it, decide. When
 * the client asked for changes on an earlier version, that version and their
 * comment sit beside the new one.
 */
export default async function ContentPage({ params }: { params: Promise<{ id: string; deliverableId: string }> }) {
  requireAudience('client');
  const { id, deliverableId } = await params;
  const lang = await currentLang();
  const d = await getCampaignContent(id, deliverableId);
  if (!d) notFound();
  const reviewable = d.status === 'ready_for_review' && Boolean(d.contentUrl) && !d.review;

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        back={{ href: `/campaigns/${d.campaign.id}`, label: d.campaign.name }}
        title={<span className="inline-flex flex-wrap items-center gap-3"><bdi>{d.title}</bdi><StatusBadge lang={lang} deliverable={deliverableView(d)} /></span>}
        subtitle={
          <>
            {[d.influencer, d.platform].filter(Boolean).map((part, i) => <span key={i}>{i > 0 && listSep(lang)}<bdi>{part}</bdi></span>)}
            {d.dueDate && <span>{(d.influencer || d.platform) && listSep(lang)}{t(lang, 'camp.due')} <bdi>{formatDate(d.dueDate, lang)}</bdi></span>}
          </>
        }
      />

      {d.previous ? (
        <section aria-labelledby="changed-title" className="space-y-3">
          <SectionTitle id="changed-title">{t(lang, 'rev.whatChanged')}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className={`${panel} space-y-3 p-5`}>
              <p className="text-sm font-semibold text-ink-soft">{t(lang, 'rev.before')}</p>
              <a href={d.previous.contentUrl} target="_blank" rel="noopener noreferrer" className={textLink}>
                {t(lang, 'camp.open')}<span aria-hidden="true" className="ms-1">↗</span>
              </a>
              {d.previous.comment && (
                <figure className="border-s border-line ps-3">
                  <figcaption className="text-xs text-ink-soft">{t(lang, 'rev.yourComment')} · <bdi>{formatDateTime(d.previous.at, lang)}</bdi></figcaption>
                  <blockquote dir="auto" className="mt-1 whitespace-pre-line leading-relaxed">{d.previous.comment}</blockquote>
                </figure>
              )}
            </div>
            <div className={`${panel} space-y-3 border-accent/40 p-5`}>
              <p className="text-sm font-semibold text-accent">{t(lang, 'rev.now')}</p>
              <a href={d.contentUrl!} target="_blank" rel="noopener noreferrer" className={button.primary}>
                {t(lang, 'rev.openThis')}<span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </section>
      ) : (
        <a href={d.contentUrl!} target="_blank" rel="noopener noreferrer" className={`${button.primary} w-full sm:w-auto sm:px-8`}>
          {t(lang, 'rev.openThis')}<span aria-hidden="true">↗</span>
        </a>
      )}

      {reviewable && (
        <section aria-labelledby="decide-title" className="space-y-3">
          <SectionTitle id="decide-title">{t(lang, 'rev.decideTitle')}</SectionTitle>
          <DeliverableReview lang={lang} campaignId={d.campaign.id} deliverableId={d.id} title={d.title} />
        </section>
      )}

      {d.review && (
        <p className={`${panel} p-5`}>
          <span className={d.review.decision === 'approved' ? 'font-semibold text-success' : 'font-semibold'}>
            {t(lang, d.review.decision === 'approved' ? 'rev.youApprovedTold' : 'rev.youAsked')}
          </span>
          {d.review.comment && <span dir="auto" className="mt-1 block text-ink-soft">{d.review.comment}</span>}
        </p>
      )}

      {d.results && (
        <section className="space-y-1">
          <p className="text-xs text-ink-soft">{t(lang, `social.after.${d.results.checkpoint}` as Key)}</p>
          <ResultsFigures figures={d.results} lang={lang} />
        </section>
      )}
    </div>
  );
}
