import { PortalShell } from '@/components/portal-shell';
import { redirect } from 'next/navigation';
import { getAudience, getHost } from '@/lib/audience';
import { requireMe } from '@/lib/portal';
import { currentLang } from '@/lib/session';
import { navBadges } from '@/lib/badges';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // The public lobby host has no accounts; everything but the games lives elsewhere.
  if (getHost() === 'lobby') redirect('/games');
  const audience = getAudience();
  const me = await requireMe(audience);
  const [lang, badges] = await Promise.all([currentLang(), navBadges(audience)]);
  return <PortalShell me={me} lang={lang} badges={badges}>{children}</PortalShell>;
}
