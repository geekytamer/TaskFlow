import { headers } from 'next/headers';
import { MediaKitEditor } from '@/components/media-kit-editor';
import { PageHeader } from '@/components/ui';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { currentLang } from '@/lib/session';
import { getContacts, getMediaKit } from '@/lib/workspace';

export default async function MediaKitPage() {
  requireAudience('influencer');
  const lang = await currentLang();
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const [kit, contacts] = await Promise.all([getMediaKit(), getContacts()]);
  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader title={t(lang, 'kit.title')} subtitle={t(lang, 'kit.subtitle')} />
      <MediaKitEditor lang={lang} kit={kit} brands={contacts.filter((c) => c.kind === 'brand' || c.kind === 'agency')} origin={`${proto}://${host}`} />
    </div>
  );
}
