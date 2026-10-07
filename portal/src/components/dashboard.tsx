import Link from 'next/link';
import type { Audience } from '@/lib/audience';
import { t, type Key, type Lang } from '@/lib/i18n';
import type { CampaignSummary } from '@/lib/campaigns';
import type { Assignment, Payout } from '@/lib/influencer-types';
import { formatDate } from '@/lib/format';
import { PayoutList } from './payout-list';
import type { Me } from '@/lib/portal';
import { StatusBadge } from './status-badge';
import { PageHeader, button, list } from './ui';

export interface AttentionItem {
  key: string;
  kind: 'changes' | 'due' | 'replied';
  title: string;
  detail: string;
  dueDate?: string | null;
  href: string;
}

const ATTENTION_LABEL: Record<AttentionItem['kind'], Key> = { changes: 'dash.changes', due: 'dash.dueSoon', replied: 'dash.replied' };

export function Dashboard({
  me, lang, audience, waiting, campaigns = [], assignments = [], attention = [], payouts = [], overdue,
}: {
  me: Me; lang: Lang; audience: Audience; waiting?: { id: string; title: string }; campaigns?: CampaignSummary[];
  overdue?: { id: string; number: string };
  assignments?: Assignment[]; attention?: AttentionItem[]; payouts?: Payout[];
}) {
  const toAnswer = assignments.find((a) => a.status === 'awaiting_reply');
  const active = assignments.filter((a) => a.status === 'confirmed');
  const toReview = campaigns.find((c) => c.deliverables.awaitingReview > 0);

  return (
    <div className="space-y-14">
      <PageHeader title={`${t(lang, 'dash.hello')} ${me.user.name.split(/\s+/)[0]}`} />

      {waiting && (
        <section aria-labelledby="waiting-title" className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-accent/30 bg-accent/[0.06] p-5">
          <div className="min-w-0">
            <h2 id="waiting-title" className="font-semibold text-accent">{t(lang, 'dash.waiting')}</h2>
            <p className="mt-0.5 truncate text-sm"><bdi>{waiting.title}</bdi></p>
          </div>
          <Link href={`/proposals/${waiting.id}`} className={button.primary}>
            {t(lang, 'dash.open')}
          </Link>
        </section>
      )}

      {toAnswer && (
        <section aria-labelledby="answer-title" className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-accent/30 bg-accent/[0.06] p-5">
          <div className="min-w-0">
            <h2 id="answer-title" className="font-semibold text-accent">{t(lang, 'dash.answer')}</h2>
            <p dir="auto" className="mt-0.5 truncate text-sm">{toAnswer.campaign.name}{toAnswer.campaign.brand ? ` · ${toAnswer.campaign.brand}` : ''}</p>
          </div>
          <Link href={`/deals/peak-${toAnswer.id}`} className={button.primary}>
            {t(lang, 'dash.openAssignment')}
          </Link>
        </section>
      )}

      {attention.length > 0 && (
        <section aria-labelledby="attention-title">
          <h2 id="attention-title" className="mb-3 text-base font-semibold">{t(lang, 'dash.attention')}</h2>
          <ul className={list}>
            {attention.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-surface-2 sm:px-5">
                  <span className="min-w-0">
                    <span className={`block text-sm font-semibold ${item.kind === 'changes' ? 'text-danger' : 'text-accent'}`}>
                      {t(lang, ATTENTION_LABEL[item.kind])}
                      {item.dueDate && <span className="ms-2 font-normal text-ink-soft"><bdi>{formatDate(item.dueDate, lang)}</bdi></span>}
                    </span>
                    {item.title && <span className="block truncate font-medium"><bdi>{item.title}</bdi></span>}
                    <span className="block truncate text-sm text-ink-soft"><bdi>{item.detail}</bdi></span>
                  </span>
                  <span aria-hidden="true" className="text-ink-soft">{lang === 'ar' ? '‹' : '›'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {active.length > 0 && (
        <section aria-labelledby="active-title">
          <h2 id="active-title" className="mb-3 text-base font-semibold">{t(lang, 'dash.yourAssignments')}</h2>
          <ul className={list}>
            {active.slice(0, 5).map((a) => (
              <li key={a.id}>
                <Link href={`/deals/peak-${a.id}`} className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-surface-2 sm:px-5">
                  <span className="min-w-0 truncate font-medium"><bdi>{a.campaign.name}</bdi></span>
                  <StatusBadge lang={lang} assignment={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {payouts.length > 0 && (
        <section aria-labelledby="payouts-title">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 id="payouts-title" className="text-base font-semibold">{t(lang, 'dash.recentPayouts')}</h2>
            <Link href="/payouts" className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">{t(lang, 'dash.allPayouts')}</Link>
          </div>
          <PayoutList payouts={payouts} lang={lang} />
        </section>
      )}

      {overdue && (
        <section aria-labelledby="overdue-title" className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-danger/30 bg-danger/5 p-5">
          <div className="min-w-0">
            <h2 id="overdue-title" className="font-semibold text-danger">{t(lang, 'bill.overdueTitle')}</h2>
            <p className="mt-0.5 text-sm"><bdi dir="ltr">{overdue.number}</bdi></p>
          </div>
          <Link href={`/billing/${overdue.id}`} className={button.primary}>
            {t(lang, 'bill.open')}
          </Link>
        </section>
      )}

      {toReview && (
        <section aria-labelledby="review-title" className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-accent/30 bg-accent/[0.06] p-5">
          <div className="min-w-0">
            <h2 id="review-title" className="font-semibold text-accent">{t(lang, 'dash.review')}</h2>
            <p className="mt-0.5 truncate text-sm"><bdi>{toReview.name}</bdi></p>
          </div>
          <Link href={`/campaigns/${toReview.id}`} className={button.primary}>
            {t(lang, 'dash.openCampaign')}
          </Link>
        </section>
      )}

      {campaigns.length > 0 ? (
        <section aria-labelledby="campaigns-title">
          <h2 id="campaigns-title" className="mb-3 text-base font-semibold">{t(lang, 'dash.campaigns')}</h2>
          <ul className={list}>
            {campaigns.slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link href={`/campaigns/${c.id}`} className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-surface-2 sm:px-5">
                  <span className="min-w-0 truncate font-medium"><bdi>{c.name}</bdi></span>
                  <StatusBadge lang={lang} campaign={c.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : assignments.length === 0 && (
      <section aria-labelledby="empty-title" className="max-w-xl">
          <h2 id="empty-title" className="text-xl font-semibold tracking-tight">
            {t(lang, audience === 'client' ? 'dash.client.title' : 'dash.influencer.title')}
          </h2>
          <p className="mt-2 leading-relaxed text-ink-soft">
            {t(lang, audience === 'client' ? 'dash.client.body' : 'dash.influencer.body')}
          </p>
          {audience === 'client' && (
            <Link
              href="/influencers"
              className={`${button.primary} mt-5`}
            >
              {t(lang, 'dash.client.browse')}
            </Link>
          )}
        </section>
      )}

    </div>
  );
}
