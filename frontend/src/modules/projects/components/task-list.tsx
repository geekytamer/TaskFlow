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
  CheckCircle2,
  ListChecks,
  Repeat,
} from 'lucide-react';
import { useCompany } from '@/context/company-context';
import { usePermissionOr } from '@/context/permissions-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { getTasks, updateTask, updateTaskPart } from '@/services/projectService';
import { PRIORITY_DOT, PRIORITY_WEIGHT, STATUS_STYLE, myPart, partsProgress, recurrenceName, statusFor, statusName } from '@/modules/projects/lib/task-meta';
import { getCompanyPeople, type PersonSummary } from '@/services/userService';
import { getClients } from '@/services/financeService';
import {
  partStatuses,
  taskStatuses,
  type PartStatus,
  type Task,
  type TaskStatus,
} from '@/modules/projects/types';
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
import { useLiveRefresh } from '@/lib/live';

/* ------------------------------------------------------------------ */
/* Design tokens                                                       */
/* ------------------------------------------------------------------ */


type StatFilter = 'all' | TaskStatus | 'overdue';

/** Time-horizon triage bucket, Asana "My Tasks" style. */
type BucketKey = 'overdue' | 'today' | 'week' | 'later' | 'none' | 'done';

function bucketFor(task: Task, status: TaskStatus, todayStart: Date): BucketKey {
  if (status === 'Done') return 'done';
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
  options = taskStatuses,
  title,
}: {
  status: TaskStatus;
  onChange: (next: TaskStatus) => void;
  /** A person's own part offers fewer states than the whole task. */
  options?: readonly TaskStatus[];
  title?: string;
}) {
  const { language } = useI18n();
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
          {title ? `${title}: ` : ''}{statusName(status, language)}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-40 p-1"
        onClick={(e) => e.stopPropagation()}
      >
        {options.map((option) => {
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
              {statusName(option, language)}
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
  viewStatus,
  ownPart,
}: {
  task: Task;
  /** What this person sees: their own part's state on a shared task. */
  viewStatus: TaskStatus;
  /** True when the status control changes this person's own part. */
  ownPart: boolean;
  projectName?: string;
  projectColor?: string;
  clientName?: string;
  assignees: PersonSummary[];
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
            viewStatus === 'Done' && 'text-muted-foreground line-through',
          )}
        >
          {task.isPrivate && (
            <Lock
              className="h-3 w-3 shrink-0 text-muted-foreground"
              aria-label={tr('Private', 'خاصة')}
            />
          )}
          <span className="truncate">{task.title}</span>
          {(task.parts?.length ?? 0) > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground no-underline"
              title={tr('Parts finished', 'الأجزاء المنجزة')}
            >
              <CheckCircle2 className="h-3 w-3" />
              {partsProgress(task).done}/{partsProgress(task).total}
            </span>
          )}
          {task.recurrence && (
            <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" aria-label={recurrenceName(task.recurrence, language)} />
          )}
          {(task.checklist?.total ?? 0) > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground no-underline"
              title={tr('Checklist', 'قائمة التحقق')}
            >
              <ListChecks className="h-3 w-3" />
              {task.checklist!.done}/{task.checklist!.total}
            </span>
          )}
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
            overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground',
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
        <StatusControl
          status={viewStatus}
          onChange={onStatusChange}
          options={ownPart ? partStatuses : taskStatuses}
          title={ownPart ? tr('My part', 'جزئي') : undefined}
        />
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

// 'today' is My Day: my open work that is overdue, due today, already started, or urgent.
type Scope = 'today' | 'mine' | 'all' | 'unassigned';

