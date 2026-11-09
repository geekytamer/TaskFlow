import { getAudience } from '@/lib/audience';
import { backendDownload } from '@/lib/backend';
import { readSessionToken } from '@/lib/session';

/** A cheque image or transfer receipt on one of this client's invoices; the backend decides whether it is theirs. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (getAudience() !== 'client') return new Response(null, { status: 404 });
  const { id } = await params;
  const token = await readSessionToken();
  if (!token) return new Response(null, { status: 401 });
  return backendDownload('client', `/payment-files/${encodeURIComponent(id)}`, token);
}
