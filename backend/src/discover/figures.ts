import type { DataStore } from '../data/store';

export interface InstagramFigure { platform: 'instagram'; username: string; followers: number; asOf: string }

/**
 * An influencer's up-to-date Instagram followers: from a connected account
 * when they chose to connect one, else from the weekly public-profile check
 * (Discover roster sync). Connecting is optional.
 */
export function instagramFigures(store: DataStore, companyId: string, contactId: string): InstagramFigure[] {
  const connected = store.social.verifiedFor(companyId, contactId);
  if (connected.length > 0) return connected;
  const scraped = store.discover.rosterFigure(companyId, contactId);
  return scraped ? [{ platform: 'instagram', ...scraped }] : [];
}
