import { PortalShell } from '@/components/portal-shell';
import { getAudience } from '@/lib/audience';
import { requireMe } from '@/lib/portal';
import { currentLang } from '@/lib/session';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe(getAudience());
  return <PortalShell me={me} lang={await currentLang()}>{children}</PortalShell>;
}
