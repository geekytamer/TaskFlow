import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { PeakPlanet, Sparkle, type Satellite } from '@/components/cosmic';
import { JoinForm } from '@/components/join-form';
import { LanguageSwitch } from '@/components/language-switch';
import { NavIcon } from '@/components/nav-icon';
import { getAudience } from '@/lib/audience';
import { t, type Key, type Lang } from '@/lib/i18n';
import type { NavIcon as IconName } from '@/lib/nav';
import { getBranding } from '@/lib/portal';
import { currentLang } from '@/lib/session';

export const metadata: Metadata = { title: 'PEAK | Open your company account' };

const display = { fontFamily: 'var(--font-display), var(--font-latin), var(--font-arabic), sans-serif' };

/** Without the portal / with it: the same job, side by side. */
const PAINS: Array<[Key, Key]> = [
  ['join.p1.before', 'join.p1.after'],
  ['join.p2.before', 'join.p2.after'],
  ['join.p3.before', 'join.p3.after'],
  ['join.p4.before', 'join.p4.after'],
];

/**
 * The public page that opens a company account: the problem a business
 * already knows, one campaign walked through the tool from idea to result,
 * who it is for, then the form. Staff get each request as a lead and send
 * the portal invitation themselves. Every feature shown exists today; the
 * small screens are labelled as examples.
 */
