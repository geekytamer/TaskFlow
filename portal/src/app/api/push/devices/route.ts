import { NextResponse } from 'next/server';
import { getAudience } from '@/lib/audience';
import { backendFetch } from '@/lib/backend';
import { readSessionToken } from '@/lib/session';

/** This person's devices for phone notifications; `endpoint` marks the one asking. */
export async function GET(request: Request) {
  const token = await readSessionToken();
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const endpoint = new URL(request.url).searchParams.get('endpoint');
  const query = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
  const res = await backendFetch(getAudience(), `/push/devices${query}`, { token });
  return NextResponse.json(res.data, { status: res.status });
}
