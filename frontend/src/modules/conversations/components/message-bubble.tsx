'use client';

import * as React from 'react';
import { Check, CheckCheck, FileText, Lock, Pencil } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/context/i18n-context';
import { cn } from '@/lib/utils';
import type { ConvFile, ConvMessageView } from '@/services/conversationService';
import { canEdit } from '../lib/compose';

export const sizeOf = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const initials = (name: string | null) =>
  (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

interface Props {
  message: ConvMessageView;
  now: Date;
  onDownload: (file: ConvFile) => void;
  onSaveEdit: (id: string, body: string) => Promise<void>;
}

/**
 * One message. Internal notes are shaded amber with a lock and an explicit
 * label so nobody mistakes them for something the client sees; messages to or
 * from the client stay on the plain surface.
 */
export function MessageBubble({ message: m, now, onDownload, onSaveEdit }: Props) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const locale = language === 'ar' ? 'ar-u-nu-latn' : 'en';
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(m.body);
  const [saving, setSaving] = React.useState(false);

  const isNote = m.channel === 'note' || m.visibility !== 'external';
  const fromClient = m.author.kind === 'portal';
  const outbound = m.author.kind === 'staff' && !isNote;
  const time = new Date(m.createdAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  const channel = isNote ? tr('Internal note', 'ملاحظة داخلية') : tr('Portal', 'البوابة');
  const name = m.author.name ?? tr('Unknown', 'غير معروف');

  const save = async () => {
    setSaving(true);
    try {
      await onSaveEdit(m.id, draft.trim());
      setEditing(false);
    } catch {
      /* the parent shows the server's message */
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className={cn('flex gap-2.5', outbound && 'flex-row-reverse')}>
      <Avatar className="mt-0.5 h-8 w-8 shrink-0">
        {m.author.avatar && <AvatarImage src={m.author.avatar} alt="" />}
        <AvatarFallback className="text-[11px]">{initials(m.author.name)}</AvatarFallback>
      </Avatar>
      <div
        className={cn(
          'min-w-0 max-w-[85%] rounded-lg px-3 py-2 text-sm',
          isNote
            ? 'bg-amber-50 text-amber-950 ring-1 ring-amber-300/70 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-700/60'
            : outbound ? 'bg-primary/10 ring-1 ring-primary/20' : 'bg-card ring-1 ring-border',
        )}
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
          <bdi className="font-semibold">{name}</bdi>
          <span className={cn('inline-flex items-center gap-1', isNote ? 'text-amber-900/80 dark:text-amber-200/80' : 'text-muted-foreground')}>
            {isNote && <Lock className="h-3 w-3" aria-hidden />}
            {channel}
          </span>
          <time dateTime={m.createdAt} className={cn('tabular-nums', isNote ? 'text-amber-900/80 dark:text-amber-200/80' : 'text-muted-foreground')} dir="ltr">
            {time}
          </time>
          {fromClient && <span className="text-muted-foreground">{tr('(client)', '(العميل)')}</span>}
        </div>

        {isNote && (
          <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-900 dark:text-amber-100">
            <Lock className="h-3 w-3" aria-hidden />
            {tr('Internal note · only your team sees this', 'ملاحظة داخلية · فريقك فقط يراها')}
          </p>
        )}

        {editing ? (
          <div className="mt-2 space-y-2">
            <Textarea dir="auto" rows={3} maxLength={4000} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={tr('Edit note', 'تعديل الملاحظة')} />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => { setEditing(false); setDraft(m.body); }}>
                {tr('Cancel', 'إلغاء')}
              </Button>
              <Button type="button" size="sm" disabled={saving || !draft.trim() || draft.trim() === m.body} onClick={save}>
                {tr('Save', 'حفظ')}
              </Button>
            </div>
          </div>
        ) : (
          <p dir="auto" className="mt-1 whitespace-pre-line break-words">{m.body}</p>
        )}

        {m.files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {m.files.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onDownload(f)}
                className="inline-flex max-w-full items-center gap-1 rounded border bg-background px-2 py-1 text-xs text-foreground hover:underline"
              >
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <bdi dir="auto" className="truncate">{f.fileName}</bdi>
                <span className="shrink-0 text-muted-foreground" dir="ltr">{sizeOf(f.sizeBytes)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {m.editedAt && <span className={isNote ? 'text-amber-900/80 dark:text-amber-200/80' : undefined}>{tr('edited', 'معدّلة')}</span>}
          {outbound && (m.seenAt ? (
            <span className="inline-flex items-center gap-1">
              <CheckCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
              {tr('Seen', 'تمت المشاهدة')}{' '}
              <time dateTime={m.seenAt} dir="ltr" className="tabular-nums">
                {new Date(m.seenAt).toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              </time>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" aria-hidden />{tr('Sent', 'أُرسلت')}</span>
          ))}
          {!editing && canEdit(m, now) && (
            <button type="button" onClick={() => { setDraft(m.body); setEditing(true); }} className="inline-flex items-center gap-1 text-amber-900 underline-offset-2 hover:underline dark:text-amber-100">
              <Pencil className="h-3 w-3" aria-hidden />{tr('Edit', 'تعديل')}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
