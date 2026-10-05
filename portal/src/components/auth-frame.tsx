import type { ReactNode } from 'react';
import type { Lang } from '@/lib/i18n';
import type { Branding } from '@/lib/portal';
import { BrandMark } from './brand-mark';
import { LanguageSwitch } from './language-switch';

/** Split layout shared by sign-in, invitation and not-found. The company leads, the form follows. */
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
    <main className="grid min-h-[100dvh] md:grid-cols-[5fr_7fr]">
      <aside className="flex flex-col justify-between gap-16 border-b border-line bg-surface px-6 py-8 text-ink md:border-b-0 md:border-e md:px-12 md:py-14">
        <BrandMark branding={branding} className="h-20 w-auto self-start object-contain md:h-24" />
        <p className="max-w-sm text-2xl font-semibold leading-snug tracking-tight md:text-[28px]">{tagline}</p>
      </aside>
      <section className="flex flex-col px-6 py-6 md:px-16 md:py-10">
        <div className="flex justify-end"><LanguageSwitch lang={lang} /></div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </section>
    </main>
  );
}
