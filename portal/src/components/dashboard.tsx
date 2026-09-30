import Link from 'next/link';
import type { Audience } from '@/lib/audience';
import { t, type Key, type Lang } from '@/lib/i18n';
import type { CampaignSummary } from '@/lib/campaigns';
import type { Me } from '@/lib/portal';
import { StatusBadge } from './status-badge';

export function Dashboard({
  me, lang, audience, waiting, campaigns = [],
}: { me: Me; lang: Lang; audience: Audience; waiting?: { id: string; title: string }; campaigns?: CampaignSummary[] }) {
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
      ) : (
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
