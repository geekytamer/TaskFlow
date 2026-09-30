import { Dashboard } from '@/components/dashboard';
import { getAudience } from '@/lib/audience';
import { requireMe } from '@/lib/portal';
import { getProposals } from '@/lib/requests';
import { currentLang } from '@/lib/session';

export default async function Home() {
  const audience = getAudience();
  const me = await requireMe(audience);
  const waiting = audience === 'client' ? (await getProposals()).find((p) => p.status === 'sent') : undefined;
  return <Dashboard me={me} lang={await currentLang()} audience={audience} waiting={waiting ? { id: waiting.id, title: waiting.title } : undefined} />;
}
