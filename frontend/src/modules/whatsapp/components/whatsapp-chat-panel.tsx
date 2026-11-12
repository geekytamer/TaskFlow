'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import {
  addWhatsappNote,
  deleteWhatsappNote,
  getWhatsappNotes,
  updateWhatsappChatSettings,
  type WhatsAppChatStatus,
  type WhatsAppChatSummary,
  type WhatsAppNote,
} from '@/services/whatsappService';
import { Loader2, StickyNote, Tag, Trash2, UserRound, X } from 'lucide-react';

/**
 * The side panel of an open chat: who answers it, where it stands, its
 * labels and the team's internal notes (never sent to the customer).
 */
export function WhatsappChatPanel({
  companyId,
  chat,
  team,
  knownLabels,
  currentUserId,
  canManageAll,
  onChanged,
  onClose,
}: {
  companyId: string;
  chat: WhatsAppChatSummary;
  team: Array<{ id: string; name: string }>;
  knownLabels: string[];
  currentUserId?: string;
  canManageAll: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [notes, setNotes] = React.useState<WhatsAppNote[] | null>(null);
  const [noteText, setNoteText] = React.useState('');
  const [savingNote, setSavingNote] = React.useState(false);
  const [labelText, setLabelText] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const loadNotes = React.useCallback(async () => {
    try {
      setNotes(await getWhatsappNotes(companyId, chat.chatId));
    } catch {
      setNotes([]);
    }
  }, [companyId, chat.chatId]);

  React.useEffect(() => {
    setNotes(null);
    loadNotes();
  }, [loadNotes]);

  const update = async (changes: Parameters<typeof updateWhatsappChatSettings>[2]) => {
    setBusy(true);
    try {
      await updateWhatsappChatSettings(companyId, chat.chatId, changes);
      onChanged();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not save', 'تعذّر الحفظ'), description: error?.message });
    } finally {
      setBusy(false);
    }
  };

  const addLabel = (raw: string) => {
    const label = raw.replace(/\s+/g, ' ').trim();
    if (!label) return;
    if (chat.labels.some((l) => l.toLowerCase() === label.toLowerCase())) {
      setLabelText('');
      return;
    }
    setLabelText('');
    update({ labels: [...chat.labels, label] });
  };

  const addNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    setSavingNote(true);
    try {
      await addWhatsappNote(companyId, chat.chatId, text);
      setNoteText('');
      await loadNotes();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not save the note', 'تعذّر حفظ الملاحظة'), description: error?.message });
    } finally {
      setSavingNote(false);
    }
  };

  const removeNote = async (id: string) => {
    try {
      await deleteWhatsappNote(companyId, id);
      await loadNotes();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not delete the note', 'تعذّر حذف الملاحظة'), description: error?.message });
    }
  };

  const statuses: Array<[WhatsAppChatStatus, string]> = [
    ['open', tr('Open', 'مفتوحة')],
    ['waiting', tr('Waiting for customer', 'بانتظار العميل')],
    ['done', tr('Done', 'منتهية')],
  ];
  const suggestions = knownLabels.filter(
    (l) => !chat.labels.some((x) => x.toLowerCase() === l.toLowerCase()) && (!labelText || l.toLowerCase().includes(labelText.toLowerCase())),
  ).slice(0, 6);
  const timeFmt = new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <aside className="flex w-72 shrink-0 flex-col border-s bg-card" aria-label={tr('Chat details', 'تفاصيل المحادثة')}>
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <h3 className="text-sm font-semibold">{tr('Chat details', 'تفاصيل المحادثة')}</h3>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label={tr('Close', 'إغلاق')}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-3">
        <section className="space-y-1.5">
          <label htmlFor="wa-assignee" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" />
            {tr('Who answers', 'المسؤول عن الرد')}
          </label>
          <select
            id="wa-assignee"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={chat.assigneeUserId ?? ''}
            disabled={busy}
            onChange={(e) => update({ assigneeUserId: e.target.value || null })}
          >
            <option value="">{tr('Nobody yet', 'لا أحد بعد')}</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.id === currentUserId ? ` (${tr('me', 'أنا')})` : ''}
              </option>
            ))}
          </select>
          {chat.assigneeUserId !== currentUserId && (
            <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" disabled={busy || !currentUserId} onClick={() => update({ assigneeUserId: currentUserId })}>
              {tr('Take it myself', 'أتولاها بنفسي')}
            </button>
          )}
        </section>

        <section className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">{tr('Where it stands', 'حالة المحادثة')}</div>
          <div className="grid grid-cols-3 gap-1" role="radiogroup">
            {statuses.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={chat.status === value}
                disabled={busy}
                onClick={() => chat.status !== value && update({ status: value })}
                className={`rounded-md border px-1.5 py-1.5 text-[11px] leading-tight transition-colors ${chat.status === value ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {tr('Moves by itself: a customer message opens it, your reply sets it waiting.', 'تتغيّر تلقائياً: رسالة العميل تفتحها، وردّك يجعلها بانتظاره.')}
          </p>
        </section>

        <section className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Tag className="h-3.5 w-3.5" />
            {tr('Labels', 'التصنيفات')}
          </div>
          <div className="flex flex-wrap gap-1">
            {chat.labels.map((label) => (
              <span key={label} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                {label}
                <button type="button" disabled={busy} onClick={() => update({ labels: chat.labels.filter((l) => l !== label) })} aria-label={tr(`Remove ${label}`, `إزالة ${label}`)}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {chat.labels.length === 0 && <span className="text-xs text-muted-foreground">{tr('None', 'لا يوجد')}</span>}
          </div>
          {chat.labels.length < 10 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addLabel(labelText);
              }}
            >
              <Input value={labelText} onChange={(e) => setLabelText(e.target.value)} maxLength={30} placeholder={tr('Add a label and press Enter', 'أضف تصنيفاً واضغط Enter')} className="h-8 text-xs" />
            </form>
          )}
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestions.map((label) => (
                <button key={label} type="button" disabled={busy} onClick={() => addLabel(label)} className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted">
                  + {label}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <StickyNote className="h-3.5 w-3.5" />
            {tr('Internal notes', 'ملاحظات داخلية')}
          </div>
          <p className="text-[11px] text-muted-foreground">{tr('Only your team sees these. They are never sent.', 'يراها فريقك فقط، ولا تُرسل للعميل أبداً.')}</p>
          {notes === null ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            notes.map((note) => (
              <div key={note.id} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="whitespace-pre-wrap break-words">{note.body}</p>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span>
                    {note.authorName} · {timeFmt.format(new Date(note.createdAt))}
                  </span>
                  {(note.authorUserId === currentUserId || canManageAll) && (
                    <button type="button" onClick={() => removeNote(note.id)} aria-label={tr('Delete note', 'حذف الملاحظة')} className="rounded p-0.5 hover:bg-background">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
          <Textarea
            rows={2}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            maxLength={2000}
            placeholder={tr('Write a note for the team…', 'اكتب ملاحظة للفريق…')}
            className="text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote();
            }}
          />
          <Button size="sm" variant="outline" className="w-full" onClick={addNote} disabled={!noteText.trim() || savingNote}>
            {savingNote && <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />}
            {tr('Add note', 'إضافة ملاحظة')}
          </Button>
        </section>
      </div>
    </aside>
  );
}
