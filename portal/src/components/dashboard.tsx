import Link from 'next/link';
import type { Audience } from '@/lib/audience';
import { t, type Key, type Lang } from '@/lib/i18n';
import type { CampaignSummary } from '@/lib/campaigns';
import type { Assignment, Payout } from '@/lib/influencer-types';
import { formatDate } from '@/lib/format';
import { PayoutList } from './payout-list';
import type { Me } from '@/lib/portal';
import { StatusBadge } from './status-badge';

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
  const rows: Array<{ label: string; value: string; ltr?: boolean }> = [
    { label: t(lang, 'dash.name'), value: me.user.name },
    { label: t(lang, 'dash.email'), value: me.user.email, ltr: true },
    { label: t(lang, audience === 'client' ? 'dash.organisation' : 'dash.profile'), value: me.subject.name },
    { label: t(lang, 'dash.role'), value: t(lang, `role.${me.user.role}` as Key) },
  ];

  return (
    <div className="space-y-14">
      <header>
        <p className="text-sm text-ink-soft">{t(lang, 'dash.hello')}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">{me.user.name}</h1>
      </header>

      {waiting && (
        <section aria-labelledby="waiting-title" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-accent/30 bg-accent/10 p-5">
          <div className="min-w-0">
            <h2 id="waiting-title" className="font-semibold text-accent">{t(lang, 'dash.waiting')}</h2>
            <p dir="auto" className="mt-0.5 truncate text-sm">{waiting.title}</p>
          </div>
          <Link href={`/proposals/${waiting.id}`} className="inline-flex h-10 items-center rounded-[10px] bg-ink px-5 text-[15px] font-semibold text-white transition-colors hover:bg-ink/90">
            {t(lang, 'dash.open')}
          </Link>
        </section>
      )}

      {toAnswer && (
        <section aria-labelledby="answer-title" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-accent/30 bg-accent/10 p-5">
          <div className="min-w-0">
            <h2 id="answer-title" className="font-semibold text-accent">{t(lang, 'dash.answer')}</h2>
            <p dir="auto" className="mt-0.5 truncate text-sm">{toAnswer.campaign.name}{toAnswer.campaign.brand ? ` · ${toAnswer.campaign.brand}` : ''}</p>
          </div>
          <Link href={`/assignments#${toAnswer.id}`} className="inline-flex h-10 items-center rounded-[10px] bg-ink px-5 text-[15px] font-semibold text-white transition-colors hover:bg-ink/90">
            {t(lang, 'dash.openAssignment')}
          </Link>
        </section>
      )}

      {attention.length > 0 && (
        <section aria-labelledby="attention-title">
          <h2 id="attention-title" className="mb-3 text-base font-semibold">{t(lang, 'dash.attention')}</h2>
          <ul className="divide-y divide-line border-y border-line">
            {attention.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="flex items-center justify-between gap-4 px-1 py-4 hover:bg-surface sm:px-3">
                  <span className="min-w-0">
                    <span className={`block text-sm font-semibold ${item.kind === 'changes' ? 'text-danger' : 'text-accent'}`}>
                      {t(lang, ATTENTION_LABEL[item.kind])}
                      {item.dueDate && <span className="ms-2 font-normal text-ink-soft"><bdi>{formatDate(item.dueDate, lang)}</bdi></span>}
                    </span>
                    {item.title && <span dir="auto" className="block truncate font-medium">{item.title}</span>}
                    <span dir="auto" className="block truncate text-sm text-ink-soft">{item.detail}</span>
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
          <ul className="divide-y divide-line border-y border-line">
            {active.slice(0, 5).map((a) => (
              <li key={a.id}>
                <Link href={`/assignments#${a.id}`} className="flex items-center justify-between gap-4 px-1 py-4 hover:bg-surface sm:px-3">
                  <span dir="auto" className="min-w-0 truncate font-medium">{a.campaign.name}</span>
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
        <section aria-labelledby="overdue-title" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-danger/30 bg-danger/5 p-5">
          <div className="min-w-0">
            <h2 id="overdue-title" className="font-semibold text-danger">{t(lang, 'bill.overdueTitle')}</h2>
            <p className="mt-0.5 text-sm"><bdi dir="ltr">{overdue.number}</bdi></p>
          </div>
          <Link href={`/billing/${overdue.id}`} className="inline-flex h-10 items-center rounded-[10px] bg-ink px-5 text-[15px] font-semibold text-white transition-colors hover:bg-ink/90">
            {t(lang, 'bill.open')}
          </Link>
        </section>
      )}

      {toReview && (
        <section aria-labelledby="review-title" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-accent/30 bg-accent/10 p-5">
          <div className="min-w-0">
            <h2 id="review-title" className="font-semibold text-accent">{t(lang, 'dash.review')}</h2>
            <p dir="auto" className="mt-0.5 truncate text-sm">{toReview.name}</p>
          </div>
          <Link href={`/campaigns/${toReview.id}`} className="inline-flex h-10 items-center rounded-[10px] bg-ink px-5 text-[15px] font-semibold text-white transition-colors hover:bg-ink/90">
            {t(lang, 'dash.openCampaign')}
          </Link>
        </section>
      )}

      {campaigns.length > 0 ? (
        <section aria-labelledby="campaigns-title">
          <h2 id="campaigns-title" className="mb-3 text-base font-semibold">{t(lang, 'dash.campaigns')}</h2>
          <ul className="divide-y divide-line border-y border-line">
            {campaigns.slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link href={`/campaigns/${c.id}`} className="flex items-center justify-between gap-4 px-1 py-4 hover:bg-surface sm:px-3">
                  <span dir="auto" className="min-w-0 truncate font-medium">{c.name}</span>
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
              className="mt-5 inline-flex h-10 items-center rounded-[10px] bg-ink px-5 text-[15px] font-semibold text-white transition-colors hover:bg-ink/90"
            >
              {t(lang, 'dash.client.browse')}
            </Link>
          )}
        </section>
      )}

      <section aria-labelledby="account-title">
        <h2 id="account-title" className="mb-3 text-base font-semibold">{t(lang, 'dash.account')}</h2>
        <dl className="divide-y divide-line border-y border-line">
          {rows.map(({ label, value, ltr }) => (
            <div key={label} className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:items-baseline sm:gap-6">
              <dt className="text-sm text-ink-soft">{label}</dt>
              <dd className="font-medium [overflow-wrap:anywhere]">
                {ltr ? <bdi dir="ltr">{value}</bdi> : value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
