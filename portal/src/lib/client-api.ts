import { redirect } from 'next/navigation';
import { backendFetch } from './backend';
import { readSessionToken } from './session';

/** A read from the client audience's API with this visitor's session; an expired session goes to sign in. */
export async function clientFetch<T>(path: string): Promise<{ status: number; data: T }> {
  const token = await readSessionToken();
  if (!token) redirect('/login');
  const res = await backendFetch<T>('client', path, { token });
  if (res.status === 401) redirect('/login');
  return res;
}

export async function clientGet<T>(path: string): Promise<T> {
  const res = await clientFetch<T>(path);
  if (res.status !== 200) throw new Error(`The portal API answered ${res.status} for ${path}.`);
  return res.data;
}

/** Null on 404, so pages can render their not-found state. */
export async function clientGetOrNull<T>(path: string): Promise<T | null> {
  const res = await clientFetch<T>(path);
  if (res.status === 404) return null;
  if (res.status !== 200) throw new Error(`The portal API answered ${res.status} for ${path}.`);
  return res.data;
}
