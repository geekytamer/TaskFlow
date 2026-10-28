'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Globe, Lock, Users, AlertCircle } from 'lucide-react';
import { getClients } from '@/services/financeService';
import { getTasks } from '@/services/projectService';
import type { Client } from '@/modules/finance/types';
import type { Task } from '@/modules/projects/types';
import { canViewProject, useSeesAllProjects } from '@/modules/projects/lib/access';
import { usePermissionOr } from '@/context/permissions-context';
import { getCurrentLocale } from '@/lib/locale';
import {
  PROJECT_PRIORITY_STYLE,
  PROJECT_PRIORITY_WEIGHT,
  PROJECT_STATUS_STYLE,
  projectIsLate,
  projectPriorityName,
  projectStatusName,
  projectTab,
  type ProjectTab,
} from '@/modules/projects/lib/project-meta';
import { cn } from '@/lib/utils';

export function ProjectList() {
  const { selectedCompany, projects, currentUser, currentRole, loading } = useCompany();
  const seesAllProjects = useSeesAllProjects(currentRole);
  const canLoadClients = usePermissionOr('contacts', 'clients.read', currentRole !== 'Employee');
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [tab, setTab] = React.useState<ProjectTab>('current');

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!selectedCompany) {
        setClients([]);
        setTasks([]);
        return;
      }
      try {
        const tasksData = await getTasks();
        if (!cancelled) setTasks(tasksData);
      } catch {
        if (!cancelled) setTasks([]);
      }
      if (!canLoadClients) {
        setClients([]);
        return;
      }
      try {
        const data = await getClients(selectedCompany.id);
        if (!cancelled) setClients(data);
      } catch {
        if (!cancelled) setClients([]);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [currentRole, selectedCompany, canLoadClients]);

  const companyProjects = React.useMemo(() => {
    if (!currentUser || !selectedCompany) return [];
    return projects.filter(
      (p) =>
        p.companyId === selectedCompany.id &&
        canViewProject(p, currentUser.id, currentRole, seesAllProjects),
    );
  }, [projects, currentUser, currentRole, selectedCompany, seesAllProjects]);

  const tabCounts = React.useMemo(() => {
    const counts: Record<ProjectTab, number> = { current: 0, done: 0, archived: 0, all: companyProjects.length };
    for (const p of companyProjects) counts[projectTab(p.status)]++;
    return counts;
  }, [companyProjects]);

  // Most urgent first, then the one ending soonest, then by name.
  const visibleProjects = React.useMemo(() => {
    const end = (p: (typeof companyProjects)[number]) => (p.endDate ? new Date(p.endDate).getTime() : Infinity);
    return companyProjects
      .filter((p) => tab === 'all' || projectTab(p.status) === tab)
      .sort(
        (a, b) =>
          PROJECT_PRIORITY_WEIGHT[a.priority ?? 'Medium'] - PROJECT_PRIORITY_WEIGHT[b.priority ?? 'Medium'] ||
          end(a) - end(b) ||
          a.name.localeCompare(b.name),
      );
  }, [companyProjects, tab]);

  const statsByProject = React.useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const map = new Map<
      string,
      { total: number; done: number; overdue: number }
    >();
    for (const t of tasks) {
      const entry = map.get(t.projectId) || { total: 0, done: 0, overdue: 0 };
      entry.total++;
      if (t.status === 'Done') entry.done++;
      else if (t.dueDate && new Date(t.dueDate) < todayStart) entry.overdue++;
      map.set(t.projectId, entry);
    }
    return map;
  }, [tasks]);

  if (loading) {
    return (
      <div className="flex w-max gap-4 pb-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="w-[280px] h-[168px]" />
        ))}
      </div>
    );
  }

  const tabs: Array<{ key: ProjectTab; label: string }> = [
    { key: 'current', label: tr('Current', 'الجارية') },
    { key: 'done', label: tr('Done', 'المكتملة') },
    { key: 'archived', label: tr('Archived', 'المؤرشفة') },
    { key: 'all', label: tr('All', 'الكل') },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 self-start rounded-lg border bg-card p-1 text-sm w-fit" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-md px-3 py-1 font-medium transition-colors',
              tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            <span className="ms-1.5 text-xs opacity-70 tabular-nums">{tabCounts[t.key]}</span>
          </button>
        ))}
      </div>
      {visibleProjects.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {tab === 'current'
            ? tr('No current projects.', 'لا توجد مشاريع جارية.')
            : tab === 'done'
              ? tr('No finished projects yet.', 'لا توجد مشاريع مكتملة بعد.')
              : tab === 'archived'
                ? tr('Nothing archived.', 'لا يوجد شيء في الأرشيف.')
                : tr('No projects yet.', 'لا توجد مشاريع بعد.')}
        </p>
      )}
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex w-max gap-4 pb-4">
          {visibleProjects.map((project) => {
            const client = clients.find((entry) => entry.id === project.clientId);
            const stats = statsByProject.get(project.id) || {
              total: 0,
              done: 0,
              overdue: 0,
            };
            const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
            const memberCount = project.memberIds?.length ?? 0;
            const late = projectIsLate(project);
            const hasOverdue = stats.overdue > 0 || late;
            const day = (d: string) => new Date(d).toLocaleDateString(getCurrentLocale(), { day: 'numeric', month: 'short' });
            return (
              <a href={`/projects/${project.id}`} key={project.id}>
                <Card
                  className="w-[280px] min-h-[168px] h-full cursor-pointer hover:border-primary hover:shadow-sm transition-all flex flex-col border-s-4"
                  style={{
                    borderInlineStartColor: hasOverdue ? 'hsl(var(--destructive))' : project.color,
                  }}
                >
                  <CardHeader className="flex-1 pb-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                      <CardTitle className="truncate text-lg">{project.name}</CardTitle>
                    </div>
                    <CardDescription className="line-clamp-2 h-10 whitespace-normal">
                      {project.description}
                    </CardDescription>
                  </CardHeader>

                  <div className="px-6 pb-4 space-y-2.5">
                    {/* Progress */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {stats.done}/{stats.total} {tr('done', 'مكتملة')}
                          {project.endDate && (
                            <span className={late ? 'ms-1 font-medium text-destructive' : 'ms-1'}>
                              · <bdi>{project.startDate && project.startDate.slice(0, 10) !== project.endDate.slice(0, 10) ? `${day(project.startDate)} – ${day(project.endDate)}` : day(project.endDate)}</bdi>
                            </span>
                          )}
                        </span>
                        <span className="font-medium tabular-nums">{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={PROJECT_STATUS_STYLE[project.status ?? 'Active']}>
                        {late ? tr('Late', 'متأخر') : projectStatusName(project.status, language)}
                      </Badge>
                      {(project.priority === 'High' || project.priority === 'Urgent') && (
                        <Badge variant="outline" className={PROJECT_PRIORITY_STYLE[project.priority]}>
                          {projectPriorityName(project.priority, language)}
                        </Badge>
                      )}
                      {project.postponedFrom && (
                        <Badge variant="outline" className="border-sky-300 text-sky-700 dark:border-sky-500/40 dark:text-sky-300">
                          {tr('Moved', 'مرحّل')}
                        </Badge>
                      )}
                      <Badge
                        variant={project.visibility === 'Private' ? 'secondary' : 'outline'}
                        className="gap-1"
                      >
                        {project.visibility === 'Private' ? (
                          <Lock className="h-3 w-3" />
                        ) : (
                          <Globe className="h-3 w-3" />
                        )}
                        {project.visibility === 'Private'
                          ? tr('Private', 'خاص')
                          : tr('Public', 'عام')}
                      </Badge>
                      {memberCount > 0 && (
                        <Badge variant="outline" className="gap-1">
                          <Users className="h-3 w-3" />
                          {memberCount}
                        </Badge>
                      )}
                      {hasOverdue && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {stats.overdue}
                        </Badge>
                      )}
                      {client && <Badge variant="outline">{client.name}</Badge>}
                    </div>
                  </div>
                </Card>
              </a>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
