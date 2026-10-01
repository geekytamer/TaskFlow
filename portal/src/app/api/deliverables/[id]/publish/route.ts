import { forwardWrite } from '@/lib/session-route';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return forwardWrite(request, `/deliverables/${encodeURIComponent(id)}/publish`, body, 'influencer');
}
