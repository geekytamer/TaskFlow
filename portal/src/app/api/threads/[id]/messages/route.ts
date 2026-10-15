import { forwardWrite } from '@/lib/session-route';

/** Both audiences write into their own threads; the backend proves the thread is theirs. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return forwardWrite(request, `/threads/${encodeURIComponent(id)}/messages`, body);
}
