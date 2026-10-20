import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Home-screen icons: the Al Yarubi Group drop on white. `?maskable=1` keeps it in the safe zone. */
const FILES: Record<string, string> = {
  '180': 'icon-180.png',
  '192': 'icon-192.png',
  '512': 'icon-512.png',
};

export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = (await params).size;
  if (!FILES[size]) return new Response('Not found', { status: 404 });
  const maskable = new URL(request.url).searchParams.get('maskable') === '1';
  const file = maskable && size === '512' ? 'icon-512-maskable.png' : FILES[size];
  const body = await readFile(path.join(process.cwd(), 'public', 'brand', file));
  return new Response(new Uint8Array(body), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
  });
}
