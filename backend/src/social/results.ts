import type { DataStore } from '../data/store';
import { paidContactOf } from '../portal/influencer';
import { openToken } from './crypto';
import { MetaAuthError, MetaRateLimitError, type MetaClient } from './meta-client';
import type { MediaResult } from './social-store';

const HOUR = 3600_000;
const CHECKPOINTS: Array<{ name: MediaResult['checkpoint']; after: number }> = [
  { name: '24h', after: 24 * HOUR },
  { name: '7d', after: 7 * 24 * HOUR },
  { name: '30d', after: 30 * 24 * HOUR },
];

/**
 * Proof of delivery: for each published post from a connected account, take
 * each checkpoint once when it falls due. Posts from accounts that are not
 * connected get nothing; results are never estimated.
 */
export async function sweepMediaResults(store: DataStore, client: MetaClient, companyId: string, now = new Date()): Promise<void> {
  const since = new Date(now.getTime() - 31 * 24 * HOUR).toISOString();
  for (const id of store.social.publishedDeliverableIds(companyId, since)) {
    const d = store.getCampaignDeliverableById(id);
    if (!d?.publishedAt || !d.contentUrl) continue;
    const contactId = paidContactOf(d);
    const account = contactId ? store.social.accountsFor(companyId, contactId).find((a) => a.status === 'active' && a.tokenSealed) : undefined;
    if (!account) continue;
    const taken = store.social.mediaResults(d.id);
    const due = CHECKPOINTS.filter((c) => now.getTime() - new Date(d.publishedAt!).getTime() >= c.after && !taken.some((t) => t.checkpoint === c.name));
    if (due.length === 0) continue;
    try {
      const token = openToken(account.tokenSealed!);
      const mediaId = taken[0]?.mediaId ?? (await client.mediaByPermalink(token, account.externalId, d.contentUrl))?.id;
      if (!mediaId) continue;
      const figures = await client.mediaInsights(token, mediaId);
      // Late sweeps take only the latest due checkpoint: past figures cannot be recovered.
      const checkpoint = due[due.length - 1].name;
      store.social.addMediaResult({ deliverableId: d.id, accountId: account.id, mediaId, checkpoint, ...figures, fetchedAt: now.toISOString() });
    } catch (error) {
      // One post failing (throttled, revoked, unreadable token) must not stop the others;
      // the account sweep flags revoked or unreadable tokens for reconnection.
      if (!(error instanceof MetaAuthError || error instanceof MetaRateLimitError)) {
        store.social.updateAccount(account.id, { lastError: `Results: ${(error as Error).message}`.slice(0, 300) });
      }
      continue;
    }
  }
}

/** The latest result for a deliverable, as anyone allowed to see the deliverable may see it. */
export function resultsDto(store: DataStore, deliverableId: string) {
  const all = store.social.mediaResults(deliverableId);
  const r = all[all.length - 1];
  return r ? { checkpoint: r.checkpoint, views: r.views, likes: r.likes, comments: r.comments, saves: r.saves, shares: r.shares, verified: true as const } : null;
}

export function resultsTotals(rows: Array<ReturnType<typeof resultsDto>>) {
  const present = rows.filter((r): r is NonNullable<typeof r> => r !== null);
  if (present.length === 0) return null;
  const sum = (k: 'views' | 'likes' | 'comments' | 'saves' | 'shares') => present.reduce((s, r) => s + r[k], 0);
  return { posts: present.length, views: sum('views'), likes: sum('likes'), comments: sum('comments'), saves: sum('saves'), shares: sum('shares') };
}
