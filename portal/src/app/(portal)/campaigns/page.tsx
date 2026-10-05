import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';
import { getCampaigns } from '@/lib/campaigns';
import { formatDate } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

export default async function CampaignsPage() {
  requireAudience('client');
  const lang = await currentLang();
  const campaigns = await getCampaigns();

  return (
    <div className="space-y-10">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t(lang, 'camp.title')}</h1>
        <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'camp.subtitle')}</p>
      </header>

      {campaigns.length === 0 ? (
        <section className="max-w-xl border-t border-line pt-8">
          <h2 className="text-xl font-semibold tracking-tight">{t(lang, 'camp.emptyTitle')}</h2>
          <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'camp.emptyBody')}</p>
        </section>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link href={`/campaigns/${c.id}`} className="grid gap-2 px-1 py-5 transition-colors hover:bg-surface sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6 sm:px-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold"><bdi>{c.name}</bdi></p>
                  {(c.startDate || c.endDate) && (
                    <p className="mt-0.5 text-sm text-ink-soft">
                      <bdi>{formatDate(c.startDate, lang)}</bdi> {lang === 'ar' ? 'إلى' : 'to'} <bdi>{formatDate(c.endDate, lang)}</bdi>
                    </p>
                  )}
                </div>
                {c.deliverables.awaitingReview > 0 ? (
                  <span className="text-sm font-semibold text-accent">
                    {t(lang, 'camp.toReview')}: <span className="tabular-nums">{c.deliverables.awaitingReview}</span>
                  </span>
                ) : <span />}
                <StatusBadge lang={lang} campaign={c.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