export default async function JoinPage() {
  if (getAudience() !== 'client') notFound();
  const lang = await currentLang();
  const branding = await getBranding('client');
  const tx = (key: Key) => t(lang, key);
  const satellites: Satellite[] = [
    { key: 'find', label: tx('join.sat1'), className: 'end-[4%] top-[8%]' },
    { key: 'follow', label: tx('join.sat2'), className: 'start-0 top-[46%]' },
    { key: 'know', label: tx('join.sat3'), className: 'bottom-[6%] end-[12%]' },
  ];
  const stops: Array<{ tag: Key; title: Key; body: Key; icon: IconName; mock: ReactNode }> = [
    { tag: 'join.j1.tag', title: 'join.j1.t', body: 'join.j1.b', icon: 'creators', mock: <MockCreator lang={lang} /> },
    { tag: 'join.j2.tag', title: 'join.j2.t', body: 'join.j2.b', icon: 'compare', mock: <MockCompare lang={lang} /> },
    { tag: 'join.j3.tag', title: 'join.j3.t', body: 'join.j3.b', icon: 'requests', mock: <MockProposal lang={lang} /> },
    { tag: 'join.j4.tag', title: 'join.j4.t', body: 'join.j4.b', icon: 'campaigns', mock: <MockFollow lang={lang} /> },
    { tag: 'join.j5.tag', title: 'join.j5.t', body: 'join.j5.b', icon: 'analytics', mock: <MockResults lang={lang} /> },
  ];

  return (
    <div className="relative">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <BrandMark branding={branding} className="h-12 w-auto max-w-[150px] object-contain" />
        <div className="flex items-center gap-2 sm:gap-4">
          <LanguageSwitch lang={lang} />
          <Link href="/login" className="inline-flex min-h-11 items-center rounded-control border border-white/[0.16] px-4 text-sm font-bold hover:border-ink/50">{tx('join.signIn')}</Link>
        </div>
      </header>

      <main>
        {/* 1. The promise */}
        <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pb-24 lg:pt-12">
          <div className="rise space-y-6">
            <div className="-mb-2 lg:hidden"><PeakPlanet size={84} mark={<BrandMark branding={branding} variant="mark" className="h-auto w-[60%] object-contain" />} /></div>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/[0.1] px-3.5 py-1.5 text-sm font-bold text-accent">
              <Sparkle size={12} /> {tx('join.eyebrow')}
            </span>
            <h1 className="text-balance text-[36px] font-extrabold leading-[1.15] tracking-tight sm:text-[46px] lg:text-[54px]" style={display}>{tx('join.title')}</h1>
            <p className="max-w-xl text-[17px] leading-relaxed text-ink-soft sm:text-lg">{tx('join.lead')}</p>
            <div className="flex flex-wrap gap-3">
              <a href="#register" className="inline-flex h-12 items-center rounded-control bg-accent px-6 text-[16px] font-extrabold text-accent-ink hover:bg-accent/90">{tx('join.cta')}</a>
              <a href="#how" className="inline-flex h-12 items-center rounded-control border border-white/[0.16] px-6 text-[16px] font-bold hover:border-ink/50">{tx('join.see')}</a>
            </div>
            <Reassure lang={lang} />
          </div>
          <div className="hidden justify-center lg:flex">
            <PeakPlanet size={280} mark={<BrandMark branding={branding} variant="mark" className="h-auto w-[60%] object-contain" />} satellites={satellites} />
          </div>
        </section>

        {/* 2. The problem they already know */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:pb-24">
          <h2 className="mb-2 text-[28px] font-extrabold tracking-tight sm:text-[38px]" style={display}>{tx('join.painTitle')}</h2>
          <p className="mb-8 max-w-2xl text-[16px] leading-relaxed text-ink-soft sm:text-[17px]">{tx('join.painLead')}</p>
          <div className="mb-3 hidden grid-cols-2 gap-4 px-1 text-sm font-bold md:grid">
            <span className="text-ink-soft">{tx('join.without')}</span>
            <span className="text-accent">{tx('join.with')}</span>
          </div>
          <ul className="space-y-3">
            {PAINS.map(([before, after]) => (
              <li key={before} className="grid overflow-hidden rounded-[20px] border border-white/[0.07] md:grid-cols-2">
                <p className="flex items-start gap-3 bg-white/[0.02] p-4 text-[15px] leading-relaxed text-ink-soft sm:p-5">
                  <span aria-hidden="true" className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs">✕</span>
                  <span><span className="sr-only">{tx('join.without')}: </span>{tx(before)}</span>
                </p>
                <p className="flex items-start gap-3 border-t border-white/[0.06] p-4 text-[15px] font-semibold leading-relaxed card-surface sm:p-5 md:border-s md:border-t-0">
                  <span aria-hidden="true" className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-extrabold text-accent-ink">✓</span>
                  <span><span className="sr-only">{tx('join.with')}: </span>{tx(after)}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* 3. One campaign, start to finish: the line they follow */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-6 px-4 pb-16 sm:px-6 lg:pb-24">
          <h2 className="mb-2 text-[28px] font-extrabold tracking-tight sm:text-[38px]" style={display}>{tx('join.howTitle')}</h2>
          <p className="mb-10 max-w-2xl text-[16px] leading-relaxed text-ink-soft sm:text-[17px]">{tx('join.howLead')}</p>
          <ol className="relative space-y-10 ps-12 sm:ps-16">
            <span aria-hidden="true" className="absolute bottom-6 start-[19px] top-6 w-[2px] bg-gradient-to-b from-accent via-accent/50 to-accent/10 sm:start-[23px]" />
            {stops.map((s, i) => (
              <li key={s.tag} className="relative grid items-center gap-5 lg:grid-cols-2 lg:gap-10">
                <span aria-hidden="true" className="absolute -start-12 top-0 inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent text-[17px] font-extrabold text-accent-ink shadow-[0_0_0_6px_var(--canvas),0_0_24px_rgb(241_114_5/0.45)] sm:-start-16 sm:h-12 sm:w-12">{i + 1}</span>
                <div>
                  <span className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-accent"><NavIcon name={s.icon} className="h-4 w-4" />{tx(s.tag)}</span>
                  <h3 className="mb-2 text-[22px] font-extrabold leading-snug sm:text-[26px]" style={display}>{tx(s.title)}</h3>
                  <p className="max-w-lg text-[16px] leading-relaxed text-ink-soft">{tx(s.body)}</p>
                </div>
                <figure className="relative max-w-md rounded-[22px] border border-white/[0.08] p-4 shadow-[0_24px_48px_-28px_rgb(0_0_0/0.9)] card-surface sm:p-5">
                  <figcaption className="absolute -top-2.5 end-4 rounded-full border border-white/[0.1] bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-ink-soft">{tx('join.example')}</figcaption>
                  {s.mock}
                </figure>
              </li>
            ))}
          </ol>
        </section>

        {/* 4. Who it is for */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:pb-24">
          <h2 className="mb-8 text-[28px] font-extrabold tracking-tight sm:text-[38px]" style={display}>{tx('join.whoTitle')}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {(['owner', 'team'] as const).map((who) => (
              <div key={who} className="relative overflow-hidden rounded-[24px] border border-white/[0.08] p-6 card-surface sm:p-7">
                <span aria-hidden="true" className="orange-disc -bottom-16 -end-14 h-32 w-32 opacity-80" />
                <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent/[0.14] text-accent"><NavIcon name={who === 'owner' ? 'profile' : 'contacts'} className="h-6 w-6" /></span>
                <h3 className="mb-2 text-[22px] font-extrabold" style={display}>{tx(who === 'owner' ? 'join.who.owner.t' : 'join.who.team.t')}</h3>
                <p className="relative max-w-md text-[16px] leading-relaxed text-ink-soft">{tx(who === 'owner' ? 'join.who.owner.b' : 'join.who.team.b')}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Open the account */}
        <section id="register" className="mx-auto max-w-6xl scroll-mt-6 px-4 pb-20 sm:px-6">
          <div className="relative grid gap-8 overflow-hidden rounded-[28px] border border-white/[0.08] p-5 card-surface sm:p-8 lg:grid-cols-[0.85fr_1.15fr] lg:p-10">
            <span aria-hidden="true" className="orange-disc -bottom-24 -start-20 h-56 w-56 opacity-90" />
            <div className="relative space-y-5">
              <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[38px]" style={display}>{tx('join.formTitle')}</h2>
              <p className="text-[16px] leading-relaxed text-ink-soft">{tx('join.formLead')}</p>
              <ol className="space-y-3">
                {(['join.s1', 'join.s2', 'join.s3'] as const).map((k, i) => (
                  <li key={k} className="flex items-center gap-3 text-[15px] font-semibold">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/50 text-sm font-extrabold text-accent">{i + 1}</span>
                    {tx(k)}
                  </li>
                ))}
              </ol>
              <Reassure lang={lang} />
            </div>
            <div className="relative"><JoinForm lang={lang} /></div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Reassure({ lang }: { lang: Lang }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-ink-soft">
      {(['join.r1', 'join.r2', 'join.r3'] as const).map((k) => (
        <li key={k} className="inline-flex items-center gap-1.5">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 10.5 3.5 3.5 7.5-8" /></svg>
          {t(lang, k)}
        </li>
      ))}
    </ul>
  );
}

/* The small example screens beside each stop: drawn in the portal's own style, filled with sample figures. */

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[12px] bg-white/[0.04] px-2 py-2 text-center">
      <bdi dir="ltr" className="block text-[15px] font-extrabold">{value}</bdi>
      <span className="block text-[11px] text-ink-soft">{label}</span>
    </div>
  );
}

function MockCreator({ lang }: { lang: Lang }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent/20 text-sm font-extrabold text-accent">SA</span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">{t(lang, 'join.m.creator')}</p>
          <p className="text-xs text-ink-soft">{t(lang, 'join.m.creatorMeta')}</p>
        </div>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">{t(lang, 'join.m.available')}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat value="184K" label={t(lang, 'join.m.followers')} />
        <Stat value="24" label={t(lang, 'join.m.perMonth')} />
        <Stat value="+8%" label={t(lang, 'join.m.growth')} />
      </div>
      <div className="flex items-center justify-between border-t border-white/[0.07] pt-3 text-sm">
        <span className="text-ink-soft">{t(lang, 'join.m.price')}</span>
        <bdi dir="ltr" className="font-extrabold text-accent">OMR 200 – 360</bdi>
      </div>
    </div>
  );
}

function MockCompare({ lang }: { lang: Lang }) {
  const rows: Array<[Key, string, string, 0 | 1]> = [
    ['join.m.followers', '184K', '312K', 1],
    ['join.m.perMonth', '24', '13', 0],
    ['join.m.engagement', '4.6%', '3.1%', 0],
    ['join.m.price', '200', '380', 0],
  ];
  return (
    <div className="space-y-1.5 text-sm">
      <div className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-2 pb-1 text-center text-xs font-bold">
        <span />
        <span className="rounded-full bg-accent/15 py-1 text-accent">{t(lang, 'join.m.a')}</span>
        <span className="rounded-full bg-white/[0.06] py-1">{t(lang, 'join.m.b')}</span>
      </div>
      {rows.map(([label, a, b, best]) => (
        <div key={label} className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-2">
          <span className="text-ink-soft">{t(lang, label)}</span>
          {[a, b].map((v, i) => (
            <bdi key={i} dir="ltr" className={`rounded-lg py-1.5 text-center font-bold ${best === i ? 'bg-accent/[0.14] text-accent' : ''}`}>{best === i ? '★ ' : ''}{v}</bdi>
          ))}
        </div>
      ))}
      <p className="pt-2 text-[13px] font-semibold">{t(lang, 'join.m.summary')}</p>
    </div>
  );
}

function MockProposal({ lang }: { lang: Lang }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-extrabold">{t(lang, 'join.m.proposal')}</p>
        <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-bold text-accent">{t(lang, 'join.m.new')}</span>
      </div>
      <ul className="space-y-1.5 text-sm text-ink-soft">
        <li>• {t(lang, 'join.m.prop1')}</li>
        <li>• {t(lang, 'join.m.prop2')}</li>
        <li>• {t(lang, 'join.m.prop3')}</li>
      </ul>
      <div className="flex gap-2 pt-1">
        <span className="inline-flex h-9 flex-1 items-center justify-center rounded-[10px] bg-accent text-sm font-extrabold text-accent-ink">{t(lang, 'join.m.accept')}</span>
        <span className="inline-flex h-9 flex-1 items-center justify-center rounded-[10px] border border-white/[0.16] text-sm font-bold">{t(lang, 'join.m.decline')}</span>
      </div>
    </div>
  );
}

function MockFollow({ lang }: { lang: Lang }) {
  const items: Array<[Key, 'done' | 'you' | 'todo']> = [['join.m.f1', 'done'], ['join.m.f2', 'you'], ['join.m.f3', 'todo']];
  return (
    <ul className="space-y-2.5 text-sm">
      {items.map(([k, state]) => (
        <li key={k} className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 ${state === 'you' ? 'bg-accent/[0.12]' : 'bg-white/[0.03]'}`}>
          <span aria-hidden="true" className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${state === 'done' ? 'bg-emerald-500/20 text-emerald-300' : state === 'you' ? 'bg-accent text-accent-ink' : 'border border-white/[0.2]'}`}>{state === 'done' ? '✓' : state === 'you' ? '!' : ''}</span>
          <span className={`flex-1 ${state === 'you' ? 'font-bold' : ''}`}>{t(lang, k)}</span>
          <span className={`text-xs font-semibold ${state === 'you' ? 'text-accent' : 'text-ink-soft'}`}>{t(lang, state === 'done' ? 'join.m.posted' : state === 'you' ? 'join.m.yourTurn' : 'join.m.preparing')}</span>
        </li>
      ))}
    </ul>
  );
}

function MockResults({ lang }: { lang: Lang }) {
  return (
    <div className="space-y-3">
      <p className="font-extrabold">{t(lang, 'join.m.campaign')}</p>
      <div className="grid grid-cols-3 gap-2">
        <Stat value="412K" label={t(lang, 'join.m.reach')} />
        <Stat value="5.1%" label={t(lang, 'join.m.engagement')} />
        <Stat value="12/12" label={t(lang, 'join.m.posts')} />
      </div>
      <div className="flex items-center justify-between rounded-[12px] bg-white/[0.03] px-3 py-2.5 text-sm">
        <span className="inline-flex items-center gap-2"><NavIcon name="billing" className="h-4 w-4 text-ink-soft" />{t(lang, 'join.m.invoice')}</span>
        <span className="text-xs font-bold text-accent">PDF</span>
      </div>
    </div>
  );
}
