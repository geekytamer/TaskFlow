import { NextResponse } from 'next/server';
import { getAudience } from '@/lib/audience';
import { backendFetch } from '@/lib/backend';
import { forwardWrite } from '@/lib/session-route';
import { readSessionToken } from '@/lib/session';

/** Phone notifications: the public key, and turning this device on or off. */
export async function GET(_request: Request, { params }: { params: Promise<{ action: string }> }) {
  if ((await params).action !== 'public-key') return NextResponse.json({ message: 'Not found.' }, { status: 404 });
  const token = await readSessionToken();
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const res = await backendFetch(getAudience(), '/push/public-key', { token });
  return NextResponse.json(res.data, { status: res.status });
}

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const action = (await params).action;
  if (action !== 'subscribe' && action !== 'unsubscribe') return NextResponse.json({ message: 'Not found.' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  return forwardWrite(request, `/push/${action}`, body);
}
