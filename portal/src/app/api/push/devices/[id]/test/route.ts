import { forwardWrite } from '@/lib/session-route';

/** Sends one test notification to one of this person's devices. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return forwardWrite(request, `/push/devices/${encodeURIComponent((await params).id)}/test`, {});
}
