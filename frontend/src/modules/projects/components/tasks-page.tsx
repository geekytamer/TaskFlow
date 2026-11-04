'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, ClipboardList, ListTodo, Users } from 'lucide-react';
import { useI18n } from '@/context/i18n-context';
import { cn } from '@/lib/utils';
import { TaskList } from './task-list';
import { CreateTaskSheet } from './create-task-sheet';
import { ScopeBar } from '@/modules/groups/components/scope-bar';
import { useCompanyScope } from '@/context/company-scope-context';
import { TaskCalendar, TaskWeekReport, TaskWorkload } from './task-planning-views';

const VIEWS = ['list', 'calendar', 'workload', 'week'] as const;
type View = (typeof VIEWS)[number];

export function TasksPage() {
  const { t, language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { inTree } = useCompanyScope();
  const router = useRouter();
  const params = useSearchParams();
  const asked = params.get('view');
  const view: View = (VIEWS as readonly string[]).includes(asked ?? '') ? (asked as View) : 'list';
  const setView = (v: View) => {
    const next = new URLSearchParams(params.toString());
    if (v === 'list') next.delete('view'); else next.set('view', v);
    next.delete('week');
    router.replace(`/tasks${next.toString() ? `?${next}` : ''}`, { scroll: false });
  };
  const labels: Record<View, [string, React.ComponentType<{ className?: string }>]> = {
    list: [tr('List', 'قائمة'), ListTodo],
    calendar: [tr('Calendar', 'التقويم'), CalendarDays],
    workload: [tr('Workload', 'عبء العمل'), Users],
    week: [tr('Week', 'الأسبوع'), ClipboardList],
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold font-headline">{t('tasksPage.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('tasksPage.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ScopeBar />
          {!inTree && <CreateTaskSheet />}
        </div>
      </div>

      <div role="tablist" aria-label={tr('Task views', 'عروض المهام')} className="flex max-w-full gap-1 self-start overflow-x-auto rounded-lg border bg-card p-1 text-sm">
        {VIEWS.map((v) => {
          const [label, Icon] = labels[v];
          return (
            <button
              key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={cn('flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors', view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <Icon className="h-4 w-4" />{label}
            </button>
          );
        })}
      </div>

      {view === 'list' && <TaskList />}
      {view === 'calendar' && <TaskCalendar />}
      {view === 'workload' && <TaskWorkload />}
      {view === 'week' && <TaskWeekReport initialWeek={params.get('week') ?? undefined} />}
    </div>
  );
}
