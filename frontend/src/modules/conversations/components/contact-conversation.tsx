'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/context/i18n-context';
import { DATA_CHANGED_EVENT } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { getContactConversation, type ThreadSummary } from '@/services/conversationService';
import { ThreadView } from './thread-view';

/** General first, then the rest by most recent activity. */
export function orderThreads(threads: ThreadSummary[]): ThreadSummary[] {
  const time = (t: ThreadSummary) => (t.lastMessageAt ? new Date(t.lastMessageAt).getTime() : 0);
  return [...threads].sort((a, b) => {
    const ga = a.contextType ? 1 : 0;
    const gb = b.contextType ? 1 : 0;
    return ga - gb || time(b) - time(a);
  });
}

/** The contact's conversation: thread tabs above the timeline. Anchor target for /contacts/<id>#conversation. */
export function ContactConversation({ companyId, contactId }: { companyId: string; contactId: string }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [threads, setThreads] = React.useState<ThreadSummary[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [active, setActive] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    getContactConversation(companyId, contactId)
      .then((r) => {
        const ordered = orderThreads(r.threads);
        setThreads(ordered);
        setFailed(false);
        setActive((cur) => (cur && ordered.some((t) => t.id === cur) ? cur : ordered[0]?.id ?? null));
      })
      .catch(() => setFailed(true));
  }, [companyId, contactId]);

  React.useEffect(() => { setThreads(null); setActive(null); load(); }, [load]);

  // Land on the section when the URL asks for it; the page renders after its data arrives.
  const section = React.useRef<HTMLElement>(null);
  const scrolled = React.useRef(false);
  React.useEffect(() => {
    if (scrolled.current || !threads || typeof window === 'undefined') return;
    if (window.location.hash === '#conversation') {
      scrolled.current = true;
      section.current?.scrollIntoView({ block: 'start' });
    }
  }, [threads]);

  React.useEffect(() => {
    const onChange = () => load();
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, onChange);
  }, [load]);

  const label = (t: ThreadSummary) => (t.contextType ? t.subject : tr('General', 'عام'));

  return (
    <section id="conversation" ref={section} className="scroll-mt-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-sm font-medium">{tr('Conversation', 'المحادثة')}</CardTitle>
          {active && (
            <Link href={`/inbox?thread=${encodeURIComponent(active)}`} className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
              {tr('Open in Inbox', 'فتح في صندوق الوارد')}
            </Link>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {failed && !threads && (
            <p className="text-sm text-muted-foreground">{tr('Could not load the conversation.', 'تعذّر تحميل المحادثة.')}</p>
          )}
          {!failed && !threads && <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>}
          {threads && threads.length === 0 && (
            <p className="text-sm text-muted-foreground">{tr('No conversation yet.', 'لا توجد محادثة بعد.')}</p>
          )}
          {threads && threads.length > 1 && (
            <div role="tablist" className="flex gap-1 overflow-x-auto border-b">
              {threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={t.id === active}
                  onClick={() => setActive(t.id)}
                  className={cn(
                    '-mb-px shrink-0 border-b-2 px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    t.id === active ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label(t)}
                  {t.unread && <span className="ms-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" aria-label={tr('Unread', 'غير مقروء')} />}
                </button>
              ))}
            </div>
          )}
          {active && <ThreadView key={active} threadId={active} onChanged={load} />}
        </CardContent>
      </Card>
    </section>
  );
}
