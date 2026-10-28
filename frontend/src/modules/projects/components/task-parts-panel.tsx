'use client';

import * as React from 'react';
import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { updateTaskPart } from '@/services/projectService';
import { partsProgress, statusName } from '../lib/task-meta';
import { partStatuses, type PartStatus, type Task } from '../types';

type Person = { id: string; name: string; avatar?: string | null };

const ICON: Record<PartStatus, React.ElementType> = { 'To Do': Circle, 'In Progress': CircleDot, Done: CheckCircle2 };

/**
 * A shared task's parts: one row per person with what their part is and its
 * state. Each person moves their own part; whoever runs the task can move any
 * part and name them. Changes save at once.
 */
export function TaskPartsPanel({
  task,
  people,
  currentUserId,
  runsTask,
  onChanged,
}: {
  task: Task;
  people: Person[];
  currentUserId?: string;
  runsTask: boolean;
  onChanged: (task: Task) => void;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [labels, setLabels] = React.useState<Record<string, string>>({});
  const parts = task.parts ?? [];

  React.useEffect(() => {
    setLabels(Object.fromEntries(parts.map((p) => [p.userId, p.label ?? ''])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, parts.map((p) => `${p.userId}:${p.label ?? ''}`).join('|')]);

  if (parts.length === 0) return null;
  const { done, total } = partsProgress(task);

  const save = async (userId: string, changes: { status?: PartStatus; label?: string | null }) => {
    try {
      onChanged(await updateTaskPart(task.id, userId, changes));
    } catch (e) {
      toast({ variant: 'destructive', title: tr('Could not save', 'تعذّر الحفظ'), description: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <section className="space-y-2 rounded-lg border p-3" aria-label={tr('Parts', 'الأجزاء')}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{tr('Parts', 'الأجزاء')}</h3>
        <span className="text-xs text-muted-foreground">{tr(`${done} of ${total} done`, `${done} من ${total} منجزة`)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {tr('Each person finishes their own part; the task is done when every part is.', 'كل شخص يُنهي جزءه، وتكتمل المهمة عندما تنتهي كل الأجزاء.')}
      </p>
      <ul className="divide-y">
        {parts.map((part) => {
          const person = people.find((p) => p.id === part.userId);
          const mine = part.userId === currentUserId;
          const canMove = mine || runsTask;
          const Icon = ICON[part.status];
          return (
            <li key={part.userId} className="flex flex-wrap items-center gap-2 py-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={person?.avatar ?? undefined} />
                <AvatarFallback className="text-[10px]">{person?.name?.charAt(0) ?? '?'}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  <bdi>{person?.name ?? tr('Former member', 'عضو سابق')}</bdi>
                  {mine && <span className="ms-1 text-xs text-muted-foreground">({tr('you', 'أنت')})</span>}
                </p>
                {runsTask ? (
                  <Input
                    value={labels[part.userId] ?? ''}
                    onChange={(e) => setLabels((l) => ({ ...l, [part.userId]: e.target.value }))}
                    onBlur={() => {
                      const next = (labels[part.userId] ?? '').trim();
                      if (next !== (part.label ?? '')) void save(part.userId, { label: next || null });
                    }}
                    maxLength={80}
                    placeholder={tr('What is their part? e.g. Filming and editing', 'ما جزءه؟ مثال: تصوير ومونتاج')}
                    className="mt-1 h-7 text-xs"
                  />
                ) : part.label ? (
                  <p className="truncate text-xs text-muted-foreground"><bdi>{part.label}</bdi></p>
                ) : null}
              </div>
              {canMove ? (
                <Select value={part.status} onValueChange={(v) => void save(part.userId, { status: v as PartStatus })}>
                  <SelectTrigger className={cn('h-8 w-[150px] text-xs', part.status === 'Done' && 'text-emerald-600 dark:text-emerald-400')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {partStatuses.map((s) => (
                      <SelectItem key={s} value={s}>{statusName(s, language)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className={cn('inline-flex items-center gap-1 text-xs', part.status === 'Done' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                  <Icon className="h-3.5 w-3.5" />
                  {statusName(part.status, language)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
