import { FileList } from '@/components/file-list';
import { MessageComposer } from '@/components/message-composer';
import { formatDateTime } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { getMessages, type Message } from '@/lib/messages';
import { currentLang } from '@/lib/session';
import type { Lang } from '@/lib/i18n';

const authorLabel = (m: Message, lang: Lang) =>
  m.author.kind === 'you' ? t(lang, 'msg.you') : m.author.name ?? t(lang, m.author.kind === 'team' ? 'msg.team' : 'msg.colleague');

export default async function MessagesPage() {
  requireAudience('client');
  const lang = await currentLang();
  const messages = await getMessages();

  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t(lang, 'msg.title')}</h1>
        <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'msg.subtitle')}</p>
      </header>

      {messages.length === 0 ? (
        <section className="border-t border-line pt-8">
          <h2 className="text-xl font-semibold tracking-tight">{t(lang, 'msg.emptyTitle')}</h2>
          <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'msg.emptyBody')}</p>
        </section>
      ) : (
        <ol className="space-y-4" aria-label={t(lang, 'msg.title')}>
          {messages.map((m) => {
            const mine = m.author.kind === 'you';
            return (
              <li key={m.id} className={`rounded-xl border p-4 ${m.author.kind === 'team' ? 'border-line bg-surface' : 'border-transparent bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface))]'} ${mine ? 'ms-8 md:ms-16' : 'me-8 md:me-16'}`}>
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="font-semibold">
                    <bdi>{authorLabel(m, lang)}</bdi>
                    {m.author.kind === 'team' && <span className="ms-2 font-normal text-ink-soft">{t(lang, 'msg.teamTag')}</span>}
                  </span>
                  <time dateTime={m.createdAt} className="text-ink-soft"><bdi>{formatDateTime(m.createdAt, lang)}</bdi></time>
                </p>
                <p dir="auto" className="mt-2 whitespace-pre-line leading-relaxed">{m.body}</p>
                {m.files.length > 0 && <div className="mt-3"><FileList files={m.files} lang={lang} /></div>}
              </li>
            );
          })}
        </ol>
      )}

      <MessageComposer lang={lang} />
    </div>
  );
}
