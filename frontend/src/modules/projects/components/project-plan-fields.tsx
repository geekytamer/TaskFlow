'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/context/i18n-context';
import { projectPriorityName, projectStatusName } from '../lib/project-meta';
import { projectPriorities, projectStatuses, type ProjectPriority, type ProjectStatus } from '../types';
import { TaskDatesPicker } from './task-dates-picker';

export type ProjectPlanValue = {
  status: ProjectStatus;
  priority: ProjectPriority;
  startDate: Date | null;
  endDate: Date | null;
  /** As typed; '' means no budget. */
  budget: string;
};

export const emptyProjectPlan = (): ProjectPlanValue => ({ status: 'Active', priority: 'Medium', startDate: null, endDate: null, budget: '' });

export function projectPlanFrom(p: { status?: ProjectStatus; priority?: ProjectPriority; startDate?: string | null; endDate?: string | null; budget?: number | null }): ProjectPlanValue {
  return {
    status: p.status ?? 'Active',
    priority: p.priority ?? 'Medium',
    startDate: p.startDate ? new Date(p.startDate) : null,
    endDate: p.endDate ? new Date(p.endDate) : null,
    budget: p.budget != null ? String(p.budget) : '',
  };
}

/** What the API takes: cleared fields go as null. */
export function projectPlanPayload(v: ProjectPlanValue) {
  const budget = v.budget.trim() === '' ? null : Number(v.budget);
  return {
    status: v.status,
    priority: v.priority,
    startDate: v.startDate ? v.startDate.toISOString() : null,
    endDate: v.endDate ? v.endDate.toISOString() : null,
    budget: budget !== null && Number.isFinite(budget) ? budget : null,
  };
}

/** Status, from–to dates and budget of a project, laid out like the rest of the project forms. */
export function ProjectPlanFields({ value, onChange, showBudget = true }: { value: ProjectPlanValue; onChange: (next: ProjectPlanValue) => void; showBudget?: boolean }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  return (
    <>
      <div className="space-y-2">
        <Label>{tr('Status', 'الحالة')}</Label>
        <Select value={value.status} onValueChange={(s) => onChange({ ...value, status: s as ProjectStatus })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {projectStatuses.map((s) => (
              <SelectItem key={s} value={s}>{projectStatusName(s, language)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{tr('Priority', 'الأولوية')}</Label>
        <Select value={value.priority} onValueChange={(p) => onChange({ ...value, priority: p as ProjectPriority })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {projectPriorities.map((p) => (
              <SelectItem key={p} value={p}>{projectPriorityName(p, language)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{tr('Dates', 'المدة')}</Label>
        <TaskDatesPicker
          className="w-full"
          hint={tr('Pick the first and the last day.', 'اختر أول يوم وآخر يوم.')}
          value={{ startDate: value.startDate, dueDate: value.endDate ?? undefined }}
          onChange={(next) => onChange({ ...value, startDate: next.startDate ?? (next.dueDate ?? null), endDate: next.dueDate ?? null })}
        />
      </div>
      {showBudget && (
        <div className="space-y-2">
          <Label htmlFor="project-budget">{tr('Budget', 'الميزانية')}</Label>
          <Input
            id="project-budget"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={value.budget}
            onChange={(e) => onChange({ ...value, budget: e.target.value })}
            placeholder={tr('Optional — leave empty if this project is just a group of tasks', 'اختياري — اتركها فارغة لو المشروع مجرد مجموعة مهام')}
          />
        </div>
      )}
    </>
  );
}
