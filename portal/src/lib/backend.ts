import { headers } from 'next/headers';
import type { Audience } from './audience';

const apiBase = () => (process.env.PORTAL_API_URL ?? 'http://127.0.0.1:4005').replace(/\/+$/, '');

export interface BackendResult<T> {
  status: number;
  data: T;
}

/**
 * The only way the portal reaches the backend. Runs on the server, so the
 * session token never touches browser JavaScript. The visitor's address is
 * passed on so the backend's per-address sign-in limit sees the visitor, not
 * this process.
 */
export async function backendFetch<T = Record<string, unknown>>(
  audience: Audience,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown; token?: string } = {},
): Promise<BackendResult<T>> {
  const forwardedFor = (await headers()).get('x-forwarded-for');
  try {
    const response = await fetch(`${apiBase()}/portal-api/${audience}${path}`, {
      method: init.method ?? 'GET',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data: data as T };
  } catch {
    return { status: 503, data: { message: 'The portal is temporarily unavailable.' } as T };
  }
}

/** Headers a file download may carry through to the browser; nothing else is copied. */
const DOWNLOAD_HEADERS = ['content-type', 'content-length', 'content-disposition', 'x-content-type-options', 'content-security-policy', 'cache-control'];

/** A file's bytes from the backend, passed on with the backend's own safe download headers. */
export async function backendDownload(audience: Audience, path: string, token: string): Promise<Response> {
  try {
    const upstream = await fetch(`${apiBase()}/portal-api/${audience}${path}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (upstream.status !== 200) return new Response(null, { status: upstream.status === 401 ? 401 : 404 });
    const headers = new Headers();
    for (const name of DOWNLOAD_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: 200, headers });
  } catch {
    return new Response(null, { status: 503 });
  }
}
