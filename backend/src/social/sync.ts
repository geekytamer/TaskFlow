import type { DataStore } from '../data/store';
import { openToken, sealToken } from './crypto';
import { MetaAuthError, MetaRateLimitError, type MetaClient } from './meta-client';
import type { ConnectedAccount } from './social-store';
import { sweepMediaResults } from './results';

const DAY = 86400_000;
const REFRESH_WITHIN = 7 * DAY;
/** A connected influencer's profile picture is taken again once it is this old. */
const PHOTO_EVERY = 7 * DAY;

/** Downloads an image; absent in tests that do not care about photos. */
export type ImageDownloader = (url: string) => Promise<{ bytes: Buffer; type: string } | null>;

/** Connected influencers are not scraped, so their directory photo comes from the connection, weekly. */
async function savePicture(store: DataStore, account: ConnectedAccount, pictureUrl: string | null, download: ImageDownloader | undefined, now: Date) {
  if (!pictureUrl || !download) return;
  const entry = store.discover.rosterProfiles(account.companyId).find((p) => p.contactId === account.contactId);
  if (!entry) return;
  const at = store.discover.rosterPhotos(account.companyId)[account.contactId];
  if (at && now.getTime() - Date.parse(at) < PHOTO_EVERY) return;
  const photo = await download(pictureUrl);
  if (photo) store.discover.savePhoto(entry.id, photo, now.toISOString());
}

const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/** Marks an account for reconnection, telling its owner once (on the change, not every sweep). */
function needsReconnect(store: DataStore, account: ConnectedAccount, message: string) {
  if (account.status === 'needs_reconnect') return;
  store.social.updateAccount(account.id, { status: 'needs_reconnect', lastError: message.slice(0, 300) });
  const contact = store.getContactById(account.contactId);
  if (contact?.ownerUserId) {
    store.notify({
      companyId: account.companyId, userIds: [contact.ownerUserId], type: 'followup_assigned',
      title: `${contact.name} needs to reconnect Instagram (@${account.username})`,
      data: { tKey: 'notif.followupAssigned.t', name: `${contact.name}: reconnect Instagram` },
      link: '/influencers', entityType: 'contact', entityId: contact.id,
    });
  }
}

/** One account: refresh a token close to expiry, then take today's snapshot if there is none yet. */
export async function syncAccount(store: DataStore, client: MetaClient, account: ConnectedAccount, now = new Date(), download?: ImageDownloader): Promise<void> {
  if (account.status !== 'active' || !account.tokenSealed) return;
  const today = dayOf(now);
  let token: string;
  try {
    token = openToken(account.tokenSealed);
  } catch {
    // Sealed under a key that is gone: only a fresh connection can fix it.
    return needsReconnect(store, account, 'The saved token could not be read.');
  }
  try {
    if (account.expiresAt && Date.parse(account.expiresAt) - now.getTime() < REFRESH_WITHIN) {
      const fresh = await client.refresh(token);
      token = fresh.accessToken;
      store.social.updateAccount(account.id, { tokenSealed: sealToken(token), expiresAt: fresh.expiresAt.toISOString() });
    }
    if (!store.social.hasSnapshot(account.id, today)) {
      const [profile, insights] = await Promise.all([client.profile(token), client.accountInsights(token, account.externalId)]);
      store.social.addSnapshot({
        accountId: account.id, takenOn: today, followers: profile.followers,
        views: insights.views, reach: insights.reach, engagedAccounts: insights.engagedAccounts,
        demographics: insights.demographics,
      });
      await savePicture(store, account, profile.pictureUrl, download, now);
    }
    store.social.updateAccount(account.id, { lastSyncAt: now.toISOString(), lastError: null });
  } catch (error) {
    if (error instanceof MetaAuthError) return needsReconnect(store, account, error.message);
    if (error instanceof MetaRateLimitError) return void store.social.updateAccount(account.id, { lastError: 'Rate limited; will retry.' });
    store.social.updateAccount(account.id, { lastError: (error as Error).message.slice(0, 300) });
  }
}

/** The hourly sweep: every active account at most once a day, plus post result checkpoints. */
export async function sweepSocial(store: DataStore, client: MetaClient, companyId: string, now = new Date(), download?: ImageDownloader): Promise<void> {
  for (const account of store.social.activeAccounts(companyId)) {
    await syncAccount(store, client, account, now, download);
  }
  await sweepMediaResults(store, client, companyId, now);
}
