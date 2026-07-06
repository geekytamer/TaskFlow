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
import { canViewProject } from '@/modules/projects/lib/access';
import { cn } from '@/lib/utils';

export function ProjectList() {
  const { selectedCompany, projects, currentUser, currentRole, loading } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);

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
      if (currentRole === 'Employee') {
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
  }, [currentRole, selectedCompany]);

  const visibleProjects = React.useMemo(() => {
    if (!currentUser || !selectedCompany) return [];
    return projects
      .filter(
        (p) =>
          p.companyId === selectedCompany.id &&
          canViewProject(p, currentUser.id, currentRole),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, currentUser, currentRole, selectedCompany]);

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

  return (
    <div>
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
            const hasOverdue = stats.overdue > 0;
            return (
              <a href={`/projects/${project.id}`} key={project.id}>
                <Card
                  className="w-[280px] h-[168px] cursor-pointer hover:border-primary hover:shadow-sm transition-all flex flex-col border-s-4"
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
                        </span>
                        <span className="font-medium tabular-nums">{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-2">
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
