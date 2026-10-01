import { Dashboard } from '@/components/dashboard';
import { getAudience } from '@/lib/audience';
import { getCampaigns } from '@/lib/campaigns';
import { getAssignments } from '@/lib/influencer';
import { requireMe } from '@/lib/portal';
import { getProposals } from '@/lib/requests';
import { currentLang } from '@/lib/session';

export default async function Home() {
  const audience = getAudience();
  const me = await requireMe(audience);
  const lang = await currentLang();
  if (audience !== 'client') {
    const assignments = await getAssignments();
    return <Dashboard me={me} lang={lang} audience={audience} assignments={assignments} />;
  }

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
