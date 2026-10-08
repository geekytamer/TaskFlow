import { ImageResponse } from 'next/og';

/** TaskFlow's home-screen icons: a white T on the app's indigo. `?maskable=1` keeps it in the safe zone. */
const SIZES = new Set([180, 192, 512]);

export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response('Not found', { status: 404 });
  const maskable = new URL(request.url).searchParams.get('maskable') === '1';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#5B6AF0' }}>
        <div style={{ fontSize: size * (maskable ? 0.42 : 0.6), fontWeight: 700, color: '#ffffff', lineHeight: 1 }}>T</div>
      </div>
    ),
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
