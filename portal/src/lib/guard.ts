import { notFound } from 'next/navigation';
import { getAudience, type Audience } from './audience';

/**
 * Audience-only pages call this first, so the other host answers 404 for them.
 * The backend also refuses a session of the wrong audience on every call, so
 * this is the visible half of the separation, not the only half.
 */
export function requireAudience(required: Audience): Audience {
  const current = getAudience();
  if (current !== required) notFound();
  return current;
}
