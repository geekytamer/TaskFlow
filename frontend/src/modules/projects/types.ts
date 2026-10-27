export type TaskStatus = 'To Do' | 'In Progress' | 'Waiting' | 'In Review' | 'Done';

export const taskStatuses: TaskStatus[] = ['To Do', 'In Progress', 'Waiting', 'In Review', 'Done'];

/** A person's part of a shared task moves through these only. */
export type PartStatus = 'To Do' | 'In Progress' | 'Done';
export const partStatuses: PartStatus[] = ['To Do', 'In Progress', 'Done'];

/** One person's part of a task shared by two or more (backend tasks/task-parts.ts). */
export interface TaskPart {
  taskId: string;
  userId: string;
  label: string | null;
  status: PartStatus;
  doneAt: string | null;
  updatedAt: string;
}

export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export const taskPriorities: TaskPriority[] = ['Low', 'Medium', 'High', 'Urgent'];

export type ProjectVisibility = 'Public' | 'Private';
export const projectVisibilities: ProjectVisibility[] = ['Public', 'Private'];

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  companyId: string;
  visibility: ProjectVisibility;
  memberIds?: string[];
  clientId?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: Date;
  dueDate?: Date;
  /** First day of a task that takes several days; dueDate is the last. */
  startDate?: Date | null;
  assignedUserIds?: string[];
  tags: string[];
  companyId: string;
  projectId: string;
  color?: string;
  dependencies?: string[];
  parentTaskId?: string;
  // Creator of the task; used with isPrivate to scope personal tasks.
  ownerId?: string;
  // A private task is visible only to its owner and assignees.
  isPrivate?: boolean;
  /** Repeats when done: the next round is made with a later due date. */
  recurrence?: TaskRecurrence | null;
  recurrenceNextId?: string;
  // Invoice related fields
  invoiceImage?: string;
  invoiceVendor?: string;
  invoiceNumber?: string;
  invoiceAmount?: number;
  invoiceDate?: Date;
  generatedInvoiceId?: string; // To track if this task-invoice is already on a system invoice
  /** One per person when two or more share the task; empty otherwise. */
  parts?: TaskPart[];
  /** Checklist steps ticked out of all. */
  checklist?: { done: number; total: number };
}

export interface Comment {
    id: string;
    taskId: string;
    userId: string;
    content: string;
    createdAt: Date;
}

export interface TimeEntry {
    id: string;
    companyId: string;
    taskId: string;
    userId: string;
    userName?: string;
    minutes: number;
    spentOn: Date;
    note?: string;
    cost?: number;
    createdAt: Date;
}

export const taskRecurrences = ['daily', 'weekly', 'monthly'] as const;
export type TaskRecurrence = (typeof taskRecurrences)[number];
