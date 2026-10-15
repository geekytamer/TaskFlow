/** Browser-safe: the alert settings a portal user sees and saves. */
export type AlertGroup = 'messages' | 'proposals' | 'content' | 'money' | 'invites';
export interface AlertChannels { push: boolean; whatsapp: boolean }
export interface AlertSettings {
  available: boolean;
  whatsapp: boolean;
  phone: string | null;
  lang: 'en' | 'ar';
  /** Per kind of update, whether it reaches the phone and WhatsApp. */
  groups: Record<AlertGroup, AlertChannels>;
  /** Show the start of a message in phone notifications. */
  preview: boolean;
}

/** The kinds of update each audience can get (what the backend actually sends them). */
export const ALERT_GROUPS_FOR: Record<'client' | 'influencer', AlertGroup[]> = {
  client: ['messages', 'proposals', 'content'],
  influencer: ['messages', 'invites', 'content', 'money'],
};

/** A copy of the groups with one channel of one group switched. */
export function setChannel(groups: Record<AlertGroup, AlertChannels>, group: AlertGroup, channel: keyof AlertChannels, on: boolean): Record<AlertGroup, AlertChannels> {
  return { ...groups, [group]: { ...groups[group], [channel]: on } };
}
