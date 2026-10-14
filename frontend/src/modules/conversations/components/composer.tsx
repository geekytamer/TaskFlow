'use client';

import * as React from 'react';
import { AtSign, Lock, Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { uploadThreadFile, type ConvFile, type SendInput } from '@/services/conversationService';
import type { PersonSummary } from '@/services/userService';
import { mentionedIds, stripMentions } from '../lib/compose';
import { sizeOf } from './message-bubble';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10;

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

interface Props {
  threadId: string;
  /** Portal mode needs at least one active portal user. */
  portalUsers: number;
  people: PersonSummary[];
  onSend: (input: SendInput) => Promise<void>;
}

/** Portal reply or internal note, with attachments and (notes only) @mentions. */
export function Composer({ threadId, portalUsers, people, onSend }: Props) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const canPortal = portalUsers > 0;
  const [kind, setKind] = React.useState<'portal' | 'note'>(canPortal ? 'portal' : 'note');
  const [body, setBody] = React.useState('');
  const [files, setFiles] = React.useState<ConvFile[]>([]);
  const [mentions, setMentions] = React.useState<PersonSummary[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [filter, setFilter] = React.useState('');
  const input = React.useRef<HTMLInputElement>(null);
  const area = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!canPortal) setKind('note');
  }, [canPortal]);

  const fail = (error: unknown, fallback: string) =>
    toast({ title: error instanceof Error ? error.message : fallback, variant: 'destructive' });

  const attach = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    let count = files.length;
    for (const file of [...list]) {
      if (count >= MAX_FILES) {
        toast({ title: tr('At most 10 files per message', 'الحد الأقصى 10 ملفات لكل رسالة'), variant: 'destructive' });
        break;
      }
      if (file.size > MAX_BYTES) {
        toast({ title: tr(`${file.name} is over 10 MB`, `${file.name} أكبر من 10 ميغابايت`), variant: 'destructive' });
        continue;
      }
      try {
        const uploaded = await uploadThreadFile(threadId, { fileName: file.name, contentBase64: await toBase64(file) });
        setFiles((current) => [...current, uploaded]);
        count += 1;
      } catch (error) {
        fail(error, tr('Upload failed', 'فشل الرفع'));
      }
    }
    if (input.current) input.current.value = '';
    setBusy(false);
  };

  const chooseKind = (next: 'portal' | 'note') => {
    // A stray "@Name" must never reach the client: leaving note mode removes the mentions.
    if (next === 'portal' && mentions.length) {
      setBody((current) => stripMentions(current, mentions));
      setMentions([]);
    }
    setKind(next);
  };

  const addMention = (person: PersonSummary) => {
    setMentions((current) => (current.some((p) => p.id === person.id) ? current : [...current, person]));
    setBody((current) => `${current}${current && !/\s$/.test(current) ? ' ' : ''}@${person.name} `);
    setPickerOpen(false);
    setFilter('');
    area.current?.focus();
  };

  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    try {
      // Only mentions whose @name is still in the text are sent.
      const ids = kind === 'note' ? mentionedIds(text, mentions) : [];
      await onSend({ kind, body: text, fileIds: files.map((f) => f.id), ...(ids.length ? { mentionUserIds: ids } : {}) });
      setBody('');
      setFiles([]);
      setMentions([]);
    } catch (error) {
      fail(error, tr('Could not send', 'تعذّر الإرسال'));
    } finally {
      setBusy(false);
    }
  };

  const isNote = kind === 'note';
  const shown = people.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div
      className={cn(
        'space-y-2 rounded-lg p-3 ring-1',
        isNote ? 'bg-amber-50 ring-amber-300/70 dark:bg-amber-950/40 dark:ring-amber-700/60' : 'bg-card ring-border',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label={tr('Message type', 'نوع الرسالة')} className="inline-flex rounded-md bg-muted p-0.5 text-sm">
          {canPortal && (
            <button
              type="button"
              role="radio"
              aria-checked={!isNote}
              onClick={() => chooseKind('portal')}
              className={cn('rounded px-3 py-1 font-medium', !isNote ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {tr('Portal', 'البوابة')}
            </button>
          )}
          <button
            type="button"
            role="radio"
            aria-checked={isNote}
            onClick={() => chooseKind('note')}
            className={cn('inline-flex items-center gap-1 rounded px-3 py-1 font-medium', isNote ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            <Lock className="h-3 w-3" aria-hidden />
            {tr('Internal note', 'ملاحظة داخلية')}
          </button>
        </div>
        <p className={cn('text-xs', isNote ? 'font-medium text-amber-900 dark:text-amber-100' : 'text-muted-foreground')}>
          {isNote
            ? tr('Internal note · only your team sees this', 'ملاحظة داخلية · فريقك فقط يراها')
            : tr('The client will see this in their portal', 'سيراها العميل في بوابته')}
        </p>
      </div>
      {!canPortal && (
        <p className="text-xs text-muted-foreground">
          {tr('No one at this contact has portal access, so only internal notes are possible.', 'لا أحد لدى جهة الاتصال هذه لديه وصول إلى البوابة، لذا الملاحظات الداخلية فقط متاحة.')}
        </p>
      )}

      <Textarea
        ref={area}
        dir="auto"
        rows={3}
        maxLength={4000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void submit(); } }}
        placeholder={isNote ? tr('Write a note for your team…', 'اكتب ملاحظة لفريقك…') : tr('Reply to the client…', 'رد على العميل…')}
        aria-label={isNote ? tr('Internal note', 'ملاحظة داخلية') : tr('Message to the client', 'رسالة إلى العميل')}
        className="bg-background"
      />

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {files.map((f) => (
            <span key={f.id} className="inline-flex max-w-full items-center gap-1 rounded border bg-background text-xs">
              <bdi dir="auto" className="truncate ps-2 py-1">{f.fileName}</bdi>
              <span className="text-muted-foreground" dir="ltr">{sizeOf(f.sizeBytes)}</span>
              <button type="button" onClick={() => setFiles((c) => c.filter((x) => x.id !== f.id))} className="px-1.5 py-1 text-muted-foreground hover:text-foreground" aria-label={tr('Remove', 'إزالة')}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <input ref={input} type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => attach(e.target.files)} />
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => input.current?.click()}>
            <Paperclip className="me-1 h-4 w-4" />{tr('Attach', 'إرفاق')}
          </Button>
          {isNote && (
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button type="button" size="sm" variant="ghost" disabled={busy}>
                  <AtSign className="me-1 h-4 w-4" />{tr('Mention', 'إشارة')}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-2">
                <input
                  autoFocus
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={tr('Find a teammate…', 'ابحث عن زميل…')}
                  aria-label={tr('Find a teammate', 'ابحث عن زميل')}
                  className="mb-1 w-full rounded border bg-background px-2 py-1 text-sm"
                />
                <ul className="max-h-48 overflow-y-auto">
                  {shown.length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">{tr('No one found', 'لا نتائج')}</li>}
                  {shown.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => addMention(p)} className="w-full rounded px-2 py-1.5 text-start text-sm hover:bg-muted">
                        <bdi>{p.name}</bdi>
                      </button>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <Button type="button" size="sm" disabled={busy || !body.trim()} onClick={submit}>
          <Send className="me-1 h-4 w-4 rtl:-scale-x-100" />
          {isNote ? tr('Add note', 'إضافة الملاحظة') : tr('Send to client', 'إرسال إلى العميل')}
        </Button>
      </div>
    </div>
  );
}
