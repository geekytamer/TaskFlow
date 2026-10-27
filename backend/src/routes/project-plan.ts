import type { Express } from 'express';
import { HttpError } from '../http';
import { MAX_MILESTONE_NAME } from '../projects/project-plan';
import { asRecord, optionalDateInput, optionalString } from '../validation';
import type { RouteContext } from './context';
import { handler, type AuthedRequest } from './shared';

/**
 * A project's plan: stages (milestones), a summary with progress and budget,
 * and templates. Anyone who can see the project reads its stages and progress;
 * admins and managers change them, and see the money.
 */
export function registerProjectPlanRoutes(
  app: Express,
  ctx: Pick<RouteContext, 'store' | 'authMiddleware' | 'requireCompanyAccess' | 'requireCompanyRoles' | 'canViewProject' | 'canViewTask' | 'ensureClientBelongsToCompany' | 'withActor'>,
) {
  const { store, authMiddleware, requireCompanyAccess, requireCompanyRoles, canViewProject, canViewTask, ensureClientBelongsToCompany, withActor } = ctx;

  const visibleProject = (req: AuthedRequest, id: string) => {
    const project = store.getProjectById(id);
    if (!project) throw new HttpError(404, 'Project not found.');
    requireCompanyAccess(req, project.companyId);
    if (!canViewProject(req, project)) throw new HttpError(404, 'Project not found.');
    return project;
  };
  const managedProject = (req: AuthedRequest, id: string) => {
    const project = visibleProject(req, id);
    requireCompanyRoles(req, project.companyId, ['Admin', 'Manager']);
    return project;
  };
  const seesMoney = (req: AuthedRequest, companyId: string) => {
    try {
      requireCompanyRoles(req, companyId, ['Admin', 'Manager', 'Accountant']);
      return true;
    } catch {
      return false;
    }
  };
  const name = (value: unknown, what: string) => {
    const t = typeof value === 'string' ? value.trim() : '';
    if (!t) throw new HttpError(400, `Give the ${what} a name.`);
    return t.slice(0, MAX_MILESTONE_NAME);
  };
  const stage = (projectId: string, id: string) => {
    const m = store.projectPlan.milestone(id);
    if (!m || m.projectId !== projectId) throw new HttpError(404, 'Stage not found.');
    return m;
  };
  /** Stages with how many of their tasks are done. */
  const stagesWithProgress = (projectId: string) => {
    const tasks = store.listTasks().filter((t) => t.projectId === projectId);
    return store.projectPlan.milestones(projectId).map((m) => {
      const mine = tasks.filter((t) => t.milestoneId === m.id);
      return { ...m, done: mine.filter((t) => t.status === 'Done').length, total: mine.length };
    });
  };

  // Each route checks company access inline as well, so the permission map sees it.
  app.get('/projects/:id/milestones', authMiddleware, handler((req, res) => {
    const found = store.getProjectById(req.params.id);
    if (found) requireCompanyAccess(req, found.companyId);
    res.json(stagesWithProgress(visibleProject(req, req.params.id).id));
  }));

  app.post('/projects/:id/milestones', authMiddleware, handler((req, res) => {
    const found = store.getProjectById(req.params.id);
    if (found) requireCompanyRoles(req, found.companyId, ['Admin', 'Manager']);
    const project = managedProject(req, req.params.id);
    const body = asRecord(req.body, 'body');
    const due = body.dueDate === undefined || body.dueDate === null ? null : optionalDateInput(body.dueDate) ?? null;
    res.status(201).json(withActor(req, () => store.projectPlan.addMilestone(project, name(body.name, 'stage'), due)));
  }));

  app.patch('/projects/:id/milestones/:milestoneId', authMiddleware, handler((req, res) => {
    const found = store.getProjectById(req.params.id);
    if (found) requireCompanyRoles(req, found.companyId, ['Admin', 'Manager']);
    const project = managedProject(req, req.params.id);
    stage(project.id, req.params.milestoneId);
    const body = asRecord(req.body, 'body');
    res.json(store.projectPlan.updateMilestone(req.params.milestoneId, {
      name: body.name !== undefined ? name(body.name, 'stage') : undefined,
      dueDate: body.dueDate === undefined ? undefined : body.dueDate === null || body.dueDate === '' ? null : optionalDateInput(body.dueDate) ?? null,
      position: typeof body.position === 'number' ? body.position : undefined,
    }));
  }));

  app.delete('/projects/:id/milestones/:milestoneId', authMiddleware, handler((req, res) => {
    const found = store.getProjectById(req.params.id);
    if (found) requireCompanyRoles(req, found.companyId, ['Admin', 'Manager']);
    const project = managedProject(req, req.params.id);
    stage(project.id, req.params.milestoneId);
    store.projectPlan.removeMilestone(req.params.milestoneId);
    res.json({ success: true, companyId: project.companyId });
  }));

  /** Progress, stages, lateness and (for those who see money) budget against spend. */
  app.get('/projects/:id/summary', authMiddleware, handler((req, res) => {
    const found = store.getProjectById(req.params.id);
    if (found) requireCompanyAccess(req, found.companyId);
    const project = visibleProject(req, req.params.id);
    const tasks = store.listTasks().filter((t) => t.projectId === project.id);
    const done = tasks.filter((t) => t.status === 'Done').length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const late = Boolean(project.endDate && project.status !== 'Done' && new Date(project.endDate) < today);
    const money = seesMoney(req, project.companyId) && project.budget
      ? (() => {
          const spent = store.projectPlan.spent(project.id);
          return { budget: project.budget, ...spent, pct: Math.round((spent.total / project.budget) * 100) };
        })()
      : null;
    res.json({
      projectId: project.id,
      companyId: project.companyId,
      progress: { done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 },
      overdueTasks: tasks.filter((t) => t.status !== 'Done' && t.dueDate && t.dueDate < today && canViewTask(req, t)).length,
      late,
      milestones: stagesWithProgress(project.id),
      budget: money,
    });
  }));

  app.get('/companies/:companyId/project-templates', authMiddleware, handler((req, res) => {
    requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager']);
    res.json(store.projectPlan.templates(req.params.companyId).map((t) => ({
      id: t.id, companyId: t.companyId, name: t.name, createdAt: t.createdAt,
      tasks: t.body.tasks.length, milestones: t.body.milestones.length, lengthDays: t.body.lengthDays,
    })));
  }));

  app.post('/projects/:id/template', authMiddleware, handler((req, res) => {
    const found = store.getProjectById(req.params.id);
    if (found) requireCompanyRoles(req, found.companyId, ['Admin', 'Manager']);
    const project = managedProject(req, req.params.id);
    const body = asRecord(req.body, 'body');
    const recipe = store.templateFromProject(project.id)!;
    const saved = store.projectPlan.saveTemplate(project.companyId, name(body.name ?? project.name, 'template'), recipe, req.user!.id);
    res.status(201).json({ id: saved.id, companyId: saved.companyId, name: saved.name, tasks: recipe.tasks.length, milestones: recipe.milestones.length });
  }));

  app.post('/project-templates/:id/projects', authMiddleware, handler((req, res) => {
    const template = store.projectPlan.template(req.params.id);
    if (!template) throw new HttpError(404, 'Template not found.');
    requireCompanyRoles(req, template.companyId, ['Admin', 'Manager']);
    const body = asRecord(req.body, 'body');
    const clientId = body.clientId !== undefined ? optionalString(body.clientId) : undefined;
    ensureClientBelongsToCompany(clientId, template.companyId);
    const start = body.startDate ? new Date(optionalDateInput(body.startDate)!) : new Date();
    const project = withActor(req, () => store.createProjectFromTemplate(template, {
      name: name(body.name, 'project'), startDate: start, clientId, ownerId: req.user!.id,
    }));
    res.status(201).json(project);
  }));

  app.delete('/project-templates/:id', authMiddleware, handler((req, res) => {
    const template = store.projectPlan.template(req.params.id);
    if (!template) throw new HttpError(404, 'Template not found.');
    requireCompanyRoles(req, template.companyId, ['Admin', 'Manager']);
    store.projectPlan.removeTemplate(template.id);
    res.json({ success: true, companyId: template.companyId });
  }));
}
