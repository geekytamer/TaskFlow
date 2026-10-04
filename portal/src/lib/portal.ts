import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { Audience } from './audience';
import { backendFetch } from './backend';
import { readSessionToken } from './session';

export interface Branding {
  name: string;
  logoUrl: string | null;
  currency?: string | null;
}

export interface Me {
  user: { name: string; email: string; audience: Audience; role: 'client_admin' | 'client_member' | 'influencer' };
  subject: { name: string };
  company: Branding | null;
}

export const getBranding = cache(async (audience: Audience): Promise<Branding | null> => {
  const res = await backendFetch<Branding>(audience, '/branding');
  return res.status === 200 ? res.data : null;
});

/** The signed-in user or null. A stale cookie simply fails here and the sign-in page replaces it. */
export const getMeOrNull = cache(async (audience: Audience): Promise<Me | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  const res = await backendFetch<Me>(audience, '/me', { token });
  return res.status === 200 ? res.data : null;
});

export const requireMe = cache(async (audience: Audience): Promise<Me> => {
  const token = await readSessionToken();
  if (!token) redirect('/login');
  const res = await backendFetch<Me>(audience, '/me', { token });
  if (res.status === 401) redirect('/login');
  if (res.status !== 200) throw new Error(`The portal API answered ${res.status}.`);
  return res.data;
});
