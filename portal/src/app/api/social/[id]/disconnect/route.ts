import { forwardWrite } from '@/lib/session-route';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardWrite(request, `/social/${encodeURIComponent(id)}/disconnect`, {}, 'influencer');
}
