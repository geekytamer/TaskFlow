import { notFound } from 'next/navigation';

export type Audience = 'client' | 'influencer';
/** What this deployment serves: one portal audience, or the public games lobby. */
export type Host = Audience | 'lobby';

export function parseHost(value: string | undefined): Host {
  if (value === 'client' || value === 'influencer' || value === 'lobby') return value;
  throw new Error(`PORTAL_AUDIENCE must be "client", "influencer" or "lobby", got ${JSON.stringify(value)}.`);
}

export function parseAudience(value: string | undefined): Audience {
  if (value === 'client' || value === 'influencer') return value;
  throw new Error(`PORTAL_AUDIENCE must be "client" or "influencer", got ${JSON.stringify(value)}.`);
}

export const getHost = (): Host => parseHost(process.env.PORTAL_AUDIENCE);

/**
 * The signed-in audience of this host. The public lobby has none, so anything
 * that needs one (sign-in, sessions, every portal page and write) is a 404 there.
 */
export function getAudience(): Audience {
  const host = getHost();
  if (host === 'lobby') notFound();
  return host;
}
