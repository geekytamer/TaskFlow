import { AuthFrame } from '@/components/auth-frame';
import { getHost } from '@/lib/audience';
import { t } from '@/lib/i18n';
import { getBranding } from '@/lib/portal';
import { currentLang } from '@/lib/session';

/**
 * Where Meta sends someone who asked for their Instagram data to be deleted.
 * The deletion happens when Meta calls us, so by the time this page is read it is done.
 */
export default async function DataDeletionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const host = getHost();
  const lang = await currentLang();
  const code = (await searchParams).code;
  return (
    <AuthFrame branding={await getBranding(host === 'lobby' ? 'client' : host)} lang={lang} tagline={t(lang, 'deletion.tagline')}>
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">{t(lang, 'deletion.title')}</h1>
      <p className="mb-6 max-w-[65ch] leading-relaxed text-ink-soft">{t(lang, 'deletion.body')}</p>
      {typeof code === 'string' && /^[0-9a-f]{16}$/.test(code) && (
        <p className="text-sm">{t(lang, 'deletion.code')} <bdi dir="ltr" className="font-mono font-medium">{code}</bdi></p>
      )}
    </AuthFrame>
  );
}
