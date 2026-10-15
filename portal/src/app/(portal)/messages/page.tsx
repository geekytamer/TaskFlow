import { redirect } from 'next/navigation';
import { EmptyState, PageHeader, RowLink, list } from '@/components/ui';
import { PhoneNotifications } from '@/components/phone-notifications';
import { WhatsAppAlerts } from '@/components/whatsapp-alerts';
import { getAlertSettings } from '@/lib/alerts';
import { getAudience } from '@/lib/audience';
import { t } from '@/lib/i18n';
import { getThreads } from '@/lib/messages';
import { currentLang } from '@/lib/session';
import { previewLine, relativeTime, threadTitle } from '@/lib/thread-labels';

export default async function MessagesPage() {
  const audience = getAudience();
  const lang = await currentLang();
  const threads = await getThreads();
  // One conversation needs no list.
  if (threads.length === 1) redirect(`/messages/${encodeURIComponent(threads[0].id)}`);
  const alerts = audience === 'client' ? await getAlertSettings().catch(() => null) : null;
  const now = Date.now();

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t(lang, 'msg.threads')} subtitle={t(lang, audience === 'client' ? 'msg.subtitle' : 'msg.subtitleInfluencer')} />

      {threads.length === 0 ? (
        <EmptyState title={t(lang, 'msg.emptyTitle')} body={t(lang, 'msg.emptyBody')} />
      ) : (
        <ul className={list}>
          {threads.map((th) => (
            <li key={th.id}>
              <RowLink href={`/messages/${encodeURIComponent(th.id)}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className={`flex min-w-0 items-center gap-2 ${th.unread ? 'font-semibold' : 'font-medium'}`}>
                    {th.unread && <span role="img" aria-label={t(lang, 'msg.unread')} className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                    <span className="truncate"><bdi>{threadTitle(th.subject, lang)}</bdi></span>
                  </p>
                  <time dateTime={th.lastMessageAt ?? undefined} className="shrink-0 text-xs text-ink-soft"><bdi>{relativeTime(th.lastMessageAt, now, lang)}</bdi></time>
                </div>
                {th.lastMessage && (
                  <p dir="auto" className={`mt-0.5 line-clamp-2 text-sm [overflow-wrap:anywhere] ${th.unread ? 'text-ink' : 'text-ink-soft'}`}>{previewLine(th.lastMessage, lang)}</p>
                )}
              </RowLink>
            </li>
          ))}
        </ul>
      )}

      {audience === 'client' && <PhoneNotifications lang={lang} />}
      {alerts && <WhatsAppAlerts lang={lang} initial={alerts} />}
    </div>
  );
}
