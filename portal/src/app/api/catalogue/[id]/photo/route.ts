import { getAudience } from '@/lib/audience';
import { backendDownload } from '@/lib/backend';
import { readSessionToken } from '@/lib/session';

/** A listed influencer's Instagram photo, stored by Peak (Instagram's own image links expire). Clients only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (getAudience() !== 'client') return new Response(null, { status: 404 });
  const { id } = await params;
  const token = await readSessionToken();
  if (!token) return new Response(null, { status: 401 });
  return backendDownload('client', `/catalogue/${encodeURIComponent(id)}/photo`, token);
}
