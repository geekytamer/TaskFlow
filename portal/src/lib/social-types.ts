/** Safe in the browser: no server imports here. */
export interface SocialAccount {
  id: string;
  platform: 'instagram';
  username: string;
  status: 'active' | 'needs_reconnect' | 'revoked';
  lastSyncAt: string | null;
  followers: number | null;
}
