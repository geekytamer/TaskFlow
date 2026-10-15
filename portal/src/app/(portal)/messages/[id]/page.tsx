import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBadge } from '@/components/app-badge';
import { FileList } from '@/components/file-list';
import { MessageComposer } from '@/components/message-composer';
import { ScrollToLatest } from '@/components/scroll-to-latest';
import { EmptyState, PageHeader, textLink } from '@/components/ui';
import { WhatsAppAlerts } from '@/components/whatsapp-alerts';
import { PhoneNotifications } from '@/components/phone-notifications';
import { AlertMatrix } from '@/components/alert-matrix';
import { InstallAppCard } from '@/components/install-app-card';
import { getAlertSettings } from '@/lib/alerts';
import { getAudience } from '@/lib/audience';
import { formatDate } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';
import { groupMessages, localDay } from '@/lib/message-groups';
import { getThread, getThreads } from '@/lib/messages';
import { currentLang } from '@/lib/session';
import { authorLine, threadTitle } from '@/lib/thread-labels';

/** A long thread opens on its latest messages; the rest is one tap away. */
const RECENT = 30;
const ZONE = process.env.PORTAL_TIME_ZONE ?? 'Asia/Muscat';
const locale = (lang: Lang) => (lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB');

function dayLabel(day: string, lang: Lang) {
  const today = localDay(new Date().toISOString(), ZONE);
  const yesterday = localDay(new Date(Date.now() - 86_400_000).toISOString(), ZONE);
  if (day === today) return t(lang, 'msg.today');
  if (day === yesterday) return t(lang, 'msg.yesterday');
  return formatDate(day, lang);
}

const time = (iso: string, lang: Lang) => new Intl.DateTimeFormat(locale(lang), { timeStyle: 'short', timeZone: ZONE }).format(new Date(iso));

export default async function ThreadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const audience = getAudience();
  const lang = await currentLang();
  const all = (await searchParams).all === '1';
  // Influencers manage WhatsApp alerts on their Profile; clients have no Profile page, so theirs stay here.
  const [detail, alerts] = await Promise.all([getThread(id), audience === 'client' ? getAlertSettings().catch(() => null) : Promise.resolve(null)]);
  if (!detail) notFound();
  // Opening the thread read it; what is left unread elsewhere goes on the app icon.
  const unreadThreads = await getThreads().then((ts) => ts.filter((th) => th.unread).length).catch(() => null);
  const { messages } = detail;
  const hidden = all ? 0 : Math.max(0, messages.length - RECENT);
  const days = groupMessages(messages.slice(hidden), ZONE);
  const lastId = messages.at(-1)?.id;

  return (
    <div className="max-w-3xl space-y-6">
      {unreadThreads !== null && <AppBadge count={unreadThreads} />}
      <PageHeader back={{ href: '/messages', label: t(lang, 'msg.backToThreads') }} title={<bdi>{threadTitle(detail.thread.subject, lang)}</bdi>} />

      {messages.length === 0 ? (
        <EmptyState title={t(lang, 'msg.emptyTitle')} body={t(lang, 'msg.threadEmpty')} />
      ) : (
        <section aria-label={t(lang, 'msg.title')} className="space-y-6">
          {hidden > 0 && (
            <Link href={`/messages/${encodeURIComponent(id)}?all=1`} className={textLink}>{t(lang, 'msg.earlier').replace('{n}', String(hidden))}</Link>
          )}
          {days.map((d) => (
            <div key={d.day} className="space-y-2">
              <h2 className="flex items-center gap-3 py-1 text-xs font-medium text-ink-soft before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
                <bdi>{dayLabel(d.day, lang)}</bdi>
              </h2>
              <ol className="space-y-1">
                {d.items.map(({ message: m, first }) => {
                  const mine = m.author.kind === 'you';
                  const team = m.author.kind === 'team';
                  return (
                    <li key={m.id} id={m.id === lastId ? 'latest' : undefined} className={`flex scroll-mb-40 ${mine ? 'justify-end' : 'justify-start'} ${first ? 'pt-2' : ''}`}>
                      <article className={`max-w-[85%] rounded-panel px-4 py-2.5 sm:max-w-[75%] ${mine ? 'bg-accent/[0.12]' : team ? 'border border-line bg-surface' : 'bg-ink/[0.06]'}`}>
                        {first && (
                          <p className="mb-0.5 flex flex-wrap items-baseline gap-x-2 text-sm">
                            <span className="font-semibold"><bdi>{authorLine(m.author, lang)}</bdi></span>
                          </p>
                        )}
                        <p dir="auto" className="whitespace-pre-line leading-relaxed [overflow-wrap:anywhere]">{m.body}</p>
                        {m.files.length > 0 && <div className="mt-2.5"><FileList files={m.files} lang={lang} /></div>}
                        <p className="mt-1 text-end text-xs text-ink-soft">
                          <time dateTime={m.createdAt}><bdi>{time(m.createdAt, lang)}</bdi></time>
                        </p>
                      </article>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
          <ScrollToLatest targetId="latest" latestId={lastId} />
        </section>
      )}

      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 bg-canvas/95 px-4 pb-3 pt-2 backdrop-blur-sm sm:mx-0 sm:px-0 lg:static lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <MessageComposer lang={lang} threadId={id} />
      </div>

      {audience === 'client' && <InstallAppCard lang={lang} />}
      {audience === 'client' && <PhoneNotifications lang={lang} />}
      {alerts && <AlertMatrix lang={lang} audience="client" initial={alerts} />}
      {alerts && <WhatsAppAlerts lang={lang} initial={alerts} />}
    </div>
  );
}
