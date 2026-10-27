'use client';

import * as React from 'react';
import { CalendarIcon, X } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/context/i18n-context';
import { getCurrentLocale } from '@/lib/locale';
import { cn } from '@/lib/utils';
import { formatTaskDates, taskSpanDays } from '../lib/task-meta';

export type TaskDates = { startDate?: Date | null; dueDate?: Date };

/**
 * One picker for a task's dates: tap one day for a due date, or a first and a
 * last day for a task that takes several days.
 */
export function TaskDatesPicker({ value, onChange, className }: { value: TaskDates; onChange: (next: TaskDates) => void; className?: string }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const due = value.dueDate ? new Date(value.dueDate) : undefined;
  const start = value.startDate ? new Date(value.startDate) : undefined;
  const selected: DateRange | undefined = due ? { from: start ?? due, to: due } : undefined;
  const days = taskSpanDays(value);
  const label = formatTaskDates(value, getCurrentLocale());

  const pick = (range: DateRange | undefined) => {
    if (!range?.from) return onChange({ startDate: null, dueDate: undefined });
    const to = range.to ?? range.from;
    const single = to.toDateString() === range.from.toDateString();
    onChange({ startDate: single ? null : range.from, dueDate: to });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('justify-start text-start font-normal', !due && 'text-muted-foreground', className)}>
          <CalendarIcon className="me-2 h-4 w-4 shrink-0" />
          {label ? (
            <span className="truncate">
              <bdi>{label}</bdi>
              {days > 1 && <span className="ms-1 text-muted-foreground">· {tr(`${days} days`, `${days} أيام`)}</span>}
            </span>
          ) : (
            <span>{tr('Pick a date', 'اختر تاريخاً')}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="range" selected={selected} onSelect={pick} defaultMonth={start ?? due} initialFocus />
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          <span>{tr('One day = due date. Two days = from and to.', 'يوم واحد = الاستحقاق. يومان = من وإلى.')}</span>
          {due && (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => onChange({ startDate: null, dueDate: undefined })}>
              <X className="me-1 h-3.5 w-3.5" />
              {tr('Clear', 'مسح')}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
