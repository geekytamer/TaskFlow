import { forwardClientWrite } from '@/lib/session-route';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardClientWrite(request, `/flexi/applications/${encodeURIComponent(id)}/withdraw`, {});
}
