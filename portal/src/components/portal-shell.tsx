import Link from 'next/link';
import type { ReactNode } from 'react';
import { t, type Key, type Lang } from '@/lib/i18n';
import { navFor } from '@/lib/nav';
import type { Me } from '@/lib/portal';
import { BrandMark } from './brand-mark';
import { LanguageSwitch } from './language-switch';
import { BottomBar, SidebarNav, type Badges } from './shell-nav';
import { SignOutButton } from './sign-out-button';

/** Who is signed in, for which organisation, with language and sign out. */
function Account({ me, lang }: { me: Me; lang: Lang }) {
  return (
    <div className="space-y-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold" dir="auto">{me.user.name}</p>
        <p className="truncate text-sm text-ink-soft"><bdi dir="auto">{me.subject.name}</bdi> · {t(lang, `role.${me.user.role}` as Key)}</p>
        <p className="truncate text-sm text-ink-soft"><bdi dir="ltr">{me.user.email}</bdi></p>
      </div>
      <div className="flex flex-wrap items-center gap-1 -ms-2">
        <LanguageSwitch lang={lang} />
        <SignOutButton label={t(lang, 'nav.signOut')} />
      </div>
    </div>
  );
}

/** The sidebar's invitation to start a campaign: Peak's orange disc peeking from the corner. */
function StartCampaign({ lang }: { lang: Lang }) {
  return (
    <Link href="/requests/new" className="group relative block overflow-hidden rounded-[20px] border border-accent/30 p-4 card-surface">
      <span aria-hidden="true" className="orange-disc -bottom-14 -end-12 h-28 w-28 transition-transform duration-300 group-hover:scale-110" />
      <span className="relative block text-[17px] font-extrabold" style={{ fontFamily: 'var(--font-display), var(--font-latin), var(--font-arabic), sans-serif' }}>{t(lang, 'shell.startCampaign')}</span>
      <span className="relative mt-1 block max-w-[9.5rem] text-sm leading-relaxed text-ink-soft">{t(lang, 'shell.startCampaignHint')}</span>
    </Link>
  );
}

/**
 * The signed-in frame. Desktop: a sidebar with every page and the account at
 * its foot. Phones: a slim top bar and a bottom tab bar whose More sheet holds
 * the rest, so nothing hides behind a sideways scroll.
 */
export function PortalShell({ me, lang, badges = {}, children }: { me: Me; lang: Lang; badges?: Badges; children: ReactNode }) {
  const nav = navFor(me.user.audience);
  const more = [...nav.primary, ...nav.secondary].filter((e) => !nav.bar.some((b) => b.href === e.href));
  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="hidden border-e border-white/[0.07] bg-[rgb(14_13_12/0.72)] backdrop-blur-md lg:block">
        <div className="sticky top-0 flex h-[100dvh] flex-col gap-7 overflow-y-auto px-4 py-7">
          <div className="px-3"><BrandMark branding={me.company} className="h-16 w-auto object-contain" /></div>
          <div className="flex-1 space-y-6">
            <SidebarNav lang={lang} primary={nav.primary} secondary={nav.secondary} badges={badges} />
            {me.user.audience === 'client' && <StartCampaign lang={lang} />}
          </div>
          <div className="border-t border-line px-3 pt-5"><Account me={me} lang={lang} /></div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[rgb(10_9_8/0.82)] backdrop-blur-md lg:hidden">
          <div className="flex h-14 items-center justify-between gap-4 px-4">
            <BrandMark branding={me.company} variant="mark" />
            <LanguageSwitch lang={lang} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">
          {children}
        </main>
      </div>

      <BottomBar lang={lang} bar={nav.bar} more={more} badges={badges} account={<Account me={me} lang={lang} />} />
    </div>
  );
}
