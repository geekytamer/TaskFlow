import { apiFetch } from '@/lib/api-client';

export type NotificationCategory = 'tasks' | 'finance' | 'crm' | 'inventory';
export type NotificationPriority = 'critical' | 'normal';

export interface AppNotification {
  id: string;
  companyId: string;
  userId: string;
  category: NotificationCategory;
  type: string;
  priority: NotificationPriority;
  title: string;
  body?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  readAt?: Date;
  emailedAt?: Date;
  createdAt: Date;
}

export interface NotificationChannelPref {
  inApp: boolean;
  email: boolean;
}

export type NotificationPrefs = Record<NotificationCategory, NotificationChannelPref>;

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = ['tasks', 'finance', 'crm', 'inventory'];

const toDate = (v: any) => (v ? new Date(v) : undefined);

function mapNotification(raw: any): AppNotification {
  return {
    ...raw,
    readAt: toDate(raw.readAt),
    emailedAt: toDate(raw.emailedAt),
    createdAt: toDate(raw.createdAt) ?? new Date(),
  };
}

export async function getNotifications(
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<AppNotification[]> {
  const params = new URLSearchParams();
  if (options.unreadOnly) params.set('unreadOnly', 'true');
  if (options.limit) params.set('limit', String(options.limit));
  const query = params.toString() ? `?${params.toString()}` : '';
  const data = await apiFetch<any[]>(`/notifications${query}`);
  return data.map(mapNotification);
}

export async function getUnreadCount(): Promise<number> {
  const data = await apiFetch<{ count: number }>('/notifications/unread-count');
  return data.count ?? 0;
}

/** Lets independent components (e.g. the header bell) refresh after a change. */
export const NOTIFICATIONS_CHANGED_EVENT = 'taskflow-notifications-changed';
function emitNotificationsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`/notifications/${id}/read`, { method: 'POST' });
  emitNotificationsChanged();
}

export async function markAllNotificationsRead(): Promise<number> {
  const data = await apiFetch<{ updated: number }>('/notifications/read-all', { method: 'POST' });
  emitNotificationsChanged();
  return data.updated ?? 0;
}

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  return apiFetch<NotificationPrefs>('/notifications/preferences');
}

export async function updateNotificationPrefs(prefs: NotificationPrefs): Promise<NotificationPrefs> {
  return apiFetch<NotificationPrefs>('/notifications/preferences', {
    method: 'PUT',
    body: JSON.stringify(prefs),
  });
}
