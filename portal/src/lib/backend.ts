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
