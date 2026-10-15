'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { InstallAppCard } from '@/components/install-app-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { PhoneNotificationsCard } from './phone-notifications-card';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import {
  getNotifications,
  getNotificationPrefs,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPrefs,
  localizeNotification,
  NOTIFICATION_CATEGORIES,
  type AppNotification,
  type NotificationCategory,
  type NotificationPrefs,
} from '@/services/notificationService';

const CATEGORY_BORDER: Record<NotificationCategory, string> = {
  tasks: 'border-l-sky-500',
  finance: 'border-l-emerald-500',
  crm: 'border-l-violet-500',
  inventory: 'border-l-amber-500',
  messages: 'border-l-rose-500',
};

function NotificationRow({ n, onOpen }: { n: AppNotification; onOpen: (n: AppNotification) => void }) {
  const { t } = useI18n();
  const when = n.createdAt.toLocaleString();
  const { title, body } = localizeNotification(n, t);
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={`font-medium ${n.readAt ? 'text-muted-foreground' : ''}`}>{title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{when}</span>
      </div>
      {body ? <p className="mt-1 text-sm text-muted-foreground">{body}</p> : null}
    </>
  );
  const cls = `block rounded-lg border border-l-4 ${CATEGORY_BORDER[n.category] ?? 'border-l-slate-300'} p-3 transition hover:bg-muted/40 ${n.readAt ? '' : 'bg-primary/5'}`;
  return n.link ? (
    <Link href={n.link} className={cls} onClick={() => onOpen(n)}>
      {inner}
    </Link>
  ) : (
    <button type="button" className={`${cls} w-full text-left`} onClick={() => onOpen(n)}>
      {inner}
    </button>
  );
}

function PreferencesCard() {
  const { t, language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [prefs, setPrefs] = React.useState<NotificationPrefs | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    getNotificationPrefs().then(setPrefs).catch(() => undefined);
  }, []);

  const update = (category: NotificationCategory, channel: 'inApp' | 'email' | 'push', value: boolean) => {
    setPrefs((prev) => (prev ? { ...prev, [category]: { ...prev[category], [channel]: value } } : prev));
  };

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    try {
      const next = await updateNotificationPrefs(prefs);
      setPrefs(next);
      toast({ title: t('notifPage.prefsSaved') });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!prefs) return null;
  const phoneLabel = language === 'ar' ? 'الهاتف' : 'Phone';

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{t('notifPage.prefsTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('notifPage.prefsSubtitle')}</p>
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-6 border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>{t('notifPage.category')}</span>
          <span>{t('notifPage.inApp')}</span>
          <span>{t('notifPage.email')}</span>
          <span>{phoneLabel}</span>
        </div>
        {NOTIFICATION_CATEGORIES.map((category) => (
          <div key={category} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-6 border-b px-4 py-3 last:border-b-0">
            <span className="text-sm font-medium">{t(`notifPage.cat.${category}`)}</span>
            <Switch aria-label={`${t(`notifPage.cat.${category}`)}: ${t('notifPage.inApp')}`} checked={prefs[category].inApp} onCheckedChange={(v) => update(category, 'inApp', v)} />
            <Switch aria-label={`${t(`notifPage.cat.${category}`)}: ${t('notifPage.email')}`} checked={prefs[category].email} onCheckedChange={(v) => update(category, 'email', v)} />
            <Switch aria-label={`${t(`notifPage.cat.${category}`)}: ${phoneLabel}`} checked={prefs[category].push} onCheckedChange={(v) => update(category, 'push', v)} />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t('notifPage.prefsHint')}</p>
      <div className="mt-4 flex items-start justify-between gap-4 rounded-lg border p-4">
        <div className="min-w-0">
          <Label htmlFor="push-preview" className="text-sm font-semibold">{tr('Show message text in phone notifications', 'إظهار نص الرسالة في إشعارات الهاتف')}</Label>
          <p id="push-preview-hint" className="mt-0.5 text-sm text-muted-foreground">
            {tr('Off: the notification says only who wrote, so nothing private shows on a locked screen. Saved with the button above.', 'عند الإيقاف: يذكر الإشعار المرسل فقط، فلا يظهر شيء خاص على الشاشة المقفلة. يُحفظ بالزر أعلاه.')}
          </p>
        </div>
        <Switch id="push-preview" aria-describedby="push-preview-hint" checked={prefs.pushPreview} onCheckedChange={(v) => setPrefs((prev) => (prev ? { ...prev, pushPreview: v } : prev))} />
      </div>
      <PhoneNotificationsCard />
    </div>
  );
}

export function NotificationsPage() {
  const { t } = useI18n();
  const [notifications, setNotifications] = React.useState<AppNotification[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<'all' | 'unread'>('all');

  const load = React.useCallback(() => {
    setLoading(true);
    getNotifications({ limit: 100 })
      .then(setNotifications)
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const onOpen = (n: AppNotification) => {
    if (n.readAt) return;
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date() } : x)));
    markNotificationRead(n.id).catch(() => undefined);
  };

  const markAll = async () => {
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date() })));
    await markAllNotificationsRead().catch(() => undefined);
  };

  const visible = filter === 'unread' ? notifications.filter((n) => !n.readAt) : notifications;
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <SectionPageShell
      title={t('notifPage.title')}
      description={t('notifPage.subtitle')}
      actions={
        <Button variant="outline" size="sm" onClick={markAll} disabled={unreadCount === 0} className="gap-1">
          <CheckCheck className="h-4 w-4" />
          {t('notif.markAllRead')}
        </Button>
      }
    >
      <InstallAppCard />
      <PreferencesCard />

      <div className="flex items-center gap-2">
        {(['all', 'unread'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-sm ${filter === f ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50'}`}
          >
            {f === 'all' ? t('notifPage.filterAll') : `${t('notifPage.filterUnread')} (${unreadCount})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <SectionEmptyState title={t('notif.empty')} description={t('notifPage.emptyDetail')} />
      ) : (
        <div className="space-y-2">
          {visible.map((n) => (
            <NotificationRow key={n.id} n={n} onOpen={onOpen} />
          ))}
        </div>
      )}
    </SectionPageShell>
  );
}
