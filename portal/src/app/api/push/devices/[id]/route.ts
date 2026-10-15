import { NextResponse } from 'next/server';
import { getAudience } from '@/lib/audience';
import { backendFetch } from '@/lib/backend';
import { forbidden, requireSameOrigin } from '@/lib/session-route';
import { readSessionToken } from '@/lib/session';

/** Removes one of this person's devices; the backend answers 404 for anyone else's. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!requireSameOrigin(request)) return forbidden();
  const token = await readSessionToken();
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const res = await backendFetch(getAudience(), `/push/devices/${encodeURIComponent((await params).id)}`, { method: 'DELETE', token });
  return res.status === 204 ? new NextResponse(null, { status: 204 }) : NextResponse.json(res.data, { status: res.status });
}
