import type Database from 'better-sqlite3';
import type { TaskStatus } from '../types';

/**
 * A task shared by several people has one part per person ("filming and
 * editing", "on camera"). Each person finishes their own part; the task is
 * done when every part is. A task for one person has no parts and works as
 * it always did.
 */
export type PartStatus = 'To Do' | 'In Progress' | 'Done';
export const PART_STATUSES: PartStatus[] = ['To Do', 'In Progress', 'Done'];

export interface TaskPart {
  taskId: string;
  userId: string;
  label: string | null;
  status: PartStatus;
  doneAt: string | null;
  updatedAt: string;
}

export const TASK_PARTS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS task_parts (
    taskId    TEXT NOT NULL,
    userId    TEXT NOT NULL,
    label     TEXT,
    status    TEXT NOT NULL DEFAULT 'To Do',
    doneAt    TEXT,
    updatedAt TEXT NOT NULL,
    PRIMARY KEY (taskId, userId)
  );
`;

/** A part's state when a task with this status gets parts (or someone joins it). */
export const partStatusFor = (taskStatus: string): PartStatus =>
  taskStatus === 'Done' ? 'Done' : taskStatus === 'To Do' ? 'To Do' : 'In Progress';

/**
 * The task's status after its parts changed: done when every part is; open
 * again (In Progress) when one is reopened or someone new joins; started once
 * any part moves. Waiting and In Review are the task's own and are kept.
 */
export function taskStatusFromParts(parts: Pick<TaskPart, 'status'>[], current: TaskStatus): TaskStatus {
  if (parts.length === 0) return current;
  if (parts.every((p) => p.status === 'Done')) return 'Done';
  if (current === 'Done') return 'In Progress';
  if (current === 'To Do' && parts.some((p) => p.status !== 'To Do')) return 'In Progress';
  return current;
}

export class TaskPartStore {
  constructor(private readonly db: Database.Database) {}

  forTask(taskId: string): TaskPart[] {
    return this.db.prepare('SELECT * FROM task_parts WHERE taskId = ? ORDER BY rowid').all(taskId) as TaskPart[];
  }

  /** Every part, grouped by task: one read for a whole task list. */
  byTask(): Map<string, TaskPart[]> {
    const map = new Map<string, TaskPart[]>();
    for (const part of this.db.prepare('SELECT * FROM task_parts ORDER BY rowid').all() as TaskPart[]) {
      const list = map.get(part.taskId) ?? [];
      list.push(part);
      map.set(part.taskId, list);
    }
    return map;
  }

  /**
   * Matches the parts to the task's people: two or more get a part each (new
   * people start at `startStatus`), one or none means no parts.
   */
  sync(taskId: string, userIds: string[], startStatus: PartStatus) {
    const people = [...new Set(userIds)];
    if (people.length < 2) {
      this.db.prepare('DELETE FROM task_parts WHERE taskId = ?').run(taskId);
      return;
    }
    const now = new Date().toISOString();
    const placeholders = people.map(() => '?').join(',');
    this.db.prepare(`DELETE FROM task_parts WHERE taskId = ? AND userId NOT IN (${placeholders})`).run(taskId, ...people);
    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO task_parts (taskId, userId, label, status, doneAt, updatedAt) VALUES (?, ?, NULL, ?, ?, ?)',
    );
    for (const userId of people) insert.run(taskId, userId, startStatus, startStatus === 'Done' ? now : null, now);
  }

  setStatus(taskId: string, userId: string, status: PartStatus) {
    const now = new Date().toISOString();
    this.db.prepare(
      `UPDATE task_parts SET status = ?, doneAt = CASE WHEN ? = 'Done' THEN COALESCE(doneAt, ?) ELSE NULL END, updatedAt = ?
       WHERE taskId = ? AND userId = ?`,
    ).run(status, status, now, now, taskId, userId);
  }

  setAll(taskId: string, status: PartStatus) {
    for (const part of this.forTask(taskId)) this.setStatus(taskId, part.userId, status);
  }

  setLabel(taskId: string, userId: string, label: string | null) {
    this.db.prepare('UPDATE task_parts SET label = ?, updatedAt = ? WHERE taskId = ? AND userId = ?')
      .run(label, new Date().toISOString(), taskId, userId);
  }

  removeTask(taskId: string) {
    this.db.prepare('DELETE FROM task_parts WHERE taskId = ?').run(taskId);
  }
}
