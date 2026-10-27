'use client';

import * as React from 'react';
import { BookmarkPlus, CalendarRange, Flag, Plus, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { getCurrentLocale } from '@/lib/locale';
import { useLiveRefresh } from '@/lib/live';
import { cn } from '@/lib/utils';
import {
  addMilestone,
  deleteMilestone,
  getProjectSummary,
  saveProjectAsTemplate,
  updateMilestone,
} from '@/services/projectService';
import type { Project, ProjectMilestone, ProjectSummary } from '../types';

const fmtDay = (d: string | Date) => new Date(d).toLocaleDateString(getCurrentLocale(), { day: 'numeric', month: 'short' });
const daysBetween = (a: Date, b: Date) => {
  const x = new Date(a);
  const y = new Date(b);
  x.setHours(0, 0, 0, 0);
  y.setHours(0, 0, 0, 0);
  return Math.round((y.getTime() - x.getTime()) / 86_400_000);
};

/** One day picked from a small calendar, or none. */
function DayPicker({ value, onChange, placeholder }: { value: string | null; onChange: (d: Date | null) => void; placeholder: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={cn('h-8 shrink-0 font-normal', !value && 'text-muted-foreground')}>
          <CalendarRange className="me-1 h-3.5 w-3.5" />
          {value ? fmtDay(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value ? new Date(value) : undefined} onSelect={(d) => { onChange(d ?? null); setOpen(false); }} initialFocus />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The plan of a project at a glance: progress, dates, budget against spend,
 * and its stages. Admins and managers edit stages and save it as a template.
 */
export function ProjectOverview({ project, canManage }: { project: Project; canManage: boolean }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const { amount } = useCompanyCurrency();
  const [summary, setSummary] = React.useState<ProjectSummary | null>(null);
  const [newStage, setNewStage] = React.useState<{ name: string; due: Date | null }>({ name: '', due: null });
  const [renaming, setRenaming] = React.useState<{ id: string; name: string } | null>(null);
  const [templateName, setTemplateName] = React.useState('');
  const [templateOpen, setTemplateOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setSummary(await getProjectSummary(project.id).catch(() => null));
  }, [project.id]);
  React.useEffect(() => { void load(); }, [load, project.startDate, project.endDate, project.budget, project.status]);
  useLiveRefresh(['projects', 'milestones', 'tasks', 'time-entries', 'expenses'], load);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      await load();
      if (ok) toast({ title: ok });
    } catch (e) {
      toast({ variant: 'destructive', title: tr('Could not save', 'تعذّر الحفظ'), description: e instanceof Error ? e.message : undefined });
    }
  };

  if (!summary) return null;
  const stages = summary.milestones;
  const today = new Date();
  const start = project.startDate ? new Date(project.startDate) : null;
  const end = project.endDate ? new Date(project.endDate) : null;
  const totalDays = start && end ? daysBetween(start, end) + 1 : null;
  const daysLeft = end ? daysBetween(today, end) : null;
  const timePct = start && end && totalDays ? Math.min(100, Math.max(0, Math.round(((daysBetween(start, today) + 1) / totalDays) * 100))) : null;

  const addStage = () => {
    const name = newStage.name.trim();
    if (!name) return;
    setNewStage({ name: '', due: null });
    void run(() => addMilestone(project.id, { name, dueDate: newStage.due ? newStage.due.toISOString() : null }));
  };

  return (
    <section className="grid gap-4 lg:grid-cols-3" aria-label={tr('Project plan', 'خطة المشروع')}>
      {/* Progress and time */}
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{tr('Progress', 'الإنجاز')}</h2>
          <span className="text-sm font-semibold tabular-nums">{summary.progress.pct}%</span>
        </div>
        <Progress value={summary.progress.pct} className="h-2" />
        <p className="text-xs text-muted-foreground">
          {tr(`${summary.progress.done} of ${summary.progress.total} tasks done`, `${summary.progress.done} من ${summary.progress.total} مهمة منجزة`)}
          {summary.overdueTasks > 0 && (
            <span className="ms-2 font-medium text-destructive">· {tr(`${summary.overdueTasks} overdue`, `${summary.overdueTasks} متأخرة`)}</span>
          )}
        </p>
        <div className="border-t pt-3">
          <div className="flex items-center gap-2 text-sm">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            {start || end ? (
              <bdi>{start && end && totalDays! > 1 ? `${fmtDay(start)} – ${fmtDay(end)}` : fmtDay((end ?? start)!)}</bdi>
            ) : (
              <span className="text-muted-foreground">{tr('No dates yet', 'لا توجد مدة بعد')}</span>
            )}
          </div>
          {timePct !== null && (
            <>
              <Progress value={timePct} className={cn('mt-2 h-1.5', summary.late && '[&>div]:bg-destructive')} />
              <p className={cn('mt-1 text-xs', summary.late ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                {summary.late
                  ? tr(`${-daysLeft!} day(s) past the end`, `متأخر ${-daysLeft!} يوم عن النهاية`)
                  : daysLeft === 0
                    ? tr('Ends today', 'ينتهي اليوم')
                    : tr(`${daysLeft} day(s) left`, `باقي ${daysLeft} يوم`)}
                {summary.progress.pct < timePct && !summary.late && project.status !== 'Done' && (
                  <span className="ms-1 text-amber-600 dark:text-amber-400">· {tr('work is behind the calendar', 'الإنجاز أبطأ من الوقت')}</span>
                )}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Budget */}
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Wallet className="h-4 w-4" />{tr('Budget', 'الميزانية')}</h2>
          {summary.budget && (
            <span className={cn('text-sm font-semibold tabular-nums', summary.budget.pct >= 100 ? 'text-destructive' : summary.budget.pct >= 80 ? 'text-amber-600 dark:text-amber-400' : '')}>
              {summary.budget.pct}%
            </span>
          )}
        </div>
        {summary.budget ? (
          <>
            <Progress
              value={Math.min(100, summary.budget.pct)}
              className={cn('h-2', summary.budget.pct >= 100 ? '[&>div]:bg-destructive' : summary.budget.pct >= 80 ? '[&>div]:bg-amber-500' : '')}
            />
            <p className="text-sm">
              <span className="font-semibold">{amount(summary.budget.total)}</span>
              <span className="text-muted-foreground"> {tr('of', 'من')} {amount(summary.budget.budget)}</span>
            </p>
            <dl className="grid grid-cols-2 gap-2 border-t pt-3 text-xs">
              <div>
                <dt className="text-muted-foreground">{tr('Team time', 'وقت الفريق')}</dt>
                <dd className="font-medium">{amount(summary.budget.labor)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{tr('Expenses', 'المصروفات')}</dt>
                <dd className="font-medium">{amount(summary.budget.expenses)}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {canManage
              ? tr('No budget set. Add one under Edit to track spending.', 'لا توجد ميزانية. أضفها من "تعديل" لمتابعة الصرف.')
              : tr('No budget to show.', 'لا توجد ميزانية لعرضها.')}
          </p>
        )}
        {canManage && (
          <Popover open={templateOpen} onOpenChange={(o) => { setTemplateOpen(o); if (o) setTemplateName(project.name); }}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <BookmarkPlus className="me-1 h-4 w-4" />{tr('Save as template', 'حفظ كقالب')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-2" align="end">
              <p className="text-xs text-muted-foreground">
                {tr('Keeps the stages, tasks, people and checklist steps, with dates counted from the start.', 'يحفظ المراحل والمهام والأشخاص وقوائم التحقق، والتواريخ محسوبة من بداية المشروع.')}
              </p>
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder={tr('Template name', 'اسم القالب')} />
              <Button
                size="sm"
                className="w-full"
                disabled={!templateName.trim()}
                onClick={() => {
                  setTemplateOpen(false);
                  void run(() => saveProjectAsTemplate(project.id, templateName.trim()), tr('Template saved', 'تم حفظ القالب'));
                }}
              >
                {tr('Save', 'حفظ')}
              </Button>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Stages */}
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Flag className="h-4 w-4" />{tr('Stages', 'المراحل')}</h2>
        {stages.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {canManage
              ? tr('Split the project into stages, e.g. Preparation, Filming, Editing, Delivery.', 'قسّم المشروع لمراحل، مثل: التحضير، التصوير، المونتاج، التسليم.')
              : tr('No stages yet.', 'لا توجد مراحل بعد.')}
          </p>
        )}
        <ul className="space-y-2">
          {stages.map((m: ProjectMilestone) => {
            const pct = m.total ? Math.round((m.done / m.total) * 100) : 0;
            const overdue = m.dueDate && m.done < m.total && daysBetween(today, new Date(m.dueDate)) < 0;
            const complete = m.total > 0 && m.done === m.total;
            return (
              <li key={m.id} className="group space-y-1">
                <div className="flex items-center gap-2">
                  {renaming?.id === m.id ? (
                    <Input
                      autoFocus
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: m.id, name: e.target.value })}
                      onBlur={() => {
                        const name = renaming.name.trim();
                        setRenaming(null);
                        if (name && name !== m.name) void run(() => updateMilestone(project.id, m.id, { name }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      className="h-7 flex-1 text-sm"
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => setRenaming({ id: m.id, name: m.name })}
                      className={cn('min-w-0 flex-1 truncate text-start text-sm font-medium', complete && 'text-emerald-600 dark:text-emerald-400')}
                    >
                      <bdi>{m.name}</bdi>
                    </button>
                  )}
                  {canManage ? (
                    <DayPicker
                      value={m.dueDate}
                      placeholder={tr('Date', 'تاريخ')}
                      onChange={(d) => void run(() => updateMilestone(project.id, m.id, { dueDate: d ? d.toISOString() : null }))}
                    />
                  ) : (
                    m.dueDate && <span className={cn('text-xs', overdue ? 'text-destructive' : 'text-muted-foreground')}>{fmtDay(m.dueDate)}</span>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => void run(() => deleteMilestone(project.id, m.id))}
                      className="rounded p-1 text-muted-foreground opacity-60 hover:text-destructive md:opacity-0 md:group-hover:opacity-100"
                      aria-label={tr('Remove stage', 'حذف المرحلة')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={pct} className={cn('h-1.5 flex-1', complete && '[&>div]:bg-emerald-500', overdue && '[&>div]:bg-destructive')} />
                  <span className={cn('w-10 text-end text-[11px] tabular-nums', overdue ? 'text-destructive' : 'text-muted-foreground')}>{m.done}/{m.total}</span>
                </div>
              </li>
            );
          })}
        </ul>
        {canManage && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addStage(); }}>
            <Input
              value={newStage.name}
              maxLength={120}
              onChange={(e) => setNewStage((s) => ({ ...s, name: e.target.value }))}
              placeholder={tr('Add a stage…', 'أضف مرحلة…')}
              className="h-8 text-sm"
            />
            <DayPicker value={newStage.due ? newStage.due.toISOString() : null} placeholder={tr('Date', 'تاريخ')} onChange={(d) => setNewStage((s) => ({ ...s, due: d }))} />
            <Button type="submit" size="sm" variant="outline" className="h-8" disabled={!newStage.name.trim()} aria-label={tr('Add stage', 'إضافة مرحلة')}>
              <Plus className="h-4 w-4" />
            </Button>
          </form>
        )}
        {stages.length > 0 && (
          <p className="text-[11px] text-muted-foreground">{tr('Put a task in a stage from the task itself.', 'اربط المهمة بمرحلة من داخل المهمة.')}</p>
        )}
      </div>
    </section>
  );
}
