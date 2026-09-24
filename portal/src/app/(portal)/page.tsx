import { Dashboard } from '@/components/dashboard';
import { getAudience } from '@/lib/audience';
import { requireMe } from '@/lib/portal';
import { currentLang } from '@/lib/session';

export default async function Home() {
  const audience = getAudience();
  return <Dashboard me={await requireMe(audience)} lang={await currentLang()} audience={audience} />;
}
