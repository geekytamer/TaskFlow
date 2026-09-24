import { NextResponse } from 'next/server';
import { getAudience } from './audience';
import { backendFetch } from './backend';
import { isSameOrigin } from './origin';
import { SESSION_COOKIE, sessionCookie } from './session';

export const forbidden = () => NextResponse.json({ message: 'Forbidden' }, { status: 403 });

export const requireSameOrigin = (request: Request) =>
  isSameOrigin({ origin: request.headers.get('origin'), host: request.headers.get('host') });

/** Signs in or accepts an invitation upstream, then keeps the returned token in an httpOnly cookie. */
export async function startSession(request: Request, path: string, body: Record<string, unknown>) {
  if (!requireSameOrigin(request)) return forbidden();
  const result = await backendFetch<{ token?: string; expiresAt?: string; message?: string }>(getAudience(), path, {
    method: 'POST',
    body,
  });
  if (result.status !== 200 || !result.data.token || !result.data.expiresAt) {
    const status = result.status === 200 ? 502 : result.status;
    return NextResponse.json({ message: result.data.message ?? 'Request failed.' }, { status });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, result.data.token, sessionCookie(new Date(result.data.expiresAt)));
  return response;
}
