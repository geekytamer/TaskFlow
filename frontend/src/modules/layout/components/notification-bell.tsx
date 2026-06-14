'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { getWhatsappChats } from '@/services/whatsappService';
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATIONS_CHANGED_EVENT,
  type AppNotification,
  type NotificationCategory,
} from '@/services/notificationService';

const CATEGORY_BORDER: Record<NotificationCategory, string> = {
  tasks: 'border-l-sky-500',
  finance: 'border-l-emerald-500',
  crm: 'border-l-violet-500',
};

/** Short relative time, e.g. "5m", "3h", "2d". */
function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

/**
 * Header bell: shows the unread notification count and a feed of the latest
 * notifications (with WhatsApp unread surfaced on top). Polls every 60s and on
 * window focus. Clicking an item marks it read and navigates to the record.
 */
export function NotificationBell() {
  const { selectedCompany } = useCompany();
  const { t } = useI18n();
  const [notifications, setNotifications] = React.useState<AppNotification[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [whatsappUnread, setWhatsappUnread] = React.useState(0);
  const [loading, setLoading] = React.useState(false);

  const companyId = selectedCompany?.id;

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const tasks: Array<Promise<unknown>> = [
        getNotifications({ limit: 15 }).then(setNotifications),
        getUnreadCount().then(setUnread),
      ];
      if (companyId) {
        tasks.push(
          getWhatsappChats(companyId)
            .then((chats) => setWhatsappUnread(chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0)))
            .catch(() => setWhatsappUnread(0)),
        );
      }
      await Promise.allSettled(tasks);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  React.useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 60000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    // Refresh immediately when notifications are read/changed elsewhere
    // (e.g. "Mark all read" on the notifications page).
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onFocus);
    };
  }, [refresh]);

  const handleOpen = (notification: AppNotification) => {
    if (!notification.readAt) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, readAt: new Date() } : n)),
      );
      setUnread((c) => Math.max(0, c - 1));
      markNotificationRead(notification.id).catch(() => undefined);
    }
  };

  const handleMarkAll = async () => {
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date() })));
    setUnread(0);
    await markAllNotificationsRead().catch(() => undefined);
  };

  const total = unread + whatsappUnread;
  const display = total > 99 ? '99+' : String(total);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background/60 transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label={t('notif.button')}
          title={t('notif.button')}
        >
          <Bell className="h-4 w-4" />
          {total > 0 && (
            <span className="absolute -end-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              {display}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">{t('notif.title')}</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={handleMarkAll}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t('notif.markAllRead')}
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {whatsappUnread > 0 && (
            <Link
              href="/whatsapp"
              className="block border-b border-l-4 border-l-green-500 px-3 py-2.5 text-sm transition hover:bg-muted/50"
            >
              <div className="font-medium">
                {t('notif.whatsappTitle').replace('{count}', String(whatsappUnread))}
              </div>
              <div className="text-xs text-muted-foreground">{t('notif.whatsappDetail')}</div>
            </Link>
          )}

          {loading && notifications.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">{t('common.loading')}</div>
          )}
          {!loading && notifications.length === 0 && whatsappUnread === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">{t('notif.empty')}</div>
          )}

          {notifications.map((n) => {
            const inner = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className={`font-medium ${n.readAt ? 'text-muted-foreground' : ''}`}>{n.title}</div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                </div>
                {n.body ? <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div> : null}
              </>
            );
            const cls = `block border-b border-l-4 ${CATEGORY_BORDER[n.category] ?? 'border-l-slate-300'} px-3 py-2.5 text-sm transition hover:bg-muted/50 ${n.readAt ? '' : 'bg-primary/5'}`;
            return n.link ? (
              <Link key={n.id} href={n.link} className={cls} onClick={() => handleOpen(n)}>
                {inner}
              </Link>
            ) : (
              <button key={n.id} type="button" className={`${cls} w-full text-left`} onClick={() => handleOpen(n)}>
                {inner}
              </button>
            );
          })}
        </div>
        <Link
          href="/notifications"
          className="block border-t px-3 py-2 text-center text-xs font-medium text-primary hover:underline"
        >
          {t('notif.viewAll')}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
