import type {
  NotificationCategory,
  NotificationPriority,
  NotificationPrefs,
  NotificationType,
} from './types';

/**
 * Static metadata for each notification type: which preference category it
 * belongs to, and whether it's "critical" (emailed immediately) or "normal"
 * (rolled into the daily digest).
 */
export const NOTIFICATION_META: Record<
  NotificationType,
  { category: NotificationCategory; priority: NotificationPriority }
> = {
  task_assigned: { category: 'tasks', priority: 'normal' },
  task_status: { category: 'tasks', priority: 'normal' },
  task_comment: { category: 'tasks', priority: 'normal' },
  task_due: { category: 'tasks', priority: 'critical' },
  invoice_overdue: { category: 'finance', priority: 'critical' },
  invoice_payment: { category: 'finance', priority: 'normal' },
  vendor_bill_approval: { category: 'finance', priority: 'critical' },
  followup_due: { category: 'crm', priority: 'critical' },
  lead_assigned: { category: 'crm', priority: 'normal' },
};

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = ['tasks', 'finance', 'crm'];

/** Everything on by default — users opt out in preferences. */
export function defaultNotificationPrefs(): NotificationPrefs {
  return {
    tasks: { inApp: true, email: true },
    finance: { inApp: true, email: true },
    crm: { inApp: true, email: true },
  };
}

/** Coerce a stored/partial prefs blob into a complete, valid prefs object. */
export function normalizeNotificationPrefs(raw: unknown): NotificationPrefs {
  const base = defaultNotificationPrefs();
  if (!raw || typeof raw !== 'object') return base;
  const input = raw as Record<string, unknown>;
  for (const category of NOTIFICATION_CATEGORIES) {
    const entry = input[category];
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      base[category] = {
        inApp: e.inApp !== false,
        email: e.email !== false,
      };
    }
  }
  return base;
}
