'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Info, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { DATA_CHANGED_EVENT } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  getInbox,
  getThread,
  type InboxResult,
  type InboxStateFilter,
  type InboxView,
  type ThreadDetail,
  type ThreadSummary,
} from '@/services/conversationService';
import { ContextPanel } from './context-panel';
import { ThreadList } from './thread-list';
import { ThreadView } from './thread-view';

const VIEWS: InboxView[] = ['mine', 'unassigned', 'all'];
const STATES: InboxStateFilter[] = ['waiting_us', 'waiting_them', 'done', 'snoozed'];

/** True from the xl breakpoint up, where the context panel gets its own column. */
function useWide() {
  const [wide, setWide] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

export function InboxPage() {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? '';
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const threadId = params.get('thread');
  const messageId = params.get('message');
  const wide = useWide();

  const [view, setView] = React.useState<InboxView>('mine');
  const [state, setState] = React.useState<InboxStateFilter>('waiting_us');
  const [query, setQuery] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [result, setResult] = React.useState<InboxResult | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [detail, setDetail] = React.useState<ThreadDetail | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [opened, setOpened] = React.useState<ThreadSummary | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const seq = React.useRef(0);
  const load = React.useCallback(async () => {
    if (!companyId) return;
    const mine = ++seq.current;
    try {
      const next = await getInbox(companyId, view, state, debounced);
      if (mine !== seq.current) return; // a newer filter is already loading
      setResult(next);
      setFailed(false);
    } catch {
      if (mine === seq.current) setFailed(true);
    }
  }, [companyId, view, state, debounced]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => { setResult(null); }, [companyId]);

  React.useEffect(() => {
    const on = () => void load();
    window.addEventListener(DATA_CHANGED_EVENT, on);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, on);
  }, [load]);

  // The context panel's copy of the thread (files, state) follows the open thread.
  const loadDetail = React.useCallback(async () => {
    if (!threadId) { setDetail(null); setOpened(null); return; }
    try {
      const d = await getThread(threadId);
      setDetail(d);
      setOpened(d.thread);
    } catch {
      setDetail(null);
      setOpened(null);
    }
  }, [threadId]);

  React.useEffect(() => {
    setDetail(null);
    setOpened(null);
    void loadDetail();
  }, [loadDetail]);

  React.useEffect(() => {
    if (!threadId) return;
    const on = () => void loadDetail();
    window.addEventListener(DATA_CHANGED_EVENT, on);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, on);
  }, [threadId, loadDetail]);

  const select = (id: string | null) => {
    router.replace(id ? `${pathname}?thread=${encodeURIComponent(id)}` : pathname);
  };

  const active = opened ?? result?.threads.find((t) => t.id === threadId) ?? null;
  const viewLabel: Record<InboxView, string> = {
    mine: tr('Mine', 'لي'),
    unassigned: tr('Unassigned', 'غير مُسندة'),
    all: tr('All', 'الكل'),
  };
  const stateLabels: Record<string, string> = {
    waiting_us: tr('Waiting on us', 'بانتظارنا'),
    waiting_them: tr('Waiting on them', 'بانتظارهم'),
    done: tr('Done', 'منتهية'),
    snoozed: tr('Snoozed', 'مؤجّلة'),
  };

  const panel = active ? (
    <ContextPanel thread={active} detail={detail} />
  ) : null;

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[28rem] w-full min-w-0 overflow-hidden border-y bg-background sm:rounded-lg sm:border">
      {/* List: always on desktop, only without an open thread on phones. */}
      <aside className={cn('flex min-h-0 w-full shrink-0 flex-col border-e lg:w-80', threadId && 'hidden lg:flex')}>
        <div className="space-y-2 border-b p-3">
          <h1 className="text-base font-semibold">{tr('Inbox', 'صندوق الوارد')}</h1>
          <Tabs value={view} onValueChange={(v) => setView(v as InboxView)}>
            <TabsList className="grid h-9 w-full grid-cols-3">
              {VIEWS.map((v) => (
                <TabsTrigger key={v} value={v} className="gap-1 px-1.5 text-xs">
                  {viewLabel[v]}
                  {result && <span className="tabular-nums text-muted-foreground">{result.counts[v]}</span>}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('Search people or subjects', 'ابحث في الأشخاص أو المواضيع')}
              aria-label={tr('Search conversations', 'بحث في المحادثات')}
              className="h-8 ps-8 text-sm"
            />
          </div>
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label={tr('State', 'الحالة')}>
            {STATES.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={state === s}
                onClick={() => setState(s)}
                className={cn(
                  'shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  state === s ? 'border-transparent bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {stateLabels[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {failed && result && (
            <div role="alert" className="flex items-center justify-between gap-2 border-b bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-50">
              <span>{tr("Couldn't refresh. Showing earlier results.", 'تعذّر التحديث. تُعرض النتائج السابقة.')}</span>
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => void load()}>{tr('Retry', 'إعادة المحاولة')}</Button>
            </div>
          )}
          <ThreadList threads={result?.threads ?? null} failed={failed} selectedId={threadId} onSelect={select} />
        </div>
      </aside>

      {/* Thread */}
      <section className={cn('min-w-0 flex-1 flex-col', threadId ? 'flex' : 'hidden lg:flex')} aria-label={tr('Conversation', 'المحادثة')}>
        {threadId ? (
          <>
            <header className="flex items-center gap-2 border-b px-3 py-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={() => select(null)} aria-label={tr('Back to inbox', 'العودة إلى صندوق الوارد')}>
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              </Button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold"><bdi>{active?.contact.name ?? '…'}</bdi></p>
                {active && <p className="truncate text-xs text-muted-foreground"><bdi>{active.subject}</bdi></p>}
              </div>
              {!wide && (
                <Button variant="outline" size="sm" onClick={() => setDetailsOpen(true)}>
                  <Info className="me-1.5 h-3.5 w-3.5" />{tr('Details', 'التفاصيل')}
                </Button>
              )}
            </header>
            <div className="min-h-0 flex-1 p-3">
              <ThreadView key={threadId} threadId={threadId} focusMessageId={messageId} onChanged={() => void load()} />
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
            {tr('Pick a conversation to read and reply.', 'اختر محادثة لقراءتها والردّ عليها.')}
          </div>
        )}
      </section>

      {/* Context: own column on wide screens, a sheet otherwise. */}
      {wide && panel && <aside className="w-80 shrink-0 overflow-y-auto border-s">{panel}</aside>}
      {!wide && panel && (
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetContent side={language === 'ar' ? 'left' : 'right'} className="w-full overflow-y-auto p-0 sm:max-w-sm">
            <SheetHeader className="border-b px-4 py-3 text-start">
              <SheetTitle className="text-base">{tr('Conversation details', 'تفاصيل المحادثة')}</SheetTitle>
              <SheetDescription className="sr-only">{tr('Owner, assignment, snooze and files', 'المسؤول والإسناد والتأجيل والملفات')}</SheetDescription>
            </SheetHeader>
            {panel}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
