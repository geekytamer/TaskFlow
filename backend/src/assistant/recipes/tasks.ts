import type { Recipe, RecipeContext } from './types';
import { addDays, argsOf, dateArg, dayOf, memberId, oneOf, pickOne, say } from './util';

const STATUSES = ['To Do', 'In Progress', 'Waiting', 'In Review', 'Done'] as const;
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;

interface TaskRow { id: string; title: string; status: string; priority: string; dueDate?: string | null; assignedUserIds?: string[]; projectId?: string }

const listTasks = (ctx: RecipeContext) => ctx.get<TaskRow[]>(`/tasks?companyId=${encodeURIComponent(ctx.companyId)}`);
const findTask = async (ctx: RecipeContext, ref: unknown) => pickOne(await listTasks(ctx), ref, (t) => t.title, 'task');

const view = (ctx: RecipeContext, t: TaskRow) => ({
  id: t.id,
  title: t.title,
  status: t.status,
  priority: t.priority,
  ...(dayOf(t.dueDate) ? { dueDate: dayOf(t.dueDate) } : {}),
  ...(t.projectId && ctx.names.project(t.projectId) ? { project: ctx.names.project(t.projectId) } : {}),
  assignees: (t.assignedUserIds ?? []).map((id) => ctx.names.user(id) ?? id),
});

export const myTasks: Recipe = {
  name: 'myTasks',
  signature: "myTasks({ status?: 'open'|'done'|'all', due?: 'overdue'|'today'|'week', everyone?: true })",
  returns: "tasks [{ id, title, status, priority, dueDate, project, assignees }]: the person's own (everyone: true for all they can see), open by default, soonest first",
  words: ['task', 'tasks', 'todo', 'overdue', 'due', 'week', 'today', 'work', 'late'],
  async run(ctx, args) {
    const a = argsOf(args);
    const status = String(a.status ?? 'open');
    if (!['open', 'done', 'all'].includes(status)) throw new Error("status must be 'open', 'done' or 'all'");
    const due = a.due === undefined ? undefined : String(a.due);
    if (due !== undefined && !['overdue', 'today', 'week'].includes(due)) throw new Error("due must be 'overdue', 'today' or 'week'");
    const weekEnd = addDays(ctx.today, 7);
    return (await listTasks(ctx))
      .filter((t) => a.everyone === true || (t.assignedUserIds ?? []).includes(ctx.userId))
      .filter((t) => status === 'all' || (status === 'done' ? t.status === 'Done' : t.status !== 'Done'))
      .filter((t) => {
        if (!due) return true;
        const d = dayOf(t.dueDate);
        if (!d) return false;
        if (due === 'overdue') return d < ctx.today && t.status !== 'Done';
        if (due === 'today') return d === ctx.today;
        return d >= ctx.today && d <= weekEnd;
      })
      .sort((x, y) => (dayOf(x.dueDate) ?? '9999').localeCompare(dayOf(y.dueDate) ?? '9999'))
      .map((t) => view(ctx, t));
  },
};

