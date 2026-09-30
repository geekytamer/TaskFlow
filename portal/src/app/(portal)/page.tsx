import { Dashboard } from '@/components/dashboard';
import { getAudience } from '@/lib/audience';
import { getCampaigns } from '@/lib/campaigns';
import { requireMe } from '@/lib/portal';
import { getProposals } from '@/lib/requests';
import { currentLang } from '@/lib/session';

export default async function Home() {
  const audience = getAudience();
  const me = await requireMe(audience);
  const lang = await currentLang();
  if (audience !== 'client') return <Dashboard me={me} lang={lang} audience={audience} />;

  const [proposals, campaigns] = await Promise.all([getProposals(), getCampaigns()]);
  const waiting = proposals.find((p) => p.status === 'sent');
  return (
    <Dashboard
      me={me}
      lang={lang}
      audience={audience}
      waiting={waiting ? { id: waiting.id, title: waiting.title } : undefined}
      campaigns={campaigns}
    />
  );
}
