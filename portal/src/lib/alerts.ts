import type { AlertSettings } from './alert-types';
import { portalFetch } from './client-api';

/** Null when the API cannot answer, so the page still renders without the card. */
export async function getAlertSettings(): Promise<AlertSettings | null> {
  const res = await portalFetch<AlertSettings>('/alerts');
  return res.status === 200 ? res.data : null;
}
