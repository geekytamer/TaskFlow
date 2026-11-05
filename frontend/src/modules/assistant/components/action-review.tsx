'use client';

import * as React from 'react';
import { ArrowRight, Check, ChevronDown, Clock, Pencil, ShieldCheck, TriangleAlert, Undo2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { AssistantAction, ReviewField } from '@/services/assistantService';

type Tr = (en: string, ar: string) => string;
export type ActionEdits = Record<string, unknown>;

/** Arabic labels for the fields people meet most; the rest keep the server's English label. */
const AR_LABELS: Record<string, string> = {
  title: 'العنوان', name: 'الاسم', status: 'الحالة', priority: 'الأولوية', dueDate: 'تاريخ الاستحقاق', startDate: 'تاريخ البدء',
  description: 'الوصف', notes: 'ملاحظات', note: 'ملاحظة', amount: 'المبلغ', hours: 'الساعات', spentOn: 'التاريخ', paidAt: 'تاريخ الدفع',
  method: 'طريقة الدفع', phone: 'الهاتف', email: 'البريد الإلكتروني', kind: 'النوع', roles: 'الأدوار', assignedUserIds: 'المسند إليه',
  projectId: 'المشروع', clientId: 'العميل', fieldValues: 'الحقول', templateId: 'القالب', fileId: 'الملف',
};

const kindOf = (a: AssistantAction, tr: Tr) =>
  a.method === 'DELETE' ? tr('Delete', 'حذف') : a.method === 'POST' ? tr('Create', 'إنشاء') : tr('Change', 'تعديل');

/** Re-renders every 30 s, so "Undo (4 min left)" counts down and disappears on time. */
function useNow(active: boolean) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    // The card may have been on screen (pending) for minutes before Undo appeared: start from now, not from then.
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

const inputClass = 'h-8 text-sm';

function FieldInput({ field, value, onChange, disabled, id }: { field: ReviewField; value: unknown; onChange: (v: unknown) => void; disabled: boolean; id: string }) {
  if (field.kind === 'readonly') return <span id={id} className="py-1 text-sm text-muted-foreground">{field.display ?? '—'}</span>;
  if (field.kind === 'boolean') return <Checkbox id={id} checked={value === true} disabled={disabled} onCheckedChange={(c) => onChange(c === true)} />;
  if (field.kind === 'longtext') return <Textarea id={id} rows={2} className="min-h-0 text-sm" value={String(value ?? '')} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  if (field.kind === 'select') {
    return (
      <select id={id} className={cn('w-full rounded-md border border-input bg-background px-2', inputClass)} value={String(value ?? '')} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <Input
      id={id}
      className={inputClass}
      type={field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'}
      step={field.kind === 'number' ? 'any' : undefined}
      dir={field.kind === 'number' || field.kind === 'date' ? 'ltr' : undefined}
      value={value === null || value === undefined ? '' : String(value)}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * One proposed change as the person judges it: what it changes (before → after),
 * its fields (editable before confirming), what a delete takes, whether it goes
 * for approval, and — once done — Undo for 10 minutes.
 */
export function ActionReview({ action: a, tr, language, busy, edits, onEdit, onDecide, onUndo }: {
  action: AssistantAction;
  tr: Tr;
  language: string;
  busy: boolean;
  edits?: ActionEdits;
  onEdit: (key: string, value: unknown) => void;
  onDecide: (confirm: string[], decline: string[]) => void;
  onUndo: (actionId: string) => void;
}) {
  const [details, setDetails] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const pending = a.status === 'pending';
  const now = useNow(Boolean(a.undoUntil));
  const undoLeft = a.undoUntil ? Date.parse(a.undoUntil) - now : 0;
  const labelOf = (key: string, fallback: string) => (language === 'ar' ? AR_LABELS[key] ?? fallback : fallback);
  const editable = (a.fields ?? []).filter((f) => f.kind !== 'readonly');
  const editedKeys = Object.keys(edits ?? {});
  const statusText: Record<string, [string, string]> = {
    done: [tr('Done', 'تم'), 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'],
    failed: [tr('Failed', 'فشل'), 'bg-destructive/10 text-destructive'],
    declined: [tr('Declined', 'مرفوض'), 'bg-muted text-muted-foreground'],
    expired: [tr('Expired', 'انتهت'), 'bg-muted text-muted-foreground'],
    running: [tr('Running', 'قيد التنفيذ'), 'bg-muted text-muted-foreground'],
    undone: [tr('Undone', 'تم التراجع'), 'bg-muted text-muted-foreground'],
  };
  const chip = statusText[a.status];

  return (
    <li className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start gap-2">
        <Badge variant={a.method === 'DELETE' ? 'destructive' : 'secondary'} className="shrink-0">{kindOf(a, tr)}</Badge>
        <span className={cn('min-w-0 flex-1 text-sm', a.status === 'undone' && 'text-muted-foreground line-through')}>{a.summary}</span>
        {chip ? <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', chip[1])}>{chip[0]}</span> : null}
      </div>

      {/* Before → after: the one thing a person must see before agreeing to an edit. */}
      {a.changes?.length ? (
        <dl className="grid grid-cols-[minmax(0,auto)_1fr] gap-x-3 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-sm">
          {a.changes.map((c) => (
            <React.Fragment key={c.key}>
              <dt className="text-muted-foreground">{labelOf(c.key, c.label)}</dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground line-through decoration-muted-foreground/60">{c.from}</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground rtl:rotate-180" aria-label={tr('becomes', 'يصبح')} />
                <span className="font-medium">{editedKeys.includes(c.key) ? String(edits![c.key]) : c.to}</span>
              </dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}

      {a.target ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-sm font-medium">{a.target.title}</p>
          {a.target.subtitle ? <p className="text-xs text-muted-foreground">{a.target.subtitle}</p> : null}
        </div>
      ) : null}

      {pending && a.method === 'DELETE' ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive"><TriangleAlert className="h-3.5 w-3.5 shrink-0" />{tr("This can't be undone.", 'لا يمكن التراجع عن هذا.')}</p>
      ) : null}
      {pending && a.method !== 'DELETE' && !a.undoable ? (
        <p className="text-xs text-muted-foreground">{tr("Once done, this can't be undone from here.", 'بعد التنفيذ لا يمكن التراجع عنه من هنا.')}</p>
      ) : null}

      {a.approval ? (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          {a.approval.status === 'may' ? <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> : <Clock className="h-3.5 w-3.5 shrink-0" />}
          {a.approval.status === 'may'
            ? tr('May need approval in this company.', 'قد يحتاج إلى موافقة في هذه الشركة.')
            : tr(`Waiting for approval: ${a.approval.waitingOn.join(', ')}`, `بانتظار الموافقة: ${a.approval.waitingOn.join('، ')}`)}
        </p>
      ) : null}

      {a.edited?.length ? (
        <p className="text-xs text-muted-foreground">
          {tr('You changed: ', 'غيّرت: ')}
          {a.edited.map((c) => `${labelOf(c.key, c.label)} ${c.from} → ${c.to}`).join(language === 'ar' ? '، ' : ', ')}
        </p>
      ) : null}
      {a.error ? <p className="text-xs text-destructive">{a.error}</p> : null}

      {/* The fields as a small form, opened on demand so a batch of ten stays readable. */}
      {pending && editing && editable.length ? (
        <div className="grid gap-x-3 gap-y-2 rounded-md border px-3 py-2.5 sm:grid-cols-[minmax(6rem,auto)_1fr] sm:items-center">
          {(a.fields ?? []).map((f) => {
            const id = `f-${a.id}-${f.key}`;
            const changed = editedKeys.includes(f.key);
            return (
              <React.Fragment key={f.key}>
                <label htmlFor={id} className={cn('text-xs text-muted-foreground', changed && 'font-medium text-primary')}>
                  {labelOf(f.key, f.label)}{changed ? ' •' : ''}
                </label>
                <FieldInput field={f} id={id} disabled={busy} value={changed ? edits![f.key] : f.value} onChange={(v) => onEdit(f.key, v)} />
              </React.Fragment>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setDetails((d) => !d)} aria-expanded={details}>
            <ChevronDown className={cn('h-3 w-3 transition-transform', details && 'rotate-180')} />{tr('Details', 'التفاصيل')}
          </button>
          {pending && editable.length ? (
            <button type="button" className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground', (editing || editedKeys.length) && 'text-primary')} onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
              <Pencil className="h-3 w-3" />{editedKeys.length ? tr(`Edited (${editedKeys.length})`, `معدّل (${editedKeys.length})`) : tr('Edit', 'تعديل')}
            </button>
          ) : null}
        </div>
        {pending ? (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onDecide([], [a.id])}><X className="h-4 w-4" />{tr('Decline', 'رفض')}</Button>
            <Button size="sm" variant={a.method === 'DELETE' ? 'destructive' : 'default'} disabled={busy} onClick={() => onDecide([a.id], [])}><Check className="h-4 w-4" />{tr('Confirm', 'تأكيد')}</Button>
          </div>
        ) : null}
        {a.status === 'done' && undoLeft > 0 ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onUndo(a.id)}>
            <Undo2 className="h-4 w-4 rtl:-scale-x-100" />
            {tr(`Undo (${Math.max(1, Math.ceil(undoLeft / 60_000))} min left)`, `تراجع (باقي ${Math.max(1, Math.ceil(undoLeft / 60_000))} د)`)}
          </Button>
        ) : null}
      </div>
      {details ? (
        <pre dir="ltr" className="max-h-56 overflow-auto rounded bg-muted p-2 text-xs">{`${a.method} ${a.path}${a.body ? `\n${JSON.stringify(a.body, null, 2)}` : ''}`}</pre>
      ) : null}
    </li>
  );
}