export function TaskList({ projectId }: { projectId?: string }) {
  const { selectedCompany, projects, currentRole, currentUser } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const selectedCompanyId = selectedCompany?.id;
  const managementFallback = Boolean(currentRole && currentRole !== 'Employee');
  const canLoadClients = usePermissionOr('contacts', 'clients.read', managementFallback);
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
  const [users, setUsers] = React.useState<PersonSummary[]>([]);
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
      setScope(stored && ['today', 'mine', 'all', 'unassigned'].includes(stored) ? stored : 'mine');
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

  const loadData = React.useCallback(async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true;
    if (!selectedCompanyId) return;
    if (!quiet) setLoading(true);
    try {
      const [tasksData, usersData, clientData] = await Promise.all([
        getTasks(),
        getCompanyPeople(selectedCompanyId).catch(() => []),
        canLoadClients
          ? getClients(selectedCompanyId)
          : Promise.resolve([]),
      ]);
      setTasks(tasksData);
      setUsers(usersData);
      setClients(clientData);
    } catch (error: any) {
      if (quiet) return;
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
  }, [currentRole, selectedCompanyId, canLoadClients]);

  // Colleagues' changes show up without reloading.
  useLiveRefresh(['tasks', 'projects', 'time-entries', 'comments'], () => loadData({ quiet: true }));

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
      if (!currentUserId || !assignees.includes(currentUserId)) return false;
      if (scope === 'mine') return true;
      const status = statusFor(t, currentUserId);
      if (status === 'Done') return false;
      const dueSoon = t.dueDate && startOfDay(new Date(t.dueDate)) <= todayStart;
      return Boolean(dueSoon) || status !== 'To Do' || t.priority === 'Urgent';
    });
  }, [scopedTasks, scope, currentUserId, todayStart]);

  const personal = scope === 'mine' || scope === 'today';

  // In "My tasks" a shared task shows this person's own part; elsewhere the whole task.
  const viewStatus = React.useCallback(
    (t: Task) => (personal ? statusFor(t, currentUserId) : t.status),
    [personal, currentUserId],
  );

  const counts = React.useMemo(() => {
    let todo = 0,
      inProgress = 0,
      done = 0,
      overdue = 0;
    for (const t of scopeFiltered) {
      const status = viewStatus(t);
      if (status === 'To Do') todo++;
      else if (status === 'Done') done++;
      else inProgress++;
      if (t.dueDate && startOfDay(new Date(t.dueDate)) < todayStart && status !== 'Done')
        overdue++;
    }
    return { todo, inProgress, done, overdue };
  }, [scopeFiltered, todayStart, viewStatus]);

  const filteredTasks = React.useMemo(() => {
    return scopeFiltered.filter((t) => {
      const status = viewStatus(t);
      if (filter === 'all') return true;
      if (filter === 'overdue')
        return t.dueDate && startOfDay(new Date(t.dueDate)) < todayStart && status !== 'Done';
      // The "In Progress" card also covers Waiting and In Review.
      if (filter === 'In Progress') return status !== 'To Do' && status !== 'Done';
      return status === filter;
    });
  }, [scopeFiltered, filter, todayStart, viewStatus]);

  const grouped = React.useMemo(() => {
    const buckets: Record<BucketKey, Task[]> = {
      overdue: [],
      today: [],
      week: [],
      later: [],
      none: [],
      done: [],
    };
    for (const t of filteredTasks) buckets[bucketFor(t, viewStatus(t), todayStart)].push(t);
    // Sort each active bucket by due date then priority weight.
    const prioWeight = PRIORITY_WEIGHT;
    for (const key of Object.keys(buckets) as BucketKey[]) {
      buckets[key].sort((a, b) => {
        const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        if (ad !== bd) return ad - bd;
        return prioWeight[a.priority] - prioWeight[b.priority];
      });
    }
    return buckets;
  }, [filteredTasks, todayStart, viewStatus]);

  const handleStatusChange = React.useCallback(
    async (task: Task, next: TaskStatus, ownPart: boolean) => {
      // On a shared task, this person moves their own part; the task follows on the server.
      if (ownPart && currentUserId) {
        try {
          const saved = await updateTaskPart(task.id, currentUserId, { status: next as PartStatus });
          setTasks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
        } catch {
          toastRef.current({
            variant: 'destructive',
            title: trRef.current('Error', 'خطأ'),
            description: trRef.current('Could not update your part.', 'تعذر تحديث جزئك.'),
          });
        }
        return;
      }
      // Optimistic.
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
      );
      try {
        const saved = await updateTask(task.id, { status: next });
        setTasks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      } catch {
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
    [currentUserId],
  );

  const renderRow = (task: Task) => {
    const project = projects.find((p) => p.id === task.projectId);
    const client = clients.find((c) => c.id === project?.clientId);
    const assignees = users.filter((u) => task.assignedUserIds?.includes(u.id));
    const status = viewStatus(task);
    const ownPart = personal && !!myPart(task, currentUserId);
    const overdue =
      !!task.dueDate &&
      startOfDay(new Date(task.dueDate)) < todayStart &&
      status !== 'Done';
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
        onStatusChange={(next) => handleStatusChange(task, next, ownPart)}
        viewStatus={status}
        ownPart={ownPart}
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
    { key: 'overdue', label: tr('Overdue', 'متأخرة'), accent: 'text-red-600 dark:text-red-400', defaultOpen: true },
    { key: 'today', label: tr('Today', 'اليوم'), accent: 'text-foreground', defaultOpen: true },
    { key: 'week', label: tr('This week', 'هذا الأسبوع'), defaultOpen: true },
    { key: 'later', label: tr('Later', 'لاحقاً'), defaultOpen: false },
    { key: 'none', label: tr('No due date', 'بدون تاريخ'), defaultOpen: false },
    { key: 'done', label: tr('Completed', 'مكتملة'), accent: 'text-emerald-600 dark:text-emerald-400', defaultOpen: false },
  ];

  const total = filteredTasks.length;

  return (
    <div className="flex flex-col gap-5">
      {/* Scope: My tasks / All / Unassigned */}
      <div className="flex items-center gap-1 self-start rounded-lg border bg-card p-1 text-sm">
        {(['today', 'mine', 'all', 'unassigned'] as Scope[]).map((s) => (
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
            {s === 'today'
              ? tr('My Day', 'يومي')
              : s === 'mine'
              ? tr('My tasks', 'مهامي')
              : s === 'all'
                ? tr('All tasks', 'كل المهام')
                : tr('Unassigned', 'غير مُسندة')}
          </button>
        ))}
      </div>

      {/* Clickable stats / filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          accent="text-blue-600 dark:text-blue-400"
          active={filter === 'In Progress'}
          onClick={() => setFilter((f) => (f === 'In Progress' ? 'all' : 'In Progress'))}
        />
        <StatCard
          icon={CheckSquare}
          label={tr('Done', 'مكتملة')}
          value={counts.done}
          accent="text-emerald-600 dark:text-emerald-400"
          active={filter === 'Done'}
          onClick={() => setFilter((f) => (f === 'Done' ? 'all' : 'Done'))}
        />
        <StatCard
          icon={AlertCircle}
          label={tr('Overdue', 'متأخرة')}
          value={counts.overdue}
          accent={counts.overdue > 0 ? 'text-red-600 dark:text-red-400' : undefined}
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
            {scope === 'today'
              ? tr('Nothing due today. Nice.', 'لا شيء مستحق اليوم. أحسنت.')
              : tr('No tasks to show.', 'لا توجد مهام لعرضها.')}
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
