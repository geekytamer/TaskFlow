import { getAudience } from '@/lib/audience';
import { backendDownload } from '@/lib/backend';
import { readSessionToken } from '@/lib/session';

/**
 * An influencer's photo from the directory, stored by Peak (Instagram's own
 * image links expire). Clients only. Cards draw it at 48px (64px on the
 * profile), but stored photos run to 300KB, so it is cut down here to a small
 * square (128px, enough for sharp screens) before it leaves: a whole page of
 * cards then costs a few hundred KB, not several MB. The URL carries the
 * photo's date, so the browser keeps it for a day. If resizing is not
 * available the original is sent unchanged.
 */
const SIZE = 128;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (getAudience() !== 'client') return new Response(null, { status: 404 });
  const { id } = await params;
  const token = await readSessionToken();
  if (!token) return new Response(null, { status: 401 });
  const upstream = await backendDownload('client', `/directory/${encodeURIComponent(id)}/photo`, token);
  if (upstream.status !== 200) return upstream;
  try {
    const { default: sharp } = await import('sharp');
    const small = await sharp(Buffer.from(await upstream.arrayBuffer()))
      .resize(SIZE, SIZE, { fit: 'cover' })
      .webp({ quality: 72 })
      .toBuffer();
    return new Response(new Uint8Array(small), {
      status: 200,
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch {
    return backendDownload('client', `/directory/${encodeURIComponent(id)}/photo`, token);
  }
}
