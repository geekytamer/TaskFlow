'use client';

/**
 * Tasks bundle 3: Calendar (tasks on the days they run), Workload (what is
 * left of each person's estimates per week) and Week (the weekly report).
 */
import * as React from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompany } from '@/context/company-context';
import { useCompanyScope } from '@/context/company-scope-context';
import { useI18n } from '@/context/i18n-context';
import { displayName } from '@/lib/display-name';
import { useLiveRefresh } from '@/lib/live';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api-client';
import { getTasks } from '@/services/projectService';
import { getCompanyPeople, type PersonSummary } from '@/services/userService';
import type { Task } from '../types';
import { dayKey, hoursText, monthGrid, tasksByDay, weekStart, workload } from '../lib/task-planning';
import { TaskDetailsSheet } from './task-details-sheet';

type Tr = (en: string, ar: string) => string;
const useTr = (): { tr: Tr; locale: string } => {
  const { language } = useI18n();
  return { tr: React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]), locale: language === 'ar' ? 'ar' : 'en-GB' };
};

/** The tasks in the companies on screen, people's names, and a details sheet to open one. */
function usePlanningData() {
  const { companyIds } = useCompanyScope();
  const { selectedCompany } = useCompany();
  const [tasks, setTasks] = React.useState<Task[] | null>(null);
  const { language } = useI18n();
  const [people, setPeople] = React.useState<PersonSummary[]>([]);
  const names = React.useMemo(() => new Map(people.map((p) => [p.id, displayName(p, language)])), [people, language]);
  const scopeKey = companyIds.join(',');
  const load = React.useCallback(async () => {
    const ids = scopeKey ? scopeKey.split(',') : selectedCompany ? [selectedCompany.id] : [];
    const [all, lists] = await Promise.all([
      getTasks().catch(() => [] as Task[]),
      Promise.all(ids.map((id) => getCompanyPeople(id).catch(() => [] as PersonSummary[]))),
    ]);
    setTasks(all.filter((t) => ids.includes(t.companyId)));
    setPeople(lists.flat());
  }, [scopeKey, selectedCompany]);
  React.useEffect(() => { void load(); }, [load]);
  useLiveRefresh(['tasks', 'time-entries'], () => void load());
  return { tasks, names, reload: load };
}

function OpenTask({ task, onClose, onChanged }: { task: Task | null; onClose: () => void; onChanged: () => void }) {
  if (!task) return null;
  return <TaskDetailsSheet open task={task} onOpenChange={(open) => { if (!open) onClose(); }} onTaskUpdate={() => { onClose(); onChanged(); }} />;
}

const statusDot = (t: Task) => (t.status === 'Done' ? 'bg-emerald-500' : t.dueDate && new Date(t.dueDate) < new Date() ? 'bg-destructive' : t.priority === 'Urgent' || t.priority === 'High' ? 'bg-amber-500' : 'bg-primary');

/* ── Calendar ───────────────────────────────────────────────────────── */

