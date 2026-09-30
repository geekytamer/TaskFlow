import { NextResponse } from 'next/server';
import { forwardClientWrite } from '@/lib/session-route';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { decision?: unknown; reason?: unknown };
  if (body.decision !== 'accept' && body.decision !== 'decline') {
    return NextResponse.json({ message: 'decision must be accept or decline.' }, { status: 400 });
  }
  const action = body.decision === 'accept' ? 'accept' : 'decline';
  return forwardClientWrite(request, `/proposals/${encodeURIComponent(id)}/${action}`, { reason: body.reason });
}
