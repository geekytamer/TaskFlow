import type { Express } from 'express';
import { HttpError } from '../http';
import { MAX_CHECKLIST_TEXT } from '../tasks/task-checklist';
import { asRecord } from '../validation';
import type { RouteContext } from './context';
import { handler, type AuthedRequest } from './shared';

/** A task's checklist: anyone who can see the task can read, add, tick and tidy it. */
export function registerTaskChecklistRoutes(app: Express, ctx: Pick<RouteContext, 'store' | 'authMiddleware' | 'requireCompanyAccess' | 'canViewTask'>) {
  const { store, authMiddleware, requireCompanyAccess, canViewTask } = ctx;

  const visibleTask = (req: AuthedRequest, id: string) => {
    const task = store.getTaskById(id);
    if (!task) throw new HttpError(404, 'Task not found.');
    requireCompanyAccess(req, task.companyId);
    if (!canViewTask(req, task)) throw new HttpError(404, 'Task not found.');
    return task;
  };
  const text = (value: unknown) => {
    const t = typeof value === 'string' ? value.trim() : '';
    if (!t) throw new HttpError(400, 'Write the step first.');
    return t.slice(0, MAX_CHECKLIST_TEXT);
  };
  const ownItem = (taskId: string, itemId: string) => {
    const item = store.taskChecklist.get(itemId);
    if (!item || item.taskId !== taskId) throw new HttpError(404, 'Checklist item not found.');
    return item;
  };

  // Each route checks company access inline as well, so the permission map sees it.
  app.get('/tasks/:id/checklist', authMiddleware, handler((req, res) => {
    const task = store.getTaskById(req.params.id);
    if (task) requireCompanyAccess(req, task.companyId);
    res.json(store.taskChecklist.forTask(visibleTask(req, req.params.id).id));
  }));

  app.post('/tasks/:id/checklist', authMiddleware, handler((req, res) => {
    const task = store.getTaskById(req.params.id);
    if (task) requireCompanyAccess(req, task.companyId);
    const visible = visibleTask(req, req.params.id);
    res.status(201).json(store.taskChecklist.add(visible.id, text(asRecord(req.body, 'body').text), req.user!.id));
  }));

  app.patch('/tasks/:id/checklist/:itemId', authMiddleware, handler((req, res) => {
    const task = store.getTaskById(req.params.id);
    if (task) requireCompanyAccess(req, task.companyId);
    const visible = visibleTask(req, req.params.id);
    ownItem(visible.id, req.params.itemId);
    const body = asRecord(req.body, 'body');
    res.json(store.taskChecklist.update(req.params.itemId, {
      text: body.text !== undefined ? text(body.text) : undefined,
      done: body.done !== undefined ? body.done === true : undefined,
    }, req.user!.id));
  }));

  app.delete('/tasks/:id/checklist/:itemId', authMiddleware, handler((req, res) => {
    const task = store.getTaskById(req.params.id);
    if (task) requireCompanyAccess(req, task.companyId);
    const visible = visibleTask(req, req.params.id);
    ownItem(visible.id, req.params.itemId);
    store.taskChecklist.remove(req.params.itemId);
    res.json({ success: true });
  }));
}