export function TaskCalendar() {
  const { tr, locale } = useTr();
  const { currentUser } = useCompany();
  const { tasks, reload } = usePlanningData();
  const [month, setMonth] = React.useState(() => new Date());
  const [mine, setMine] = React.useState(true);
  const [open, setOpen] = React.useState<Task | null>(null);
  const shown = (tasks ?? []).filter((t) => !mine || t.assignedUserIds?.includes(currentUser?.id ?? ''));
  const byDay = React.useMemo(() => tasksByDay(shown), [shown]);
  const days = monthGrid(month);
  const today = dayKey(new Date());
  const weekdays = days.slice(0, 7).map((d) => d.toLocaleDateString(locale, { weekday: 'short' }));
  const move = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  // Phones get the days that have something, as a list.
  const agenda = days.filter((d) => d.getMonth() === month.getMonth() && byDay.get(dayKey(d))?.length);

  if (!tasks) return <Skeleton className="h-96 w-full" />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon" variant="outline" className="h-8 w-8" aria-label={tr('Previous month', 'الشهر السابق')} onClick={() => move(-1)}><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></Button>
        <h2 className="min-w-36 text-center text-base font-semibold">{month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</h2>
        <Button size="icon" variant="outline" className="h-8 w-8" aria-label={tr('Next month', 'الشهر التالي')} onClick={() => move(1)}><ChevronRight className="h-4 w-4 rtl:rotate-180" /></Button>
        <Button size="sm" variant="ghost" onClick={() => setMonth(new Date())}>{tr('Today', 'اليوم')}</Button>
        <div className="ms-auto flex rounded-lg border p-0.5 text-sm">
          {[true, false].map((v) => (
            <button key={String(v)} type="button" onClick={() => setMine(v)} className={cn('rounded-md px-3 py-1', mine === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
              {v ? tr('My tasks', 'مهامي') : tr('Everyone', 'الجميع')}
            </button>
          ))}
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-lg border sm:block">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
          {weekdays.map((w) => <div key={w} className="py-1.5">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const k = dayKey(d);
            const list = byDay.get(k) ?? [];
            const outside = d.getMonth() !== month.getMonth();
            return (
              <div key={k} className={cn('min-h-24 border-b border-e p-1', outside && 'bg-muted/20 text-muted-foreground')}>
                <div className={cn('mb-1 text-xs', k === today && 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground')}>{d.getDate()}</div>
                <ul className="space-y-0.5">
                  {list.slice(0, 3).map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => setOpen(t)} className={cn('flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-start text-xs hover:bg-accent', t.status === 'Done' && 'line-through opacity-60')}>
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDot(t))} aria-hidden="true" />
                        <span className="truncate" dir="auto">{t.title}</span>
                      </button>
                    </li>
                  ))}
                  {list.length > 3 && <li className="px-1 text-[11px] text-muted-foreground">{tr(`+${list.length - 3} more`, `+${list.length - 3} أخرى`)}</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <ul className="space-y-3 sm:hidden">
        {agenda.length === 0 && <li className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">{tr('Nothing due this month.', 'لا شيء مستحق هذا الشهر.')}</li>}
        {agenda.map((d) => (
          <li key={dayKey(d)}>
            <p className={cn('mb-1 text-xs font-semibold', dayKey(d) === today && 'text-primary')}>{d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })}</p>
            <ul className="divide-y rounded-lg border">
              {(byDay.get(dayKey(d)) ?? []).map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => setOpen(t)} className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', statusDot(t))} aria-hidden="true" />
                    <span className={cn('truncate', t.status === 'Done' && 'line-through opacity-60')} dir="auto">{t.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <OpenTask task={open} onClose={() => setOpen(null)} onChanged={() => void reload()} />
    </div>
  );
}

/* ── Workload ───────────────────────────────────────────────────────── */

const WEEK_CAPACITY = 40 * 60;

export function TaskWorkload() {
  const { tr, locale } = useTr();
  const { tasks, names, reload } = usePlanningData();
  const [picked, setPicked] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<Task | null>(null);
  if (!tasks) return <Skeleton className="h-64 w-full" />;
  const rows = workload(tasks, new Date(), 4).sort((a, b) => b.total - a.total);
  const weeks = rows[0]?.weeks.map((w) => w.start) ?? [];
  const pickedCell = picked ? rows.flatMap((r) => r.weeks.map((w, i) => ({ key: `${r.userId}:${i}`, r, w }))).find((c) => c.key === picked) : undefined;
  const unestimated = tasks.filter((t) => t.status !== 'Done' && !t.estimateMinutes && t.dueDate).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {tr('What is left of each estimate, in the week it is due (overdue work counts this week). Above 40 hours a week is shown in amber.',
          'ما تبقى من كل تقدير في أسبوع استحقاقه (المتأخر يُحسب هذا الأسبوع). ما فوق 40 ساعة أسبوعيًا يظهر بالكهرماني.')}
        {unestimated > 0 && <> {tr(`${unestimated} open task(s) have no estimate yet.`, `${unestimated} مهمة مفتوحة بلا تقدير بعد.`)}</>}
      </p>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">{tr('No open tasks with a due date and a person on them.', 'لا مهام مفتوحة لها تاريخ استحقاق ومسؤول.')}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{tr('Person', 'الشخص')}</th>
                {weeks.map((w, i) => (
                  <th key={i} className="px-3 py-2 text-start font-medium">
                    {i === 0 ? tr('This week', 'هذا الأسبوع') : w.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="border-t">
                  <td className="px-3 py-2 font-medium" dir="auto">{names.get(r.userId) ?? tr('Someone', 'شخص ما')}</td>
                  {r.weeks.map((w, i) => {
                    const key = `${r.userId}:${i}`;
                    const heavy = w.minutes > WEEK_CAPACITY;
                    return (
                      <td key={i} className="px-2 py-1.5">
                        {w.tasks.length ? (
                          <button
                            type="button" aria-expanded={picked === key} onClick={() => setPicked((p) => (p === key ? null : key))}
                            className={cn('w-full rounded-md px-2 py-1 text-start hover:bg-accent', heavy && 'bg-amber-500/15 text-amber-700 dark:text-amber-300', picked === key && 'ring-2 ring-primary')}
                          >
                            <span className="block font-medium tabular-nums">{w.minutes ? hoursText(w.minutes) : '—'}</span>
                            <span className="text-xs text-muted-foreground">
                              {tr(`${w.tasks.length} task${w.tasks.length === 1 ? '' : 's'}`, `${w.tasks.length} مهمة`)}
                              {w.unestimated ? tr(` · ${w.unestimated} unestimated`, ` · ${w.unestimated} بلا تقدير`) : ''}
                            </span>
                          </button>
                        ) : <span className="px-2 text-muted-foreground">·</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pickedCell && (
        <ul className="divide-y rounded-lg border">
          {pickedCell.w.tasks.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setOpen(t)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-start text-sm hover:bg-accent">
                <span className={cn('h-2 w-2 rounded-full', statusDot(t))} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate" dir="auto">{t.title}</span>
                <span className="text-xs text-muted-foreground">
                  {t.dueDate ? new Date(t.dueDate).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : ''}
                  {t.estimateMinutes ? ` · ${hoursText(t.loggedMinutes ?? 0)} / ${hoursText(t.estimateMinutes)}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <OpenTask task={open} onClose={() => setOpen(null)} onChanged={() => void reload()} />
    </div>
  );
}

/* ── Week ───────────────────────────────────────────────────────────── */

interface WeekRef { id: string; title: string; projectId: string; dueDate?: string; estimateMinutes?: number | null; loggedMinutes?: number }
interface WeekPerson { userId: string; name: string; done: WeekRef[]; dueOpen: WeekRef[]; overdue: WeekRef[]; loggedMinutes: number }
interface TaskWeekReport { weekStart: string; weekEnd: string; people: WeekPerson[]; totals: { done: number; dueOpen: number; overdue: number; loggedMinutes: number; unassignedOpen: number } }

export function TaskWeekReport({ initialWeek }: { initialWeek?: string }) {
  const { tr, locale } = useTr();
  const { selectedCompany } = useCompany();
  const [start, setStart] = React.useState(() => weekStart(initialWeek ? new Date(`${initialWeek}T12:00:00`) : new Date()));
  const [report, setReport] = React.useState<TaskWeekReport | null>(null);
  const [failed, setFailed] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const companyId = selectedCompany?.id;
  React.useEffect(() => {
    if (!companyId) return;
    let live = true;
    setReport(null);
    apiFetch<TaskWeekReport>(`/companies/${companyId}/tasks/week?start=${dayKey(start)}`)
      .then((r) => { if (live) { setReport(r); setFailed(null); } })
      .catch((e: Error) => { if (live) setFailed(e.message); });
    return () => { live = false; };
  }, [companyId, start]);
  const move = (n: number) => setStart((s) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7 * n));
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const isThisWeek = dayKey(weekStart(new Date())) === dayKey(start);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon" variant="outline" className="h-8 w-8" aria-label={tr('Previous week', 'الأسبوع السابق')} onClick={() => move(-1)}><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></Button>
        <h2 className="text-base font-semibold">
          {start.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – {end.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
        </h2>
        <Button size="icon" variant="outline" className="h-8 w-8" aria-label={tr('Next week', 'الأسبوع التالي')} disabled={isThisWeek} onClick={() => move(1)}><ChevronRight className="h-4 w-4 rtl:rotate-180" /></Button>
        {!isThisWeek && <Button size="sm" variant="ghost" onClick={() => setStart(weekStart(new Date()))}>{tr('This week', 'هذا الأسبوع')}</Button>}
      </div>
      {failed ? <p className="text-sm text-destructive" role="alert">{failed}</p> : !report ? <Skeleton className="h-48 w-full" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              [tr('Done', 'أُنجز'), String(report.totals.done), 'text-emerald-600 dark:text-emerald-400'],
              [tr('Due, still open', 'مستحق ولم يُنجز'), String(report.totals.dueOpen), ''],
              [tr('Overdue', 'متأخر'), String(report.totals.overdue), report.totals.overdue ? 'text-destructive' : ''],
              [tr('Time logged', 'الوقت المسجل'), hoursText(report.totals.loggedMinutes), ''],
            ].map(([label, value, cls]) => (
              <div key={label} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn('text-2xl font-semibold tabular-nums', cls)}>{value}</p>
              </div>
            ))}
          </div>
          {report.totals.unassignedOpen > 0 && (
            <p className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400"><AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {tr(`${report.totals.unassignedOpen} open task(s) due by now have nobody on them.`, `${report.totals.unassignedOpen} مهمة مفتوحة مستحقة بلا مسؤول.`)}
            </p>
          )}
          {report.people.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">{tr('Nothing happened in tasks this week.', 'لم يحدث شيء في المهام هذا الأسبوع.')}</div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {report.people.map((p) => (
                <li key={p.userId}>
                  <button type="button" aria-expanded={expanded === p.userId} onClick={() => setExpanded((e) => (e === p.userId ? null : p.userId))} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-start text-sm hover:bg-accent">
                    <span className="min-w-32 flex-1 font-medium" dir="auto">{p.name}</span>
                    <span className="text-emerald-600 dark:text-emerald-400">{tr(`${p.done.length} done`, `${p.done.length} أُنجز`)}</span>
                    <span>{tr(`${p.dueOpen.length} due`, `${p.dueOpen.length} مستحق`)}</span>
                    <span className={p.overdue.length ? 'text-destructive' : 'text-muted-foreground'}>{tr(`${p.overdue.length} overdue`, `${p.overdue.length} متأخر`)}</span>
                    <span className="tabular-nums text-muted-foreground">{hoursText(p.loggedMinutes)}</span>
                  </button>
                  {expanded === p.userId && (
                    <div className="grid gap-3 border-t bg-muted/20 px-3 py-2 text-sm sm:grid-cols-3">
                      {([[tr('Done', 'أُنجز'), p.done], [tr('Due', 'مستحق'), p.dueOpen], [tr('Overdue', 'متأخر'), p.overdue]] as Array<[string, WeekRef[]]>).map(([label, list]) => (
                        <div key={label}>
                          <p className="mb-1 text-xs font-semibold text-muted-foreground">{label}</p>
                          {list.length ? (
                            <ul className="space-y-0.5">
                              {list.map((t) => (
                                <li key={t.id} className="truncate" dir="auto">
                                  {t.title}
                                  {t.estimateMinutes ? <span className="ms-1 text-xs text-muted-foreground">({hoursText(t.loggedMinutes ?? 0)} / {hoursText(t.estimateMinutes)})</span> : null}
                                </li>
                              ))}
                            </ul>
                          ) : <p className="text-xs text-muted-foreground">—</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
