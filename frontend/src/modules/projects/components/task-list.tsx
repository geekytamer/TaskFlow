'use client';

import * as React from 'react';
import { format, isToday, isThisWeek, startOfDay } from 'date-fns';
import {
  CheckSquare,
  ListTodo,
  TrendingUp,
  AlertCircle,
  ChevronRight,
  CalendarClock,
  Inbox,
  Lock,
} from 'lucide-react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { getTasks, updateTask } from '@/services/projectService';
import { getUsersByCompany } from '@/services/userService';
import { getClients } from '@/services/financeService';
import {
  taskStatuses,
  type Task,
  type TaskStatus,
} from '@/modules/projects/types';
import type { User } from '@/modules/users/types';
import type { Client } from '@/modules/finance/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { TaskDetailsSheet } from './task-details-sheet';

/* ------------------------------------------------------------------ */
/* Design tokens                                                       */
/* ------------------------------------------------------------------ */

const PRIORITY_DOT: Record<Task['priority'], string> = {
  High: 'bg-red-500',
  Medium: 'bg-amber-500',
  Low: 'bg-emerald-500',
};

const STATUS_STYLE: Record<TaskStatus, { dot: string; text: string }> = {
  'To Do': { dot: 'bg-slate-400', text: 'text-slate-600 dark:text-slate-300' },
  'In Progress': { dot: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' },
  Done: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
};

type StatFilter = 'all' | TaskStatus | 'overdue';

/** Time-horizon triage bucket, Asana "My Tasks" style. */
type BucketKey = 'overdue' | 'today' | 'week' | 'later' | 'none' | 'done';

function bucketFor(task: Task, todayStart: Date): BucketKey {
  if (task.status === 'Done') return 'done';
  if (!task.dueDate) return 'none';
  const due = new Date(task.dueDate);
  if (startOfDay(due) < todayStart) return 'overdue';
  if (isToday(due)) return 'today';
  if (isThisWeek(due, { weekStartsOn: 6 })) return 'week';
  return 'later';
}

/* ------------------------------------------------------------------ */
/* Stat card (clickable filter)                                        */
/* ------------------------------------------------------------------ */

function StatCard({
  icon: Icon,
  label,
  value,
  active,
  accent,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  active: boolean;
  accent?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border bg-card p-4 flex items-start gap-3 text-start transition-all',
        'hover:border-primary/60 hover:shadow-sm',
        active && 'border-primary ring-1 ring-primary',
      )}
    >
      <div className="rounded-lg bg-muted p-2 shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className={cn('mt-0.5 text-xl font-bold', accent)}>{value}</div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Inline status control                                               */
/* ------------------------------------------------------------------ */

function StatusControl({
  status,
  onChange,
}: {
  status: TaskStatus;
  onChange: (next: TaskStatus) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const s = STATUS_STYLE[status];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
            'hover:bg-muted transition-colors',
            s.text,
          )}
        >
          <span className={cn('h-2 w-2 rounded-full', s.dot)} />
          {status}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-40 p-1"
        onClick={(e) => e.stopPropagation()}
      >
        {taskStatuses.map((option) => {
          const os = STATUS_STYLE[option];
          return (
            <button
              key={option}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                if (option !== status) onChange(option);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted',
                option === status && 'bg-muted',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', os.dot)} />
              {option}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Row                                                                 */
/* ------------------------------------------------------------------ */

function TaskRow({
  task,
  projectName,
  projectColor,
  clientName,
  assignees,
  overdue,
  showProject,
  onOpen,
  onStatusChange,
}: {
  task: Task;
  projectName?: string;
  projectColor?: string;
  clientName?: string;
  assignees: User[];
  overdue: boolean;
  showProject: boolean;
  onOpen: () => void;
  onStatusChange: (next: TaskStatus) => void;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  return (
    <div
      onClick={onOpen}
      className="group flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
    >
      <span
        className={cn('h-2.5 w-2.5 rounded-full shrink-0', PRIORITY_DOT[task.priority])}
        title={task.priority}
      />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'flex items-center gap-1.5 truncate text-sm font-medium',
            task.status === 'Done' && 'text-muted-foreground line-through',
          )}
        >
          {task.isPrivate && (
            <Lock
              className="h-3 w-3 shrink-0 text-muted-foreground"
              aria-label={tr('Private', 'خاصة')}
            />
          )}
          <span className="truncate">{task.title}</span>
        </div>
        {showProject && (
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {projectName ? (
              <>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: task.color || projectColor }}
                />
                <span className="truncate">{projectName}</span>
              </>
            ) : (
              <span>{tr('No project', 'بدون مشروع')}</span>
            )}
            {clientName && (
              <>
                <span className="opacity-40">·</span>
                <span className="truncate">{clientName}</span>
              </>
            )}
          </div>
        )}
      </div>

      {task.dueDate && (
        <div
          className={cn(
            'hidden sm:flex items-center gap-1 text-xs shrink-0',
            overdue ? 'text-red-600 font-medium' : 'text-muted-foreground',
          )}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          {format(new Date(task.dueDate), 'MMM d')}
        </div>
      )}

      {assignees.length > 0 && (
        <div className="hidden sm:flex items-center -space-x-2 rtl:space-x-reverse shrink-0">
          {assignees.slice(0, 3).map((user) => (
            <Avatar key={user.id} className="h-6 w-6 border-2 border-background">
              <AvatarImage src={user.avatar} />
              <AvatarFallback className="text-[10px]">
                {user.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
          ))}
          {assignees.length > 3 && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium">
              +{assignees.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <StatusControl status={task.status} onChange={onStatusChange} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Group                                                               */
/* ------------------------------------------------------------------ */

function TaskGroup({
  label,
  accent,
  tasks,
  defaultOpen,
  children,
}: {
  label: string;
  accent?: string;
  tasks: Task[];
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  if (tasks.length === 0) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-card">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-semibold">
        <ChevronRight
          className={cn('h-4 w-4 transition-transform text-muted-foreground', open && 'rotate-90')}
        />
        <span className={accent}>{label}</span>
        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {tasks.length}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="divide-y border-t">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

type Scope = 'mine' | 'all' | 'unassigned';

export function TaskList({ projectId }: { projectId?: string }) {
  const { selectedCompany, projects, currentRole, currentUser } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const selectedCompanyId = selectedCompany?.id;
  const currentUserId = currentUser?.id;

  const tr = React.useCallback(
    (en: string, ar: string) => (language === 'ar' ? ar : en),
    [language],
  );

  // Stable refs so the data loader does not re-fire on every render.
  const toastRef = React.useRef(toast);
  const trRef = React.useRef(tr);
  React.useEffect(() => {
    toastRef.current = toast;
    trRef.current = tr;
  }, [toast, tr]);

  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<StatFilter>('all');
  const [scope, setScope] = React.useState<Scope>('mine');
  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);

  // Default to "My tasks" but remember the last choice per user + view.
  const scopeStorageKey = currentUserId
    ? `task-scope:${currentUserId}:${projectId ?? 'all'}`
    : null;
  React.useEffect(() => {
    if (!scopeStorageKey) return;
    try {
      const stored = localStorage.getItem(scopeStorageKey) as Scope | null;
      setScope(stored && ['mine', 'all', 'unassigned'].includes(stored) ? stored : 'mine');
    } catch {
      setScope('mine');
    }
  }, [scopeStorageKey]);
  const changeScope = React.useCallback(
    (next: Scope) => {
      setScope(next);
      if (scopeStorageKey) {
        try {
          localStorage.setItem(scopeStorageKey, next);
        } catch {}
      }
    },
    [scopeStorageKey],
  );

  const loadData = React.useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    try {
      const canLoadCompanyReferences = currentRole && currentRole !== 'Employee';
      const [tasksData, usersData, clientData] = await Promise.all([
        getTasks(),
        canLoadCompanyReferences
          ? getUsersByCompany(selectedCompanyId)
          : Promise.resolve([]),
        canLoadCompanyReferences
          ? getClients(selectedCompanyId)
          : Promise.resolve([]),
      ]);
      setTasks(tasksData);
      setUsers(usersData);
      setClients(clientData);
    } catch (error: any) {
      console.error('Failed to load tasks', error);
      setTasks([]);
      setUsers([]);
      setClients([]);
      toastRef.current({
        variant: 'destructive',
        title: trRef.current('Error', 'خطأ'),
        description:
          error?.message ||
          trRef.current('Could not load tasks.', 'تعذر تحميل المهام.'),
      });
    } finally {
      setLoading(false);
    }
  }, [currentRole, selectedCompanyId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Company / project scoped.
  const scopedTasks = React.useMemo(
    () =>
      tasks.filter((t) =>
        projectId ? t.projectId === projectId : t.companyId === selectedCompanyId,
      ),
    [tasks, projectId, selectedCompanyId],
  );

  const todayStart = React.useMemo(() => startOfDay(new Date()), []);

  // "My tasks" / "Unassigned" / "All" — reduces clutter without changing what
  // the server already scoped the user to.
  const scopeFiltered = React.useMemo(() => {
    return scopedTasks.filter((t) => {
      if (scope === 'all') return true;
      const assignees = t.assignedUserIds ?? [];
      if (scope === 'unassigned') return assignees.length === 0;
      return currentUserId ? assignees.includes(currentUserId) : false;
    });
  }, [scopedTasks, scope, currentUserId]);

  const counts = React.useMemo(() => {
    let todo = 0,
      inProgress = 0,
      done = 0,
      overdue = 0;
    for (const t of scopeFiltered) {
      if (t.status === 'To Do') todo++;
      else if (t.status === 'In Progress') inProgress++;
      else if (t.status === 'Done') done++;
      if (t.dueDate && startOfDay(new Date(t.dueDate)) < todayStart && t.status !== 'Done')
        overdue++;
    }
    return { todo, inProgress, done, overdue };
  }, [scopeFiltered, todayStart]);

  const filteredTasks = React.useMemo(() => {
    return scopeFiltered.filter((t) => {
      if (filter === 'all') return true;
      if (filter === 'overdue')
        return t.dueDate && startOfDay(new Date(t.dueDate)) < todayStart && t.status !== 'Done';
      return t.status === filter;
    });
  }, [scopeFiltered, filter, todayStart]);

  const grouped = React.useMemo(() => {
    const buckets: Record<BucketKey, Task[]> = {
      overdue: [],
      today: [],
      week: [],
      later: [],
      none: [],
      done: [],
    };
    for (const t of filteredTasks) buckets[bucketFor(t, todayStart)].push(t);
    // Sort each active bucket by due date then priority weight.
    const prioWeight: Record<Task['priority'], number> = { High: 0, Medium: 1, Low: 2 };
    for (const key of Object.keys(buckets) as BucketKey[]) {
      buckets[key].sort((a, b) => {
        const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        if (ad !== bd) return ad - bd;
        return prioWeight[a.priority] - prioWeight[b.priority];
      });
    }
    return buckets;
  }, [filteredTasks, todayStart]);

  const handleStatusChange = React.useCallback(
    async (task: Task, next: TaskStatus) => {
      // Optimistic.
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
      );
      try {
        await updateTask(task.id, { status: next });
      } catch (error: any) {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)),
        );
        toastRef.current({
          variant: 'destructive',
          title: trRef.current('Error', 'خطأ'),
          description: trRef.current('Could not update status.', 'تعذر تحديث الحالة.'),
        });
      }
    },
    [],
  );

  const renderRow = (task: Task) => {
    const project = projects.find((p) => p.id === task.projectId);
    const client = clients.find((c) => c.id === project?.clientId);
    const assignees = users.filter((u) => task.assignedUserIds?.includes(u.id));
    const overdue =
      !!task.dueDate &&
      startOfDay(new Date(task.dueDate)) < todayStart &&
      task.status !== 'Done';
    return (
      <TaskRow
        key={task.id}
        task={task}
        projectName={project?.name}
        projectColor={project?.color}
        clientName={client?.name}
        assignees={assignees}
        overdue={overdue}
        showProject={!projectId}
        onOpen={() => setSelectedTask(task)}
        onStatusChange={(next) => handleStatusChange(task, next)}
      />
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[74px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const groupsMeta: {
    key: BucketKey;
    label: string;
    accent?: string;
    defaultOpen: boolean;
  }[] = [
    { key: 'overdue', label: tr('Overdue', 'متأخرة'), accent: 'text-red-600', defaultOpen: true },
    { key: 'today', label: tr('Today', 'اليوم'), accent: 'text-foreground', defaultOpen: true },
    { key: 'week', label: tr('This week', 'هذا الأسبوع'), defaultOpen: true },
    { key: 'later', label: tr('Later', 'لاحقاً'), defaultOpen: false },
    { key: 'none', label: tr('No due date', 'بدون تاريخ'), defaultOpen: false },
    { key: 'done', label: tr('Completed', 'مكتملة'), accent: 'text-emerald-600', defaultOpen: false },
  ];

  const total = filteredTasks.length;

  return (
    <div className="flex flex-col gap-5">
      {/* Scope: My tasks / All / Unassigned */}
      <div className="flex items-center gap-1 self-start rounded-lg border bg-card p-1 text-sm">
        {(['mine', 'all', 'unassigned'] as Scope[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => changeScope(s)}
            className={cn(
              'rounded-md px-3 py-1 font-medium transition-colors',
              scope === s
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {s === 'mine'
              ? tr('My tasks', 'مهامي')
              : s === 'all'
                ? tr('All tasks', 'كل المهام')
                : tr('Unassigned', 'غير مُسندة')}
          </button>
        ))}
      </div>

      {/* Clickable stats / filters */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={ListTodo}
          label={tr('To Do', 'قيد الانتظار')}
          value={counts.todo}
          active={filter === 'To Do'}
          onClick={() => setFilter((f) => (f === 'To Do' ? 'all' : 'To Do'))}
        />
        <StatCard
          icon={TrendingUp}
          label={tr('In Progress', 'قيد التنفيذ')}
          value={counts.inProgress}
          accent="text-blue-600"
          active={filter === 'In Progress'}
          onClick={() => setFilter((f) => (f === 'In Progress' ? 'all' : 'In Progress'))}
        />
        <StatCard
          icon={CheckSquare}
          label={tr('Done', 'مكتملة')}
          value={counts.done}
          accent="text-emerald-600"
          active={filter === 'Done'}
          onClick={() => setFilter((f) => (f === 'Done' ? 'all' : 'Done'))}
        />
        <StatCard
          icon={AlertCircle}
          label={tr('Overdue', 'متأخرة')}
          value={counts.overdue}
          accent={counts.overdue > 0 ? 'text-red-600' : undefined}
          active={filter === 'overdue'}
          onClick={() => setFilter((f) => (f === 'overdue' ? 'all' : 'overdue'))}
        />
      </div>

      {filter !== 'all' && (
        <button
          type="button"
          onClick={() => setFilter('all')}
          className="self-start text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {tr('Clear filter', 'مسح التصفية')}
        </button>
      )}

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {tr('No tasks to show.', 'لا توجد مهام لعرضها.')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groupsMeta.map((g) => (
            <TaskGroup
              key={g.key}
              label={g.label}
              accent={g.accent}
              tasks={grouped[g.key]}
              defaultOpen={g.defaultOpen}
            >
              {grouped[g.key].map(renderRow)}
            </TaskGroup>
          ))}
        </div>
      )}

      {selectedTask && (
        <TaskDetailsSheet
          open={!!selectedTask}
          onOpenChange={(open) => {
            if (!open) setSelectedTask(null);
          }}
          onTaskUpdate={() => {
            setSelectedTask(null);
            loadData();
          }}
          task={selectedTask}
        />
      )}
    </div>
  );
}
