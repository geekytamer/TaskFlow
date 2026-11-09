import { forwardClientWrite } from '@/lib/session-route';

/** "I've made a transfer": the receipt rides along as base64; the backend checks the invoice is theirs. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  return forwardClientWrite(request, `/invoices/${encodeURIComponent(id)}/transfers`, body);
}
