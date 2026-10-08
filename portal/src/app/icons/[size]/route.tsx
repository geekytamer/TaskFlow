import { ImageResponse } from 'next/og';
import { getHost } from '@/lib/audience';
import { getBranding } from '@/lib/portal';

/**
 * App icons for the home screen, drawn from the company's initial in its own
 * colours: the near-black ground and the brand orange. `?maskable=1` keeps
 * the letter inside the safe zone launchers crop to.
 */
export const dynamic = 'force-dynamic';

const SIZES = new Set([180, 192, 512]);

export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response('Not found', { status: 404 });
  const maskable = new URL(request.url).searchParams.get('maskable') === '1';
  const host = getHost();
  const branding = await getBranding(host === 'lobby' ? 'client' : host).catch(() => null);
  const initial = (branding?.name?.trim()[0] ?? 'P').toUpperCase();
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505' }}>
        <div style={{ fontSize: size * (maskable ? 0.42 : 0.6), fontWeight: 700, color: '#ee7103', lineHeight: 1 }}>{initial}</div>
      </div>
    ),
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
