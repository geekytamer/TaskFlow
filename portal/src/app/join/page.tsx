import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BrandMark } from '@/components/brand-mark';
import { PeakPlanet, Sparkle, type Satellite } from '@/components/cosmic';
import { JoinForm } from '@/components/join-form';
import { LanguageSwitch } from '@/components/language-switch';
import { NavIcon } from '@/components/nav-icon';
import { getAudience } from '@/lib/audience';
import { t, type Key } from '@/lib/i18n';
import type { NavIcon as IconName } from '@/lib/nav';
import { getBranding } from '@/lib/portal';
import { currentLang } from '@/lib/session';

export const metadata: Metadata = { title: 'PEAK | Register your company' };

const display = { fontFamily: 'var(--font-display), var(--font-latin), var(--font-arabic), sans-serif' };

/** What a business gets from the client portal. Every line is a feature the portal has today. */
const BENEFITS: Array<{ icon: IconName; title: Key; body: Key }> = [
  { icon: 'creators', title: 'join.b1.t', body: 'join.b1.b' },
  { icon: 'discover', title: 'join.b2.t', body: 'join.b2.b' },
  { icon: 'compare', title: 'join.b3.t', body: 'join.b3.b' },
  { icon: 'requests', title: 'join.b4.t', body: 'join.b4.b' },
  { icon: 'campaigns', title: 'join.b5.t', body: 'join.b5.b' },
  { icon: 'analytics', title: 'join.b6.t', body: 'join.b6.b' },
  { icon: 'billing', title: 'join.b7.t', body: 'join.b7.b' },
  { icon: 'messages', title: 'join.b8.t', body: 'join.b8.b' },
];
const STEPS: Array<{ title: Key; body: Key }> = [
  { title: 'join.s1.t', body: 'join.s1.b' },
  { title: 'join.s2.t', body: 'join.s2.b' },
  { title: 'join.s3.t', body: 'join.s3.b' },
];

/**
 * The public "register your company" page on the client portal: what a
 * business gets, how joining works, then the form. Staff receive each
 * request as a lead and send the portal invitation themselves.
 */
export default async function JoinPage() {
  if (getAudience() !== 'client') notFound();
  const lang = await currentLang();
  const branding = await getBranding('client');
  const satellites: Satellite[] = [
    { key: 'creators', label: t(lang, 'join.sat1'), className: 'end-[4%] top-[8%]' },
    { key: 'prices', label: t(lang, 'join.sat2'), className: 'start-0 top-[46%]' },
    { key: 'reports', label: t(lang, 'join.sat3'), className: 'bottom-[6%] end-[12%]' },
  ];

  return (
    <div className="relative">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <BrandMark branding={branding} className="h-12 w-auto max-w-[150px] object-contain" />
        <div className="flex items-center gap-2 sm:gap-4">
          <LanguageSwitch lang={lang} />
          <Link href="/login" className="inline-flex min-h-11 items-center rounded-control border border-white/[0.16] px-4 text-sm font-bold hover:border-ink/50">{t(lang, 'join.signIn')}</Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-14 pt-6 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pb-24 lg:pt-12">
          <div className="rise space-y-6">
            <div className="-mb-2 lg:hidden"><PeakPlanet size={84} mark={<BrandMark branding={branding} variant="mark" className="h-auto w-[60%] object-contain" />} /></div>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/[0.1] px-3.5 py-1.5 text-sm font-bold text-accent">
              <Sparkle size={12} /> {t(lang, 'join.eyebrow')}
            </span>
            <h1 className="text-balance text-[36px] font-extrabold leading-[1.15] tracking-tight sm:text-[46px] lg:text-[52px]" style={display}>{t(lang, 'join.title')}</h1>
            <p className="max-w-xl text-[17px] leading-relaxed text-ink-soft sm:text-lg">{t(lang, 'join.lead')}</p>
            <div className="flex flex-wrap gap-3">
              <a href="#register" className="inline-flex h-12 items-center rounded-control bg-accent px-6 text-[16px] font-extrabold text-accent-ink hover:bg-accent/90">{t(lang, 'join.cta')}</a>
              <a href="#benefits" className="inline-flex h-12 items-center rounded-control border border-white/[0.16] px-6 text-[16px] font-bold hover:border-ink/50">{t(lang, 'join.see')}</a>
            </div>
          </div>
          <div className="hidden justify-center lg:flex">
            <PeakPlanet size={280} mark={<BrandMark branding={branding} variant="mark" className="h-auto w-[60%] object-contain" />} satellites={satellites} />
          </div>
        </section>

        {/* Benefits */}
        <section id="benefits" className="mx-auto max-w-6xl scroll-mt-6 px-4 pb-16 sm:px-6 lg:pb-24">
          <h2 className="mb-2 text-[28px] font-extrabold tracking-tight sm:text-[36px]" style={display}>{t(lang, 'join.benefitsTitle')}</h2>
          <p className="mb-8 max-w-2xl text-[16px] text-ink-soft">{t(lang, 'join.benefitsLead')}</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map((b) => (
              <li key={b.title} className="relative overflow-hidden rounded-[22px] border border-white/[0.07] p-5 card-surface">
                <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-accent/[0.14] text-accent"><NavIcon name={b.icon} className="h-5 w-5" /></span>
                <h3 className="mb-1.5 text-[17px] font-extrabold" style={display}>{t(lang, b.title)}</h3>
                <p className="text-[15px] leading-relaxed text-ink-soft">{t(lang, b.body)}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:pb-24">
          <h2 className="mb-8 text-[28px] font-extrabold tracking-tight sm:text-[36px]" style={display}>{t(lang, 'join.stepsTitle')}</h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 rounded-[22px] border border-white/[0.07] p-5 card-surface">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-extrabold text-accent-ink">{i + 1}</span>
                <div>
                  <h3 className="mb-1 text-[17px] font-extrabold" style={display}>{t(lang, s.title)}</h3>
                  <p className="text-[15px] leading-relaxed text-ink-soft">{t(lang, s.body)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Register */}
        <section id="register" className="mx-auto max-w-6xl scroll-mt-6 px-4 pb-20 sm:px-6">
          <div className="relative grid gap-8 overflow-hidden rounded-[28px] border border-white/[0.08] p-5 card-surface sm:p-8 lg:grid-cols-[0.8fr_1.2fr] lg:p-10">
            <span aria-hidden="true" className="orange-disc -bottom-24 -start-20 h-56 w-56 opacity-90" />
            <div className="relative space-y-3">
              <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]" style={display}>{t(lang, 'join.formTitle')}</h2>
              <p className="text-[16px] leading-relaxed text-ink-soft">{t(lang, 'join.formLead')}</p>
            </div>
            <div className="relative"><JoinForm lang={lang} /></div>
          </div>
        </section>
      </main>
    </div>
  );
}
