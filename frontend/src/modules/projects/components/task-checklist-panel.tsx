'use client';

import * as React from 'react';
import { ListChecks, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useLiveRefresh } from '@/lib/live';
import { cn } from '@/lib/utils';
import { addChecklistItem, deleteChecklistItem, getChecklist, updateChecklistItem, type ChecklistItem } from '@/services/projectService';

/** The small steps inside a task. Ticks and edits save at once and show up for colleagues live. */
export function TaskChecklistPanel({ taskId, onChanged }: { taskId: string; onChanged?: () => void }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [items, setItems] = React.useState<ChecklistItem[] | null>(null);
  const [draft, setDraft] = React.useState('');
  const [editing, setEditing] = React.useState<{ id: string; text: string } | null>(null);

  const load = React.useCallback(async () => {
    setItems(await getChecklist(taskId).catch(() => []));
  }, [taskId]);
  React.useEffect(() => { void load(); }, [load]);
  useLiveRefresh(['checklist'], load);

  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); await load(); onChanged?.(); }
    catch (e) { toast({ variant: 'destructive', title: tr('Could not save', 'تعذّر الحفظ'), description: e instanceof Error ? e.message : undefined }); }
  };

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await run(() => addChecklistItem(taskId, text));
  };

  const done = items?.filter((i) => i.done).length ?? 0;
  const total = items?.length ?? 0;

  return (
    <section className="space-y-2 rounded-lg border p-3" aria-label={tr('Checklist', 'قائمة التحقق')}>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><ListChecks className="h-4 w-4" />{tr('Checklist', 'قائمة التحقق')}</h3>
        {total > 0 && <span className="text-xs text-muted-foreground">{done}/{total}</span>}
      </div>
      {total > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}
      <ul className="space-y-1">
        {(items ?? []).map((item) => (
          <li key={item.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
            <Checkbox
              checked={item.done}
              onCheckedChange={(v) => void run(() => updateChecklistItem(taskId, item.id, { done: v === true }))}
              aria-label={item.text}
            />
            {editing?.id === item.id ? (
              <Input
                autoFocus
                value={editing.text}
                maxLength={200}
                onChange={(e) => setEditing({ id: item.id, text: e.target.value })}
                onBlur={() => {
                  const text = editing.text.trim();
                  setEditing(null);
                  if (text && text !== item.text) void run(() => updateChecklistItem(taskId, item.id, { text }));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditing(null);
                }}
                className="h-7 flex-1 text-sm"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing({ id: item.id, text: item.text })}
                className={cn('flex-1 text-start text-sm', item.done && 'text-muted-foreground line-through')}
              >
                <bdi>{item.text}</bdi>
              </button>
            )}
            <button
              type="button"
              onClick={() => void run(() => deleteChecklistItem(taskId, item.id))}
              className="rounded p-1 text-muted-foreground opacity-60 hover:text-destructive md:opacity-0 md:group-hover:opacity-100"
              aria-label={tr('Remove step', 'حذف الخطوة')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <Input value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} placeholder={tr('Add a step…', 'أضف خطوة…')} className="h-8 text-sm" />
        <Button type="submit" size="sm" variant="outline" className="h-8" disabled={!draft.trim()} aria-label={tr('Add step', 'إضافة خطوة')}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>
    </section>
  );
}
