import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PriceTag } from '@/components/price-tag';
import { getInfluencer } from '@/lib/catalogue';
import { formatCompact, formatPercent } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { availabilityLabel } from '@/lib/labels';
import { currentLang } from '@/lib/session';

export default async function InfluencerPage({ params }: { params: Promise<{ id: string }> }) {
  requireAudience('client');
  const { id } = await params;
  const lang = await currentLang();
  const influencer = await getInfluencer(id);
  if (!influencer) notFound();

  const meta = [influencer.niche, influencer.location].filter(Boolean).join(', ');

  return (
    <div className="space-y-10">
      <Link href="/influencers" className="text-sm font-medium text-ink-soft underline underline-offset-4 hover:text-ink">
        {t(lang, 'cat.back')}
      </Link>

      <header className="grid gap-6 md:grid-cols-[minmax(0,1fr)_16rem] md:items-start">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{influencer.name}</h1>
          {meta && <p className="mt-2 text-ink-soft">{meta}</p>}
          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            {influencer.availability && (
              <div>
                <dt className="text-ink-soft">{t(lang, 'cat.availability')}</dt>
                <dd className="font-medium">{availabilityLabel(influencer.availability, lang)}</dd>
              </div>
            )}
            {influencer.languages.length > 0 && (
              <div>
                <dt className="text-ink-soft">{t(lang, 'cat.languages')}</dt>
                <dd className="font-medium">{influencer.languages.join(', ')}</dd>
              </div>
            )}
          </dl>
        </div>
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="mb-2 text-sm text-ink-soft">{t(lang, 'cat.price')}</p>
          <PriceTag price={influencer.price} lang={lang} detailed />
          <Link href={`/requests/new?with=${encodeURIComponent(influencer.id)}`} className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-[10px] bg-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-ink/90">
            {t(lang, 'cat.request')}
          </Link>
        </div>
      </header>

      <section aria-labelledby="accounts-title">
        <h2 id="accounts-title" className="mb-3 text-base font-semibold">{t(lang, 'cat.accounts')}</h2>
        {influencer.platforms.length === 0 ? (
          <p className="text-ink-soft">{t(lang, 'cat.noAccounts')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-y border-line text-start text-sm">
              <thead className="text-ink-soft">
                <tr className="border-b border-line">
                  <th scope="col" className="py-3 pe-4 text-start font-medium">{t(lang, 'cat.platform')}</th>
                  <th scope="col" className="py-3 pe-4 text-start font-medium">{t(lang, 'cat.handle')}</th>
                  <th scope="col" className="py-3 pe-4 text-end font-medium">{t(lang, 'cat.followers')}</th>
                  <th scope="col" className="py-3 pe-4 text-end font-medium">{t(lang, 'cat.avgViews')}</th>
                  <th scope="col" className="py-3 text-end font-medium">{t(lang, 'cat.engagement')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {influencer.platforms.map((p) => (
                  <tr key={`${p.platform}-${p.handle ?? ''}`}>
                    <th scope="row" className="py-3 pe-4 text-start font-medium"><bdi>{p.platform}</bdi></th>
                    <td className="py-3 pe-4">
                      {p.handle && p.url ? (
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                          <bdi dir="ltr">{p.handle}</bdi>
                        </a>
                      ) : (
                        <bdi dir="ltr">{p.handle ?? '-'}</bdi>
                      )}
                    </td>
                    <td className="py-3 pe-4 text-end tabular-nums"><bdi>{formatCompact(p.followers, lang)}</bdi></td>
                    <td className="py-3 pe-4 text-end tabular-nums"><bdi>{formatCompact(p.avgViews, lang)}</bdi></td>
                    <td className="py-3 text-end tabular-nums"><bdi>{formatPercent(p.engagementRate, lang)}</bdi></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
