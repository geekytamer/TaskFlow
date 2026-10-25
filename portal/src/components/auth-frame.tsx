import type { ReactNode } from 'react';
import type { Lang } from '@/lib/i18n';
import type { Branding } from '@/lib/portal';
import { BrandMark } from './brand-mark';
import { LanguageSwitch } from './language-switch';
import { PeakPlanet } from './cosmic';

/**
 * Split layout shared by sign-in, invitation and not-found. The company leads
 * on a night stage, its logo held in Peak's orbit; the form follows on a
 * charcoal panel. Phones get the same stage, shorter, with the form in reach.
 */
export function AuthFrame({
  branding,
  lang,
  tagline,
  children,
}: {
  branding: Branding | null;
  lang: Lang;
  tagline: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-[100dvh] md:grid-cols-[6fr_6fr] lg:grid-cols-[7fr_5fr]">
      <aside className="relative flex flex-col items-center justify-center gap-6 overflow-hidden border-b border-line px-6 pb-8 pt-10 text-center md:gap-10 md:border-b-0 md:border-e md:px-12 md:py-14">
        {/* One warm light rising from below the sphere, as on peak-creative.agency. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: 'radial-gradient(50% 60% at 50% 100%, rgb(238 113 3 / 0.12), transparent 70%)' }}
        />
        <div className="relative md:hidden"><PeakPlanet size={120} mark={<BrandMark branding={branding} className="h-auto w-[62%] object-contain" />} /></div>
        <div className="relative hidden md:block"><PeakPlanet size={240} mark={<BrandMark branding={branding} className="h-auto w-[62%] object-contain" />} /></div>
        <p className="rise relative max-w-md text-balance text-[22px] font-extrabold leading-snug tracking-tight md:text-[34px] md:leading-tight" style={{ fontFamily: 'var(--font-display), var(--font-latin), var(--font-arabic), sans-serif', animationDelay: '260ms' }}>
          {tagline}
        </p>
      </aside>
      <section className="flex flex-col px-4 py-5 sm:px-6 md:px-10 md:py-10">
        <div className="flex justify-end"><LanguageSwitch lang={lang} /></div>
        <div className="page-enter mx-auto flex w-full max-w-[26rem] flex-1 flex-col justify-center py-8">
          <div className="rounded-[14px] border border-line bg-surface p-6 shadow-[0_24px_60px_-30px_rgb(0_0_0/0.9)] sm:p-8">{children}</div>
        </div>
      </section>
    </main>
  );
}
