import { redirect } from 'next/navigation';
import { getAudience } from './audience';
import { backendFetch } from './backend';
import { readSessionToken } from './session';

/**
 * A read from this host's audience API with this visitor's session; an expired
 * session goes to sign in. The backend refuses a session of the wrong audience.
 */
export async function portalFetch<T>(path: string): Promise<{ status: number; data: T }> {
  const token = await readSessionToken();
  if (!token) redirect('/login');
  const res = await backendFetch<T>(getAudience(), path, { token });
  if (res.status === 401) redirect('/login');
  return res;
}

export async function portalGet<T>(path: string): Promise<T> {
  const res = await portalFetch<T>(path);
  if (res.status !== 200) throw new Error(`The portal API answered ${res.status} for ${path}.`);
  return res.data;
}

/** Null on 404, so pages can render their not-found state. */
export async function portalGetOrNull<T>(path: string): Promise<T | null> {
  const res = await portalFetch<T>(path);
  if (res.status === 404) return null;
  if (res.status !== 200) throw new Error(`The portal API answered ${res.status} for ${path}.`);
  return res.data;
}
