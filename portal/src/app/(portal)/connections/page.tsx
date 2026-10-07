import { ConnectedAccounts } from '@/components/connected-accounts';
import { PageHeader } from '@/components/ui';
import { requireAudience } from '@/lib/guard';
import { t, type Key } from '@/lib/i18n';
import { currentLang } from '@/lib/session';
import { getSocialAccounts } from '@/lib/social';

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  requireAudience('influencer');
  const lang = await currentLang();
  const [accounts, params] = await Promise.all([getSocialAccounts().catch(() => []), searchParams]);
  // Back from Instagram: ?connected=instagram, with &error=... when it did not work.
  const notice: Key | null = params.connected !== 'instagram' ? null
    : params.error === 'personal_account' ? 'social.errPersonal'
    : params.error === 'taken' ? 'social.errTaken'
    : params.error ? 'social.errCancelled'
    : 'social.connected';
  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader title={t(lang, 'nav.connections')} subtitle={t(lang, 'conn.subtitle')} />
      <ConnectedAccounts lang={lang} accounts={accounts} notice={notice} />
    </div>
  );
}
