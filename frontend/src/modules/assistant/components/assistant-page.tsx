'use client';

/**
 * The assistant: ask in plain words (English or Arabic); it reads what you may
 * read, and prepares changes that wait here until you confirm them. It acts as
 * you, through the same permissions and approvals as your own clicks.
 */
import * as React from 'react';
import { Bot, Check, ChevronDown, History, Loader2, MessageSquarePlus, SendHorizontal, Trash2, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { isApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  askAssistant, assistantStatusOnce, decideAssistantActions, deleteAssistantThread, getAssistantThread, listAssistantThreads,
  type AssistantAction, type AssistantStatus, type AssistantThread, type AssistantThreadSummary,
} from '@/services/assistantService';

type Tr = (en: string, ar: string) => string;

export function AssistantPage() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = React.useCallback<Tr>((en, ar) => (language === 'ar' ? ar : en), [language]);
  const [status, setStatus] = React.useState<AssistantStatus | null>(null);
  const [thread, setThread] = React.useState<AssistantThread | null>(null);
  const [pendingQuestion, setPendingQuestion] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');
  const [working, setWorking] = React.useState<null | 'asking' | 'deciding'>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [threads, setThreads] = React.useState<AssistantThreadSummary[]>([]);
  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => { void assistantStatusOnce().then(setStatus); }, []);
  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [thread, pendingQuestion, working]);
  // A conversation belongs to one company; switching company starts a new one.
  React.useEffect(() => { setThread((t) => (t && t.companyId !== selectedCompany?.id ? null : t)); }, [selectedCompany?.id]);

  const failMessage = (err: unknown) => {
    if (isApiError(err) && err.status === 503) return tr('The assistant is offline right now (its model cannot be reached). Try again in a while.', 'المساعد غير متاح الآن (لا يمكن الوصول إلى النموذج). حاول بعد قليل.');
    if (isApiError(err) && err.status === 409) return tr('Still working on the last request.', 'ما زال يعمل على الطلب السابق.');
    return err instanceof Error ? err.message : String(err);
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || !selectedCompany || working) return;
    setError(null);
    setDraft('');
    setPendingQuestion(message);
    setWorking('asking');
    try {
      setThread(await askAssistant({ message, companyId: selectedCompany.id, ...(thread ? { threadId: thread.id } : {}) }));
    } catch (err) {
      setError(failMessage(err));
      setDraft(message);
      if (thread) setThread(await getAssistantThread(thread.id).catch(() => thread));
    } finally {
      setPendingQuestion(null);
      setWorking(null);
      inputRef.current?.focus();
    }
  };

  const decide = async (confirm: string[], decline: string[]) => {
    if (!thread || working) return;
    setError(null);
    setWorking('deciding');
    try {
      setThread(await decideAssistantActions(thread.id, { confirm, decline }));
    } catch (err) {
      setError(failMessage(err));
      setThread(await getAssistantThread(thread.id).catch(() => thread));
    } finally {
      setWorking(null);
    }
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    setThreads(await listAssistantThreads().catch(() => []));
  };

  const examples = [
    tr('Which invoices are overdue, and how much is owed in total?', 'ما الفواتير المتأخرة، وكم المبلغ المستحق إجمالاً؟'),
    tr('What tasks are due this week for me?', 'ما المهام المستحقة علي هذا الأسبوع؟'),
    tr('Create a task to call the supplier tomorrow, high priority', 'أنشئ مهمة للاتصال بالمورد غداً بأولوية عالية'),
    tr('Which items are low in stock?', 'ما الأصناف التي قل مخزونها؟'),
  ];

  if (status && !status.enabled) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-24 text-center">
        <Bot className="h-10 w-10 text-muted-foreground" />
        <h1 className="font-headline text-xl font-semibold">{tr('The assistant is not set up yet', 'المساعد غير مُعدّ بعد')}</h1>
        <p className="text-sm text-muted-foreground">{tr('It needs a model server. An administrator sets AI_BASE_URL and AI_MODEL on the backend.', 'يحتاج إلى خادم نموذج. يضبط المسؤول AI_BASE_URL و AI_MODEL في الخادم.')}</p>
      </div>
    );
  }

  const items = thread?.items ?? [];
  const empty = items.length === 0 && !pendingQuestion;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
      <div className="flex items-center justify-between gap-2 pb-4">
        <div className="flex min-w-0 items-center gap-2">
          <Bot className="h-5 w-5 shrink-0 text-primary" />
          <h1 className="truncate font-headline text-lg font-semibold">{thread?.title ?? tr('Assistant', 'المساعد')}</h1>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" onClick={() => void openHistory()}>
            <History className="h-4 w-4" /><span className="hidden sm:inline">{tr('History', 'السابقة')}</span>
          </Button>
          <Button variant="ghost" size="sm" disabled={!thread || Boolean(working)} onClick={() => { setThread(null); setError(null); inputRef.current?.focus(); }}>
            <MessageSquarePlus className="h-4 w-4" /><span className="hidden sm:inline">{tr('New', 'جديدة')}</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 pb-4" aria-live="polite">
        {empty ? (
          <div className="flex flex-col gap-4 py-10">
            <div>
              <p className="text-base font-medium">{tr('Ask about your business, or ask for something to be done.', 'اسأل عن عملك، أو اطلب تنفيذ شيء.')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tr(`It works in ${selectedCompany?.name ?? 'this company'} with your permissions. Changes wait for your confirmation.`, `يعمل في ${selectedCompany?.name ?? 'هذه الشركة'} بصلاحياتك. التغييرات تنتظر تأكيدك.`)}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {examples.map((e) => (
                <button key={e} type="button" onClick={() => void send(e)} disabled={!selectedCompany || Boolean(working)}
                  className="rounded-lg border bg-card px-3 py-2.5 text-start text-sm transition-colors hover:bg-muted disabled:opacity-60">
                  {e}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {items.map((item, i) => item.role === 'user' ? (
          <UserBubble key={i} text={item.text} />
        ) : (
          <div key={i} className="flex flex-col gap-2">
            {item.text ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.text}</p> : null}
            {item.actions.length ? <ActionGroup actions={item.actions} tr={tr} busy={Boolean(working)} onDecide={decide} /> : null}
          </div>
        ))}

        {pendingQuestion ? <UserBubble text={pendingQuestion} /> : null}
        {working ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {working === 'asking' ? tr('Working on it…', 'يعمل على ذلك…') : tr('Running your confirmed changes…', 'ينفّذ التغييرات المؤكدة…')}
          </div>
        ) : null}
        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-0 -mx-1 flex items-end gap-2 border-t bg-background px-1 pb-1 pt-3"
        onSubmit={(e) => { e.preventDefault(); void send(draft); }}
      >
        <Textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft); } }}
          placeholder={tr('Ask the assistant…', 'اسأل المساعد…')}
          aria-label={tr('Message to the assistant', 'رسالة إلى المساعد')}
          rows={1}
          maxLength={4000}
          className="max-h-40 min-h-[2.75rem] resize-none"
          disabled={!selectedCompany}
        />
        <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={!draft.trim() || Boolean(working) || !selectedCompany} aria-label={tr('Send', 'إرسال')}>
          <SendHorizontal className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </form>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side={language === 'ar' ? 'left' : 'right'} className="w-full sm:max-w-sm">
          <SheetHeader><SheetTitle>{tr('Earlier conversations', 'المحادثات السابقة')}</SheetTitle></SheetHeader>
          <div className="mt-4 flex flex-col gap-1">
            {threads.length === 0 ? <p className="text-sm text-muted-foreground">{tr('None yet.', 'لا شيء بعد.')}</p> : null}
            {threads.map((t) => (
              <div key={t.id} className="group flex items-center gap-1 rounded-md hover:bg-muted">
                <button type="button" className="min-w-0 flex-1 px-2 py-2 text-start"
                  onClick={async () => { setHistoryOpen(false); setError(null); setThread(await getAssistantThread(t.id)); }}>
                  <span className="block truncate text-sm">{t.title}</span>
                  <span className="block text-xs text-muted-foreground">{new Date(t.updatedAt).toLocaleString(language === 'ar' ? 'ar' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </button>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={tr('Delete conversation', 'حذف المحادثة')}
                  onClick={async () => {
                    await deleteAssistantThread(t.id).catch(() => undefined);
                    setThreads((all) => all.filter((x) => x.id !== t.id));
                    if (thread?.id === t.id) setThread(null);
                  }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return <div className="ms-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-ee-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">{text}</div>;
}

const kindOf = (a: AssistantAction, tr: Tr) =>
  a.method === 'DELETE' ? tr('Delete', 'حذف') : a.method === 'POST' ? tr('Create', 'إنشاء') : tr('Change', 'تعديل');

function ActionGroup({ actions, tr, busy, onDecide }: { actions: AssistantAction[]; tr: Tr; busy: boolean; onDecide: (confirm: string[], decline: string[]) => void }) {
  const open = actions.filter((a) => a.status === 'pending').map((a) => a.id);
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {open.length ? tr('Waiting for your confirmation', 'بانتظار تأكيدك') : tr('Proposed changes', 'التغييرات المقترحة')}
      </p>
      <ul className="flex flex-col divide-y">
        {actions.map((a) => <ActionRow key={a.id} action={a} tr={tr} busy={busy} onDecide={onDecide} />)}
      </ul>
      {open.length > 1 ? (
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onDecide([], open)}>{tr('Decline all', 'رفض الكل')}</Button>
          <Button size="sm" disabled={busy} onClick={() => onDecide(open, [])}><Check className="h-4 w-4" />{tr(`Confirm all (${open.length})`, `تأكيد الكل (${open.length})`)}</Button>
        </div>
      ) : null}
    </div>
  );
}

function ActionRow({ action: a, tr, busy, onDecide }: { action: AssistantAction; tr: Tr; busy: boolean; onDecide: (confirm: string[], decline: string[]) => void }) {
  const [details, setDetails] = React.useState(false);
  const statusText: Record<string, [string, string]> = {
    done: [tr('Done', 'تم'), 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'],
    failed: [tr('Failed', 'فشل'), 'bg-destructive/10 text-destructive'],
    declined: [tr('Declined', 'مرفوض'), 'bg-muted text-muted-foreground'],
    expired: [tr('Expired', 'انتهت'), 'bg-muted text-muted-foreground'],
    running: [tr('Running', 'قيد التنفيذ'), 'bg-muted text-muted-foreground'],
  };
  const chip = statusText[a.status];
  return (
    <li className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start gap-2">
        <Badge variant={a.method === 'DELETE' ? 'destructive' : 'secondary'} className="shrink-0">{kindOf(a, tr)}</Badge>
        <span className="min-w-0 flex-1 text-sm">{a.summary}</span>
        {chip ? <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', chip[1])}>{chip[0]}</span> : null}
      </div>
      {a.error ? <p className="text-xs text-destructive">{a.error}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setDetails((d) => !d)} aria-expanded={details}>
          <ChevronDown className={cn('h-3 w-3 transition-transform', details && 'rotate-180')} />{tr('Details', 'التفاصيل')}
        </button>
        {a.status === 'pending' ? (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onDecide([], [a.id])}><X className="h-4 w-4" />{tr('Decline', 'رفض')}</Button>
            <Button size="sm" variant={a.method === 'DELETE' ? 'destructive' : 'default'} disabled={busy} onClick={() => onDecide([a.id], [])}><Check className="h-4 w-4" />{tr('Confirm', 'تأكيد')}</Button>
          </div>
        ) : null}
      </div>
      {details ? (
        <pre dir="ltr" className="max-h-56 overflow-auto rounded bg-muted p-2 text-xs">{`${a.method} ${a.path}${a.body ? `\n${JSON.stringify(a.body, null, 2)}` : ''}`}</pre>
      ) : null}
    </li>
  );
}
