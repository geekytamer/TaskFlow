import { redirect } from 'next/navigation';
import { AuthFrame } from '@/components/auth-frame';
import { LoginForm } from '@/components/login-form';
import { getAudience } from '@/lib/audience';
import { t } from '@/lib/i18n';
import { getBranding, getMeOrNull } from '@/lib/portal';
import { currentLang } from '@/lib/session';

export default async function LoginPage() {
  const audience = getAudience();
  if (await getMeOrNull(audience)) redirect('/');
  const lang = await currentLang();
  const branding = await getBranding(audience);

  return (
    <AuthFrame branding={branding} lang={lang} tagline={t(lang, audience === 'client' ? 'signIn.client' : 'signIn.influencer')}>
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">{t(lang, 'signIn.title')}</h1>
      <LoginForm
        strings={{
          email: t(lang, 'field.email'),
          password: t(lang, 'field.password'),
          submit: t(lang, 'signIn.submit'),
          submitting: t(lang, 'signIn.submitting'),
          failed: t(lang, 'signIn.failed'),
          throttled: t(lang, 'signIn.throttled'),
          unavailable: t(lang, 'signIn.unavailable'),
        }}
      />
      <p className="mt-8 text-sm text-ink-soft">{t(lang, 'signIn.help')}</p>
    </AuthFrame>
  );
}
