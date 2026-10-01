import { NextResponse } from 'next/server';
import { getAudience, type Audience } from './audience';
import { backendFetch } from './backend';
import { isSameOrigin } from './origin';
import { readSessionToken, SESSION_COOKIE, sessionCookie } from './session';

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

/**
 * Forwards one write to the backend with this visitor's session. Only named
 * paths are forwarded; there is no general proxy. `only` pins a route to one
 * audience, so the other host answers 404 for it.
 */
export async function forwardWrite(request: Request, path: string, body: unknown, only?: Audience) {
  if (!requireSameOrigin(request)) return forbidden();
  const audience = getAudience();
  if (only && audience !== only) return NextResponse.json({ message: 'Not found.' }, { status: 404 });
  const token = await readSessionToken();
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const result = await backendFetch<unknown>(audience, path, { method: 'POST', token, body });
  return NextResponse.json(result.data, { status: result.status });
}

export const forwardClientWrite = (request: Request, path: string, body: unknown) => forwardWrite(request, path, body, 'client');
