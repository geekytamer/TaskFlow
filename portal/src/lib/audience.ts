export type Audience = 'client' | 'influencer';

export function parseAudience(value: string | undefined): Audience {
  if (value === 'client' || value === 'influencer') return value;
  throw new Error(`PORTAL_AUDIENCE must be "client" or "influencer", got ${JSON.stringify(value)}.`);
}

export const getAudience = (): Audience => parseAudience(process.env.PORTAL_AUDIENCE);
