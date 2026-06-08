'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { getTasks } from '@/services/projectService';
import { ProjectTable } from './project-table';
import { CreateTaskSheet } from './create-task-sheet';
import { canViewProject } from '@/modules/projects/lib/access';
import { taskStatuses, taskPriorities, type Task } from '@/modules/projects/types';
import {
  CheckSquare,
  Clock,
  AlertCircle,
  ListTodo,
  TrendingUp,
} from 'lucide-react';

function StatCard({ icon: Icon, label, value, color = 'text-foreground' }: {
  icon: React.ElementType; label: string; value: number; color?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 flex items-start gap-3">
      <div className="rounded-lg bg-muted p-2 shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className={`mt-0.5 text-xl font-bold ${color}`}>{value}</div>
      </div>
    </div>
  );
}

export function TasksPage() {
  const { selectedCompany, projects, currentUser, currentRole } = useCompany();
  const { t } = useI18n();
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!selectedCompany || !currentUser) return;
    setLoading(true);
    getTasks()
      .then((all) => {
        const visibleProjectIds = new Set(
          projects
            .filter((p) => p.companyId === selectedCompany.id && canViewProject(p, currentUser.id, currentRole))
            .map((p) => p.id),
        );
        setTasks(all.filter((t) => visibleProjectIds.has(t.projectId)));
      })
      .finally(() => setLoading(false));
  }, [selectedCompany, projects, currentUser, currentRole]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todo      = tasks.filter((t) => t.status === 'To Do').length;
  const inProgress = tasks.filter((t) => t.status === 'In Progress').length;
  const done      = tasks.filter((t) => t.status === 'Done').length;
  const overdue   = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < today && t.status !== 'Done',
  ).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-headline">{t('tasksPage.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('tasksPage.subtitle')}</p>
        </div>
        <CreateTaskSheet />
      </div>

      {/* Stats */}
      {!loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={ListTodo}    label={t('tasksPage.todo')}       value={todo} />
          <StatCard icon={TrendingUp}  label={t('tasksPage.inProgress')} value={inProgress} color="text-blue-600" />
          <StatCard icon={CheckSquare} label={t('tasksPage.done')}       value={done}        color="text-green-600" />
          <StatCard icon={AlertCircle} label={t('tasksPage.overdue')}    value={overdue}     color={overdue > 0 ? 'text-red-600' : 'text-foreground'} />
        </div>
      )}

      {/* Full task table — no projectId = show all */}
      <ProjectTable />
    </div>
  );
}
