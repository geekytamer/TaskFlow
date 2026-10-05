import Link from 'next/link';
import { AuthFrame } from '@/components/auth-frame';
import { PortalShell } from '@/components/portal-shell';
import { button } from '@/components/ui';
import { getHost } from '@/lib/audience';
import { t, type Lang } from '@/lib/i18n';
import { getBranding, getMeOrNull } from '@/lib/portal';
import { currentLang } from '@/lib/session';

function Message({ lang, home }: { lang: Lang; home: string }) {
  return (
    <div className="max-w-xl py-10">
      <h1 className="text-[28px] font-semibold tracking-tight">{t(lang, 'notFound.title')}</h1>
      <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'notFound.body')}</p>
      <Link href={home} className={`${button.secondary} mt-6`}>{t(lang, 'notFound.home')}</Link>
    </div>
  );
}

export default async function NotFound() {
  // Not getAudience(): on the lobby host that is itself a 404, which would loop.
  const host = getHost();
  const lang = await currentLang();
  // Signed in: stay inside the portal, with its navigation.
  const me = host === 'lobby' ? null : await getMeOrNull(host);
  if (me) return <PortalShell me={me} lang={lang}><Message lang={lang} home="/" /></PortalShell>;
  return (
    <AuthFrame
      branding={await getBranding(host === 'lobby' ? 'client' : host)}
      lang={lang}
      tagline={t(lang, host === 'client' ? 'signIn.client' : host === 'influencer' ? 'signIn.influencer' : 'lobby.tagline')}
    >
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">{t(lang, 'notFound.title')}</h1>
      <p className="mb-8 leading-relaxed text-ink-soft">{t(lang, 'notFound.body')}</p>
      <Link href={host === 'lobby' ? '/games' : '/'} className="text-sm font-semibold text-ink underline underline-offset-4">
        {t(lang, 'notFound.home')}
      </Link>
    </AuthFrame>
  );
}
