import { getAudience } from '@/lib/audience';
import { backendDownload } from '@/lib/backend';
import { readSessionToken } from '@/lib/session';

/** Downloads one of this visitor's own files; the backend decides whether it is theirs. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await readSessionToken();
  if (!token) return new Response(null, { status: 401 });
  return backendDownload(getAudience(), `/files/${encodeURIComponent(id)}/content`, token);
}
