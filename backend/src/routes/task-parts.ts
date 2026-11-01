import type { Express } from 'express';
import { HttpError, getEffectiveRole } from '../http';
import { PART_STATUSES, type PartStatus } from '../tasks/task-parts';
import { asRecord, enumValue } from '../validation';
import type { RouteContext } from './context';
import { handler } from './shared';

/**
 * PATCH /tasks/:id/parts/:userId — one person's part of a shared task.
 * The person finishes their own part; whoever runs the task (its creator, or
 * a company Admin or Manager) may change any part and name what each part is.
 */
export function registerTaskPartRoutes(app: Express, ctx: Pick<RouteContext, 'store' | 'authMiddleware' | 'requireCompanyAccess' | 'canViewTask' | 'withActor'>) {
  const { store, authMiddleware, requireCompanyAccess, canViewTask, withActor } = ctx;

  app.patch('/tasks/:id/parts/:userId', authMiddleware, handler((req, res) => {
    const task = store.getTaskById(req.params.id);
    if (!task) throw new HttpError(404, 'Task not found.');
    requireCompanyAccess(req, task.companyId);
    if (!canViewTask(req, task)) throw new HttpError(404, 'Task not found.');
    const partOwner = req.params.userId;
    if (!task.parts?.some((p) => p.userId === partOwner)) throw new HttpError(404, 'This person has no part in the task.');

    const me = req.user!;
    const role = getEffectiveRole(me, task.companyId);
    const runsTask = me.isSuperAdmin || task.ownerId === me.id || role === 'Admin' || role === 'Manager';
    const body = asRecord(req.body, 'body');
    const status = body.status !== undefined ? (enumValue(body.status, 'status', PART_STATUSES) as PartStatus) : undefined;
    let label: string | null | undefined;
    if (body.label !== undefined) {
      label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 80) : null;
    }
    if (status !== undefined && partOwner !== me.id && !runsTask) {
      throw new HttpError(403, 'Only this person, or whoever runs the task, can change their part.');
    }
    if (label !== undefined && !runsTask) throw new HttpError(403, 'Only whoever runs the task names its parts.');

    const updated = withActor(req, () => store.setTaskPart(task.id, partOwner, { status, label }));
    res.json(updated);
  }));
}
