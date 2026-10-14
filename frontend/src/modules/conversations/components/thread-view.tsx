'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { DATA_CHANGED_EVENT } from '@/lib/api-client';
import {
  editMessage,
  getThread,
  sendThreadMessage,
  type ConvFile,
  type SendInput,
  type ThreadDetail,
} from '@/services/conversationService';
import { downloadPortalFile } from '@/services/portalAccessService';
import { getCompanyPeople, type PersonSummary } from '@/services/userService';
import { groupByDay } from '../lib/compose';
import { Composer } from './composer';
import { MessageBubble } from './message-bubble';

interface Props {
  threadId: string;
  /** Called after any change (send, edit) so the surrounding list can refresh. */
  onChanged?: () => void;
}

/** The conversation timeline with its composer. */
export function ThreadView({ threadId, onChanged }: Props) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? '';
  const [detail, setDetail] = React.useState<ThreadDetail | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [people, setPeople] = React.useState<PersonSummary[]>([]);
  const [now, setNow] = React.useState(() => new Date());
  const end = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    try {
      setDetail(await getThread(threadId));
      setFailed(false);
      setNow(new Date());
    } catch (error) {
      setFailed(true);
      toast({ title: error instanceof Error ? error.message : tr('Could not load the conversation', 'تعذّر تحميل المحادثة'), variant: 'destructive' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  React.useEffect(() => {
    setDetail(null);
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!companyId) return;
    getCompanyPeople(companyId).then(setPeople).catch(() => setPeople([]));
  }, [companyId]);

  // Keeps "editable" honest as the 15 minutes run out.
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [detail?.messages.length, threadId]);

  const changed = () => {
    window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
    onChanged?.();
  };

  const send = async (input: SendInput) => {
    await sendThreadMessage(threadId, input);
    await load();
    changed();
  };

  const saveEdit = async (id: string, body: string) => {
    try {
      await editMessage(id, body);
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : tr('Could not save', 'تعذّر الحفظ'), variant: 'destructive' });
      throw error;
    }
    await load();
    changed();
  };

  const download = (file: ConvFile) =>
    downloadPortalFile(companyId, file).catch((error) =>
      toast({ title: error instanceof Error ? error.message : tr('Download failed', 'فشل التنزيل'), variant: 'destructive' }));

  if (failed && !detail) {
    return <p className="p-4 text-sm text-muted-foreground">{tr('Could not load this conversation.', 'تعذّر تحميل هذه المحادثة.')}</p>;
  }
  if (!detail) return <p className="p-4 text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>;

  const groups = groupByDay(detail.messages, language === 'ar' ? 'ar' : 'en');

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto pe-1">
        {detail.messages.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{tr('No messages yet. Write the first one below.', 'لا توجد رسائل بعد. اكتب أول رسالة أدناه.')}</p>
        ) : (
          groups.map((g) => (
            <section key={g.key} aria-label={g.label} className="mb-4">
              <h4 className="sticky top-0 z-10 mb-2 flex justify-center">
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">{g.label}</span>
              </h4>
              <ol className="space-y-3">
                {g.items.map((m) => (
                  <MessageBubble key={m.id} message={m} now={now} onDownload={download} onSaveEdit={saveEdit} />
                ))}
              </ol>
            </section>
          ))
        )}
        <div ref={end} />
      </div>
      <Composer
        key={threadId}
        companyId={companyId}
        contactId={detail.thread.contact.id}
        portalUsers={detail.portalUsers}
        people={people}
        onSend={send}
      />
    </div>
  );
}
