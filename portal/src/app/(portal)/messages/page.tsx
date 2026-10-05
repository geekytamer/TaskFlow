import Link from 'next/link';
import { FileList } from '@/components/file-list';
import { MessageComposer } from '@/components/message-composer';
import { EmptyState, PageHeader, textLink } from '@/components/ui';
import { WhatsAppAlerts } from '@/components/whatsapp-alerts';
import { getAlertSettings } from '@/lib/alerts';
import { getAudience } from '@/lib/audience';
import { formatDateTime } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';
import { getMessages, type Message } from '@/lib/messages';
import { currentLang } from '@/lib/session';

/** A long thread opens on its latest messages; the rest is one tap away. */
const RECENT = 30;

const authorLabel = (m: Message, lang: Lang) =>
  m.author.kind === 'you' ? t(lang, 'msg.you') : m.author.name ?? t(lang, m.author.kind === 'team' ? 'msg.team' : 'msg.colleague');

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const audience = getAudience();
  const lang = await currentLang();
  const all = (await searchParams).all === '1';
  const [messages, alerts] = await Promise.all([getMessages(), getAlertSettings().catch(() => null)]);
  const hidden = all ? 0 : Math.max(0, messages.length - RECENT);
  const shown = messages.slice(hidden);

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader title={t(lang, 'msg.title')} subtitle={t(lang, audience === 'client' ? 'msg.subtitle' : 'msg.subtitleInfluencer')} />

      {messages.length === 0 ? (
        <EmptyState title={t(lang, 'msg.emptyTitle')} body={t(lang, 'msg.emptyBody')} />
      ) : (
        <section aria-label={t(lang, 'msg.title')} className="space-y-4">
          {hidden > 0 && (
            <Link href="/messages?all=1" className={textLink}>{t(lang, 'msg.earlier').replace('{n}', String(hidden))}</Link>
          )}
          <ol className="space-y-3">
            {shown.map((m) => {
              const mine = m.author.kind === 'you';
              const team = m.author.kind === 'team';
              return (
                <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <article className={`max-w-[88%] rounded-panel px-4 py-3 sm:max-w-[80%] ${team ? 'border border-line bg-surface' : 'bg-accent/[0.08]'}`}>
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-semibold"><bdi>{authorLabel(m, lang)}</bdi></span>
                      {team && <span className="text-ink-soft">{t(lang, 'msg.teamTag')}</span>}
                      <time dateTime={m.createdAt} className="text-ink-soft"><bdi>{formatDateTime(m.createdAt, lang)}</bdi></time>
                    </p>
                    <p dir="auto" className="mt-1.5 whitespace-pre-line leading-relaxed [overflow-wrap:anywhere]">{m.body}</p>
                    {m.files.length > 0 && <div className="mt-3"><FileList files={m.files} lang={lang} /></div>}
                  </article>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <MessageComposer lang={lang} />

      {alerts && <WhatsAppAlerts lang={lang} initial={alerts} />}
    </div>
  );
}
