import type { ReactNode } from 'react';
import { t, type Lang } from '@/lib/i18n';
import type { Me } from '@/lib/portal';
import { BrandMark } from './brand-mark';
import { LanguageSwitch } from './language-switch';
import { NavLinks, type NavItem } from './nav-links';
import { SignOutButton } from './sign-out-button';

const navFor = (me: Me, lang: Lang): NavItem[] =>
  me.user.audience === 'client'
    ? [
        { href: '/', label: t(lang, 'nav.overview') },
        { href: '/influencers', label: t(lang, 'nav.influencers') },
        { href: '/campaigns', label: t(lang, 'nav.campaigns') },
        { href: '/requests', label: t(lang, 'nav.requests') },
        { href: '/messages', label: t(lang, 'nav.messages') },
        { href: '/referrals', label: t(lang, 'nav.referrals') },
        { href: '/billing', label: t(lang, 'nav.billing') },
      ]
    : [
        { href: '/', label: t(lang, 'nav.overview') },
        { href: '/assignments', label: t(lang, 'nav.assignments') },
        { href: '/payouts', label: t(lang, 'nav.payouts') },
        { href: '/profile', label: t(lang, 'nav.profile') },
        { href: '/messages', label: t(lang, 'nav.messages') },
        { href: '/referrals', label: t(lang, 'nav.referrals') },
      ];

export function PortalShell({ me, lang, children }: { me: Me; lang: Lang; children: ReactNode }) {
  const nav = navFor(me, lang);
  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5 md:px-8">
          <div className="flex min-w-0 items-center gap-6">
            <BrandMark branding={me.company} />
            {nav.length > 1 && (
              <div className="hidden sm:block">
                <NavLinks items={nav} label={t(lang, 'nav.label')} />
              </div>
            )}
          </div>
          <div className="flex items-center">
            <LanguageSwitch lang={lang} />
            <SignOutButton label={t(lang, 'nav.signOut')} />
          </div>
        </div>
        {nav.length > 1 && (
          <div className="border-t border-line px-3 py-2 sm:hidden">
            <NavLinks items={nav} label={t(lang, 'nav.label')} />
          </div>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-14">{children}</main>
    </div>
  );
}
