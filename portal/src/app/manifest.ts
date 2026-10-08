import type { MetadataRoute } from 'next';
import { getHost } from '@/lib/audience';
import { getBranding } from '@/lib/portal';

export const dynamic = 'force-dynamic';

/** Makes the portal installable: a home-screen icon that opens full screen, like an app. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const host = getHost();
  const branding = await getBranding(host === 'lobby' ? 'client' : host).catch(() => null);
  const name = branding?.name ?? 'Portal';
  return {
    name,
    short_name: name.length > 12 ? name.split(/\s+/)[0] : name,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#050505',
    theme_color: '#050505',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png' },
      { src: '/icons/512?maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
