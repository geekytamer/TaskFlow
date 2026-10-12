import { forwardClientWrite } from '@/lib/session-route';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { note?: unknown };
  return forwardClientWrite(request, `/discover/${encodeURIComponent(id)}/request`, { note: typeof body.note === 'string' ? body.note : undefined });
}
