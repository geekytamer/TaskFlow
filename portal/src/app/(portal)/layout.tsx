import { PortalShell } from '@/components/portal-shell';
import { redirect } from 'next/navigation';
import { getAudience, getHost } from '@/lib/audience';
import { requireMe } from '@/lib/portal';
import { currentLang } from '@/lib/session';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // The public lobby host has no accounts; everything but the games lives elsewhere.
  if (getHost() === 'lobby') redirect('/games');
  const me = await requireMe(getAudience());
  return <PortalShell me={me} lang={await currentLang()}>{children}</PortalShell>;
}
