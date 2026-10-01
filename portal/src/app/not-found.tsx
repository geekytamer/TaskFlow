import Link from 'next/link';
import { AuthFrame } from '@/components/auth-frame';
import { getHost } from '@/lib/audience';
import { t } from '@/lib/i18n';
import { getBranding } from '@/lib/portal';
import { currentLang } from '@/lib/session';

export default async function NotFound() {
  // Not getAudience(): on the lobby host that is itself a 404, which would loop.
  const host = getHost();
  const lang = await currentLang();
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
