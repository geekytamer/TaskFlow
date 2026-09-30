import { forwardClientWrite } from '@/lib/session-route';

export async function POST(request: Request, { params }: { params: Promise<{ id: string; deliverableId: string }> }) {
  const { id, deliverableId } = await params;
  const body = (await request.json().catch(() => ({}))) as { decision?: unknown; comment?: unknown };
  return forwardClientWrite(
    request,
    `/campaigns/${encodeURIComponent(id)}/deliverables/${encodeURIComponent(deliverableId)}/review`,
    { decision: body.decision, comment: body.comment },
  );
}
