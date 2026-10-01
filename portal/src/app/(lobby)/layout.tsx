import type { ReactNode } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { LanguageSwitch } from '@/components/language-switch';
import { PortalShell } from '@/components/portal-shell';
import { getHost } from '@/lib/audience';
import { getBranding, requireMe } from '@/lib/portal';
import { currentLang } from '@/lib/session';

/**
 * The games lobby. On the public lobby host it needs no account and shows only
 * the brand and a language switch; inside a portal it sits in the usual shell.
 */
export default async function LobbyLayout({ children }: { children: ReactNode }) {
  const host = getHost();
  const lang = await currentLang();
  if (host !== 'lobby') {
    const me = await requireMe(host);
    return <PortalShell me={me} lang={lang}>{children}</PortalShell>;
  }
  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5 md:px-8">
          <a href="/games"><BrandMark branding={await getBranding('client')} /></a>
          <LanguageSwitch lang={lang} />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-14">{children}</main>
    </div>
  );
}
