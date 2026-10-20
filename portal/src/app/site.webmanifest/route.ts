import { getHost } from '@/lib/audience';
import { getBranding } from '@/lib/portal';

export const dynamic = 'force-dynamic';

/**
 * Makes the portal installable on Android and Chrome: a home-screen icon that
 * opens full screen, like an app. The icons are the PEAK mark in public/.
 */
export async function GET() {
  const host = getHost();
  const branding = await getBranding(host === 'lobby' ? 'client' : host).catch(() => null);
  const name = branding?.name ?? 'Portal';
  const manifest = {
    name,
    short_name: name.length > 12 ? name.split(/\s+/)[0] : name,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#050505',
    theme_color: '#050505',
    icons: [
      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: '/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return Response.json(manifest, { headers: { 'Content-Type': 'application/manifest+json' } });
}
