import Link from 'next/link';
import { AuthFrame } from '@/components/auth-frame';
import { getAudience } from '@/lib/audience';
import { t } from '@/lib/i18n';
import { getBranding } from '@/lib/portal';
import { currentLang } from '@/lib/session';

export default async function NotFound() {
  const audience = getAudience();
  const lang = await currentLang();
  return (
    <AuthFrame
      branding={await getBranding(audience)}
      lang={lang}
      tagline={t(lang, audience === 'client' ? 'signIn.client' : 'signIn.influencer')}
    >
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">{t(lang, 'notFound.title')}</h1>
      <p className="mb-8 leading-relaxed text-ink-soft">{t(lang, 'notFound.body')}</p>
      <Link href="/" className="text-sm font-semibold text-ink underline underline-offset-4">
        {t(lang, 'notFound.home')}
      </Link>
    </AuthFrame>
  );
}
