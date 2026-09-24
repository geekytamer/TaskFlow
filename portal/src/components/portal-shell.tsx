import type { ReactNode } from 'react';
import { t, type Lang } from '@/lib/i18n';
import type { Me } from '@/lib/portal';
import { BrandMark } from './brand-mark';
import { LanguageSwitch } from './language-switch';
import { SignOutButton } from './sign-out-button';

export function PortalShell({ me, lang, children }: { me: Me; lang: Lang; children: ReactNode }) {
  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5 md:px-8">
          <BrandMark branding={me.company} />
          <div className="flex items-center">
            <LanguageSwitch lang={lang} />
            <SignOutButton label={t(lang, 'nav.signOut')} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-14">{children}</main>
    </div>
  );
}
