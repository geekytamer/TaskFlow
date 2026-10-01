import { NextResponse } from 'next/server';
import { getAudience } from '@/lib/audience';
import { backendFetch } from '@/lib/backend';
import { readSessionToken, sessionCookieName } from '@/lib/session';
import { forbidden, requireSameOrigin } from '@/lib/session-route';

export async function POST(request: Request) {
  if (!requireSameOrigin(request)) return forbidden();
  const token = await readSessionToken();
  if (token) await backendFetch(getAudience(), '/auth/logout', { method: 'POST', token });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName(), '', { path: '/', maxAge: 0 });
  return response;
}