export const createTasks: Recipe = {
  name: 'createTasks',
  signature: "createTasks([{ title, dueDate?: 'YYYY-MM-DD'|'today'|'tomorrow', priority?: 'Low'|'Medium'|'High'|'Urgent', status?: 'To Do'|'In Progress'|'Done', assignTo?: name|'me', description? }])",
  returns: 'one proposal per task, confirmed together; assigned to the person unless assignTo; status Done without a date means today',
  words: ['create', 'add', 'new', 'task', 'remind', 'record', 'done', 'todo'],
  changes: true,
  async run(ctx, args) {
    const a = argsOf(args);
    const list = (Array.isArray(a.list) ? a.list : Array.isArray(a.tasks) ? a.tasks : [a]) as unknown[];
    const out: unknown[] = [];
    for (const item of list) {
      const t = typeof item === 'string' ? { title: item } : argsOf(item);
      const title = String(t.title ?? t.text ?? '').trim();
      if (!title) throw new Error('each task needs a title');
      const status = oneOf(t.status, STATUSES, 'status');
      const dueDate = dateArg(ctx, t.dueDate ?? t.due, 'dueDate') ?? (status === 'Done' ? ctx.today : undefined);
      const priority = oneOf(t.priority, PRIORITIES, 'priority') ?? 'Medium';
      const assignee = t.assignTo ? await memberId(ctx, t.assignTo) : ctx.userId;
      const body = {
        title, companyId: ctx.companyId, priority, assignedUserIds: [assignee],
        ...(dueDate ? { dueDate } : {}), ...(status ? { status } : {}),
        ...(t.description ? { description: String(t.description) } : {}),
        ...(t.projectId ? { projectId: String(t.projectId) } : {}),
      };
      const summary = status === 'Done'
        ? say(ctx, `Record the done task: ${title}`, `تسجيل مهمة منجزة: ${title}`)
        : say(ctx, `Create the task: ${title}${dueDate ? `, due ${dueDate}` : ''}`, `إنشاء مهمة: ${title}${dueDate ? `، موعدها ${dueDate}` : ''}`);
      out.push(await ctx.propose('POST', '/tasks', body, summary));
    }
    return out;
  },
};

export const updateTask: Recipe = {
  name: 'updateTask',
  signature: "updateTask({ task: title|id, status?, priority?, dueDate?, assignTo?: name|'me', newTitle? })",
  returns: 'one proposal with only the fields that change',
  words: ['update', 'change', 'assign', 'complete', 'finish', 'done', 'status', 'priority', 'postpone', 'reschedule', 'rename', 'task'],
  changes: true,
  async run(ctx, args) {
    const a = argsOf(args);
    const task = await findTask(ctx, a.task ?? a.title ?? a.text);
    const body: Record<string, unknown> = {};
    const status = oneOf(a.status, STATUSES, 'status');
    if (status) body.status = status;
    const priority = oneOf(a.priority, PRIORITIES, 'priority');
    if (priority) body.priority = priority;
    const dueDate = dateArg(ctx, a.dueDate ?? a.due, 'dueDate');
    if (dueDate) body.dueDate = dueDate;
    if (a.assignTo) body.assignedUserIds = [await memberId(ctx, a.assignTo)];
    if (typeof a.newTitle === 'string' && a.newTitle.trim()) body.title = a.newTitle.trim();
    if (!Object.keys(body).length) throw new Error('say what to change: status, priority, dueDate, assignTo or newTitle');
    const what = Object.entries(body)
      .map(([k, v]) => (k === 'assignedUserIds' ? `${say(ctx, 'assign to', 'إسناد إلى')} ${ctx.names.user((v as string[])[0]) ?? (v as string[])[0]}` : `${k} ${String(v)}`))
      .join(', ');
    return ctx.propose('PUT', `/tasks/${encodeURIComponent(task.id)}`, body, say(ctx, `Update "${task.title}": ${what}`, `تعديل "${task.title}": ${what}`));
  },
};

export const logTime: Recipe = {
  name: 'logTime',
  signature: "logTime({ task: title|id, hours, date?: 'YYYY-MM-DD'|'today', note? })",
  returns: 'one proposal logging the time on that task',
  words: ['time', 'hours', 'log', 'spent', 'timesheet', 'worked'],
  changes: true,
  async run(ctx, args) {
    const a = argsOf(args);
    const task = await findTask(ctx, a.task ?? a.title ?? a.text);
    const hours = Number(a.hours);
    if (!(hours > 0) || hours > 24) throw new Error('hours must be a number above 0 and at most 24');
    const spentOn = dateArg(ctx, a.date ?? 'today', 'date') as string;
    return ctx.propose(
      'POST', `/tasks/${encodeURIComponent(task.id)}/time-entries`,
      { hours, spentOn, ...(a.note ? { note: String(a.note) } : {}) },
      say(ctx, `Log ${hours} h on "${task.title}" for ${spentOn}`, `تسجيل ${hours} ساعة على "${task.title}" بتاريخ ${spentOn}`),
    );
  },
};
