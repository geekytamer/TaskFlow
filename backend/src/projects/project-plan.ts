import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

/**
 * A project's plan: its stages (milestones) and reusable templates. Status,
 * dates and budget live on the projects row itself (migration 143).
 */
/** Archived: put away (finished long ago, or cancelled); its tasks leave everyone's lists. */
export const projectStatuses = ['Planning', 'Active', 'On Hold', 'Done', 'Archived'] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export const projectPriorities = ['Low', 'Medium', 'High', 'Urgent'] as const;
export type ProjectPriority = (typeof projectPriorities)[number];

export interface ProjectMilestone {
  id: string;
  companyId: string;
  projectId: string;
  name: string;
  dueDate: string | null;
  position: number;
  createdAt: string;
}

/**
 * A project saved for reuse: everything dated is kept as days after its first
 * day (the earliest of the project start and any task or stage date).
 */
export interface TemplateBody {
  description: string;
  color: string;
  visibility: 'Public' | 'Private';
  memberIds: string[];
  budget: number | null;
  /** Days from start to end, when the project had both. */
  lengthDays: number | null;
  /** Days from the first day to the project's own start (older templates: 0). */
  startOffset?: number | null;
  milestones: Array<{ name: string; dueOffset: number | null }>;
  tasks: Array<{
    title: string;
    description: string;
    priority: string;
    assignedUserIds: string[];
    tags: string[];
    startOffset: number | null;
    dueOffset: number | null;
    milestoneIndex: number | null;
    recurrence: string | null;
    checklist: string[];
    partLabels: Record<string, string>;
  }>;
}

export interface ProjectTemplate {
  id: string;
  companyId: string;
  name: string;
  body: TemplateBody;
  createdBy: string | null;
  createdAt: string;
}

export const MAX_MILESTONE_NAME = 120;

export const PROJECT_PLAN_SCHEMA = `
  CREATE TABLE IF NOT EXISTS project_milestones (
    id        TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    projectId TEXT NOT NULL,
    name      TEXT NOT NULL,
    dueDate   TEXT,
    position  INTEGER NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON project_milestones(projectId, position);
  CREATE TABLE IF NOT EXISTS project_templates (
    id        TEXT PRIMARY KEY,
    companyId TEXT NOT NULL,
    name      TEXT NOT NULL,
    body      TEXT NOT NULL,
    createdBy TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_project_templates_company ON project_templates(companyId);
`;

const DAY = 86_400_000;
const dayStart = (d: Date | string) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};
/** Whole days from the anchor to a date (local calendar days). */
export const dayOffset = (anchor: Date | string, date: Date | string | null | undefined): number | null =>
  date ? Math.round((dayStart(date) - dayStart(anchor)) / DAY) : null;
/** The anchor moved on by whole days, keeping the original time of day. */
export const shiftDays = (anchor: Date, days: number | null): Date | undefined => {
  if (days === null) return undefined;
  const d = new Date(anchor);
  d.setDate(d.getDate() + days);
  return d;
};

export class ProjectPlanStore {
  constructor(private readonly db: Database.Database) {}

  milestones(projectId: string): ProjectMilestone[] {
    return this.db.prepare('SELECT * FROM project_milestones WHERE projectId = ? ORDER BY position').all(projectId) as ProjectMilestone[];
  }

  milestone(id: string): ProjectMilestone | undefined {
    return this.db.prepare('SELECT * FROM project_milestones WHERE id = ?').get(id) as ProjectMilestone | undefined;
  }

  addMilestone(project: { id: string; companyId: string }, name: string, dueDate: string | null): ProjectMilestone {
    const position = (this.db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM project_milestones WHERE projectId = ?').get(project.id) as { p: number }).p;
    const row: ProjectMilestone = { id: uuid(), companyId: project.companyId, projectId: project.id, name, dueDate, position, createdAt: new Date().toISOString() };
    this.db.prepare('INSERT INTO project_milestones (id, companyId, projectId, name, dueDate, position, createdAt) VALUES (@id, @companyId, @projectId, @name, @dueDate, @position, @createdAt)').run(row);
    return row;
  }

  updateMilestone(id: string, changes: { name?: string; dueDate?: string | null; position?: number }): ProjectMilestone | undefined {
    const current = this.milestone(id);
    if (!current) return undefined;
    const next = {
      ...current,
      name: changes.name ?? current.name,
      dueDate: changes.dueDate !== undefined ? changes.dueDate : current.dueDate,
      position: changes.position ?? current.position,
    };
    this.db.prepare('UPDATE project_milestones SET name = @name, dueDate = @dueDate, position = @position WHERE id = @id').run(next);
    return next;
  }

  /** A removed stage lets go of its tasks; the tasks stay in the project. */
  removeMilestone(id: string) {
    this.db.prepare('UPDATE tasks SET milestoneId = NULL WHERE milestoneId = ?').run(id);
    this.db.prepare('DELETE FROM project_milestones WHERE id = ?').run(id);
  }

  removeProject(projectId: string) {
    this.db.prepare('DELETE FROM project_milestones WHERE projectId = ?').run(projectId);
  }

  templates(companyId: string): ProjectTemplate[] {
    return (this.db.prepare('SELECT * FROM project_templates WHERE companyId = ? ORDER BY name').all(companyId) as any[]).map((r) => ({ ...r, body: JSON.parse(r.body) }));
  }

  template(id: string): ProjectTemplate | undefined {
    const row = this.db.prepare('SELECT * FROM project_templates WHERE id = ?').get(id) as any;
    return row ? { ...row, body: JSON.parse(row.body) } : undefined;
  }

  saveTemplate(companyId: string, name: string, body: TemplateBody, createdBy: string): ProjectTemplate {
    const row = { id: uuid(), companyId, name, body: JSON.stringify(body), createdBy, createdAt: new Date().toISOString() };
    this.db.prepare('INSERT INTO project_templates (id, companyId, name, body, createdBy, createdAt) VALUES (@id, @companyId, @name, @body, @createdBy, @createdAt)').run(row);
    return { ...row, body };
  }

  removeTemplate(id: string) {
    this.db.prepare('DELETE FROM project_templates WHERE id = ?').run(id);
  }

  /** Labour (logged time) and expenses booked against a project. */
  spent(projectId: string): { labor: number; expenses: number; total: number } {
    const labor = (this.db.prepare('SELECT COALESCE(SUM(te.cost), 0) AS v FROM time_entries te JOIN tasks t ON t.id = te.taskId WHERE t.projectId = ?').get(projectId) as { v: number }).v;
    const expenses = (this.db.prepare('SELECT COALESCE(SUM(amount), 0) AS v FROM expenses WHERE projectId = ?').get(projectId) as { v: number }).v;
    const round = (n: number) => Math.round(n * 1000) / 1000;
    return { labor: round(labor), expenses: round(expenses), total: round(labor + expenses) };
  }
}
