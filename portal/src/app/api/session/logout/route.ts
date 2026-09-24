import { NextResponse } from 'next/server';
import { getAudience } from '@/lib/audience';
import { backendFetch } from '@/lib/backend';
import { readSessionToken, SESSION_COOKIE } from '@/lib/session';
import { forbidden, requireSameOrigin } from '@/lib/session-route';

export async function POST(request: Request) {
  if (!requireSameOrigin(request)) return forbidden();
  const token = await readSessionToken();
  if (token) await backendFetch(getAudience(), '/auth/logout', { method: 'POST', token });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
