import type { Metadata } from 'next';
import { LanguageSwitch } from '@/components/language-switch';
import { VerifiedMark } from '@/components/verified-mark';
import { button } from '@/components/ui';
import { publicFetch } from '@/lib/backend';
import { formatCompact, formatPercent } from '@/lib/format';
import { t } from '@/lib/i18n';
import { currentLang } from '@/lib/session';
import type { PublicKit } from '@/lib/workspace-types';

/** A creator's public media kit: no sign-in, only what they chose to show. */
async function load(slug: string): Promise<PublicKit | null> {
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) return null;
  const res = await publicFetch<PublicKit>(`/kit/${slug}`);
  return res.status === 200 ? res.data : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const kit = await load((await params).slug);
  return { title: kit ? kit.name : 'Media kit', robots: { index: false, follow: false } };
}

export default async function KitPage({ params }: { params: Promise<{ slug: string }> }) {
  const lang = await currentLang();
  const kit = await load((await params).slug);

  return (
    <div className="min-h-[100dvh]">
      <header className="mx-auto flex h-16 max-w-3xl items-center justify-end px-5 md:px-8">
        <LanguageSwitch lang={lang} />
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-16 md:px-8">
        {!kit ? (
          <div className="py-24">
            <h1 className="text-2xl font-semibold tracking-tight">{t(lang, 'kit.notFoundTitle')}</h1>
            <p className="mt-2 text-ink-soft">{t(lang, 'kit.notFoundBody')}</p>
          </div>
        ) : (
          <article className="space-y-12 pt-8 md:pt-14">
            <header className="space-y-4">
              <h1 className="text-[clamp(2.25rem,6vw,3.75rem)] font-semibold leading-[1.05] tracking-tight"><bdi dir="auto">{kit.name}</bdi></h1>
              {kit.headline && <p dir="auto" className="max-w-2xl text-xl leading-snug text-ink-soft md:text-2xl">{kit.headline}</p>}
              {kit.contactEmail && (
                <a href={`mailto:${kit.contactEmail}`} className={`${button.primary} mt-2`}>{t(lang, 'kit.contact')}</a>
              )}
            </header>

            {kit.stats.length > 0 && (
              <section aria-label={t(lang, 'kit.stats')}>
                <ul className={`grid gap-px overflow-hidden rounded-panel border border-line bg-line ${kit.stats.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                  {kit.stats.map((s) => (
                    <li key={`${s.platform}-${s.handle}`} className={`space-y-2 bg-surface p-5 ${kit.stats.length % 2 === 1 ? 'sm:last:col-span-2' : ''}`}>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
                        <span className="font-semibold text-ink">{s.platform}</span>
                        {s.handle && <bdi dir="ltr">{s.handle}</bdi>}
                        {s.verified && <VerifiedMark lang={lang} asOf={s.asOf ?? undefined} />}
                      </p>
                      {s.followers !== null && (
                        <p className="text-3xl font-semibold tabular-nums tracking-tight">
                          <bdi>{formatCompact(s.followers, lang)}</bdi> <span className="text-base font-medium text-ink-soft">{t(lang, 'kit.followersShort')}</span>
                        </p>
                      )}
                      {s.engagementRate !== null && (
                        <p className="text-sm text-ink-soft"><bdi>{formatPercent(s.engagementRate, lang)}</bdi> {t(lang, 'kit.engagementShort')}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {kit.bio && <p dir="auto" className="max-w-prose whitespace-pre-line text-lg leading-relaxed">{kit.bio}</p>}

            {kit.brands.length > 0 && (
              <section aria-labelledby="brands-title" className="space-y-3">
                <h2 id="brands-title" className="text-sm font-semibold text-ink-soft">{t(lang, 'kit.workedWith')}</h2>
                <ul className="flex flex-wrap gap-x-6 gap-y-2 text-lg font-medium">
                  {kit.brands.map((b) => <li key={b}><bdi dir="auto">{b}</bdi></li>)}
                </ul>
              </section>
            )}
          </article>
        )}
      </main>
    </div>
  );
}
