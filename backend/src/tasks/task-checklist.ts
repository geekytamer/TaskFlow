import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

/** Small steps inside a task ("book the studio", "charge the batteries") that anyone on it can tick. */
export interface ChecklistItem {
  id: string;
  taskId: string;
  text: string;
  done: boolean;
  position: number;
  doneBy: string | null;
  doneAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

export const MAX_CHECKLIST_TEXT = 200;

export const TASK_CHECKLIST_SCHEMA = `
  CREATE TABLE IF NOT EXISTS task_checklist_items (
    id        TEXT PRIMARY KEY,
    taskId    TEXT NOT NULL,
    text      TEXT NOT NULL,
    done      INTEGER NOT NULL DEFAULT 0,
    position  INTEGER NOT NULL,
    doneBy    TEXT,
    doneAt    TEXT,
    createdBy TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_task_checklist_task ON task_checklist_items(taskId, position);
`;

const map = (row: any): ChecklistItem => ({ ...row, done: row.done === 1 });

export class TaskChecklistStore {
  constructor(private readonly db: Database.Database) {}

  forTask(taskId: string): ChecklistItem[] {
    return (this.db.prepare('SELECT * FROM task_checklist_items WHERE taskId = ? ORDER BY position').all(taskId) as any[]).map(map);
  }

  get(id: string): ChecklistItem | undefined {
    const row = this.db.prepare('SELECT * FROM task_checklist_items WHERE id = ?').get(id);
    return row ? map(row) : undefined;
  }

  /** Done/total per task, for whole task lists in one read. */
  counts(): Map<string, { done: number; total: number }> {
    const rows = this.db.prepare('SELECT taskId, SUM(done) AS done, COUNT(*) AS total FROM task_checklist_items GROUP BY taskId').all() as Array<{ taskId: string; done: number; total: number }>;
    return new Map(rows.map((r) => [r.taskId, { done: Number(r.done), total: Number(r.total) }]));
  }

  countFor(taskId: string): { done: number; total: number } {
    const row = this.db.prepare('SELECT SUM(done) AS done, COUNT(*) AS total FROM task_checklist_items WHERE taskId = ?').get(taskId) as { done: number | null; total: number };
    return { done: Number(row.done ?? 0), total: Number(row.total) };
  }

  add(taskId: string, text: string, createdBy: string): ChecklistItem {
    const position = (this.db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM task_checklist_items WHERE taskId = ?').get(taskId) as { p: number }).p;
    const item = { id: uuid(), taskId, text, done: 0, position, doneBy: null, doneAt: null, createdBy, createdAt: new Date().toISOString() };
    this.db.prepare(
      'INSERT INTO task_checklist_items (id, taskId, text, done, position, doneBy, doneAt, createdBy, createdAt) VALUES (@id, @taskId, @text, @done, @position, @doneBy, @doneAt, @createdBy, @createdAt)',
    ).run(item);
    return this.get(item.id)!;
  }

  update(id: string, changes: { text?: string; done?: boolean }, by: string): ChecklistItem {
    if (changes.text !== undefined) this.db.prepare('UPDATE task_checklist_items SET text = ? WHERE id = ?').run(changes.text, id);
    if (changes.done !== undefined) {
      this.db.prepare('UPDATE task_checklist_items SET done = ?, doneBy = ?, doneAt = ? WHERE id = ?')
        .run(changes.done ? 1 : 0, changes.done ? by : null, changes.done ? new Date().toISOString() : null, id);
    }
    return this.get(id)!;
  }

  remove(id: string) {
    this.db.prepare('DELETE FROM task_checklist_items WHERE id = ?').run(id);
  }

  removeTask(taskId: string) {
    this.db.prepare('DELETE FROM task_checklist_items WHERE taskId = ?').run(taskId);
  }

  /** A fresh, unticked copy of a task's list, for the next round of a recurring task. */
  copy(fromTaskId: string, toTaskId: string, by: string) {
    for (const item of this.forTask(fromTaskId)) this.add(toTaskId, item.text, by);
  }
}
