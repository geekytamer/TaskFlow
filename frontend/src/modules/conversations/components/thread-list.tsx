'use client';

import * as React from 'react';
import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/context/i18n-context';
import { cn } from '@/lib/utils';
import type { ThreadState, ThreadSummary } from '@/services/conversationService';

interface Props {
  threads: ThreadSummary[] | null;
  selectedId: string | null;
  failed?: boolean;
  onSelect: (id: string) => void;
}

export function stateLabel(state: ThreadState, tr: (en: string, ar: string) => string) {
  switch (state) {
    case 'waiting_us': return tr('Waiting on us', 'بانتظارنا');
    case 'waiting_them': return tr('Waiting on them', 'بانتظارهم');
    case 'snoozed': return tr('Snoozed', 'مؤجّلة');
    default: return tr('Done', 'منتهية');
  }
}

const shortTime = (iso: string | null, locale: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
};

export function ThreadList({ threads, selectedId, failed, onSelect }: Props) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const locale = language === 'ar' ? 'ar-u-nu-latn' : 'en';

  if (failed && !threads) {
    return <p className="p-4 text-sm text-muted-foreground">{tr('Could not load the inbox. Check your connection and try again.', 'تعذّر تحميل صندوق الوارد. تحقق من الاتصال وحاول مجددًا.')}</p>;
  }
  if (!threads) {
    return (
      <div className="space-y-2 p-3" aria-busy>
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }
  if (threads.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        {tr('Nothing here. Conversations that need a reply will show up as they arrive.', 'لا شيء هنا. ستظهر المحادثات التي تحتاج إلى ردّ فور وصولها.')}
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {threads.map((t) => {
        const internal = t.lastMessage?.visibility !== 'external' && !!t.lastMessage;
        const active = t.id === selectedId;
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'flex w-full flex-col gap-1 px-3 py-2.5 text-start transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                active && 'bg-muted',
              )}
            >
              <span className="flex items-baseline gap-2">
                {t.unread && <span className="h-2 w-2 shrink-0 self-center rounded-full bg-primary" aria-label={tr('Unread', 'غير مقروءة')} />}
                <bdi className={cn('min-w-0 flex-1 truncate text-sm', t.unread ? 'font-semibold' : 'font-medium')}>{t.contact.name}</bdi>
                <time className="shrink-0 text-[11px] tabular-nums text-muted-foreground" dateTime={t.lastMessageAt ?? undefined}>
                  {shortTime(t.lastMessageAt, locale)}
                </time>
              </span>
              <span className="truncate text-xs text-muted-foreground"><bdi>{t.subject}</bdi></span>
              {t.lastMessage && (
                <span className={cn('flex items-center gap-1 text-xs', internal ? 'text-amber-800 dark:text-amber-200' : 'text-muted-foreground')}>
                  {internal && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-100 px-1 py-px text-[10px] font-medium dark:bg-amber-950/60">
                      <Lock className="h-2.5 w-2.5" aria-hidden />{tr('Internal', 'داخلي')}
                    </span>
                  )}
                  <bdi className="truncate">
                    {t.lastMessage.authorName ? `${t.lastMessage.authorName}: ` : ''}{t.lastMessage.body}
                  </bdi>
                </span>
              )}
              <span className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <Badge variant={t.state === 'waiting_us' ? 'default' : 'secondary'} className="px-1.5 py-0 text-[10px] font-medium">
                  {stateLabel(t.state, tr)}
                </Badge>
                <span className="truncate text-[11px] text-muted-foreground">
                  {t.assignee ? <bdi>{t.assignee.name}</bdi> : tr('Unassigned', 'غير مُسندة')}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
