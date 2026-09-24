import Link from 'next/link';
import { AcceptForm } from '@/components/accept-form';
import { AuthFrame } from '@/components/auth-frame';
import { getAudience } from '@/lib/audience';
import { backendFetch } from '@/lib/backend';
import { t } from '@/lib/i18n';
import { getBranding } from '@/lib/portal';
import { currentLang } from '@/lib/session';

export default async function AcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const audience = getAudience();
  const lang = await currentLang();
  const [branding, invitation] = await Promise.all([
    getBranding(audience),
    backendFetch<{ name: string; email: string }>(audience, `/invitations/${encodeURIComponent(token)}`),
  ]);
  const tagline = t(lang, audience === 'client' ? 'signIn.client' : 'signIn.influencer');

  if (invitation.status !== 200) {
    return (
      <AuthFrame branding={branding} lang={lang} tagline={tagline}>
        <h1 className="mb-3 text-2xl font-semibold tracking-tight">{t(lang, 'invite.invalidTitle')}</h1>
        <p className="mb-8 leading-relaxed text-ink-soft">{t(lang, 'invite.invalidBody')}</p>
        <Link href="/login" className="text-sm font-semibold text-ink underline underline-offset-4">
          {t(lang, 'invite.toSignIn')}
        </Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame branding={branding} lang={lang} tagline={tagline}>
      <p className="mb-1 text-sm text-ink-soft">{t(lang, 'accept.welcome')}</p>
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">{invitation.data.name}</h1>
      <p className="mb-8 leading-relaxed text-ink-soft">{t(lang, 'accept.subtitle')}</p>
      <AcceptForm
        token={token}
        strings={{
          password: t(lang, 'field.password'),
          confirm: t(lang, 'accept.confirm'),
          submit: t(lang, 'accept.submit'),
          submitting: t(lang, 'accept.submitting'),
          mismatch: t(lang, 'accept.mismatch'),
          tooShort: t(lang, 'accept.tooShort'),
          failed: t(lang, 'accept.failed'),
        }}
      />
    </AuthFrame>
  );
}
