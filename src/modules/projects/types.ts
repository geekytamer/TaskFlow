export type TaskStatus = 'To Do' | 'In Progress' | 'Done';

export const taskStatuses: TaskStatus[] = ['To Do', 'In Progress', 'Done'];

export type TaskPriority = 'Low' | 'Medium' | 'High';

export const taskPriorities: TaskPriority[] = ['Low', 'Medium', 'High'];

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
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: Date;
  dueDate?: Date;
  assignedUserIds?: string[];
  tags: string[];
  companyId: string;
  projectId: string;
  color?: string;
  dependencies?: string[];
  // Invoice related fields
  invoiceImage?: string;
  invoiceVendor?: string;
  invoiceNumber?: string;
  invoiceAmount?: number;
  invoiceDate?: Date;
}

export interface Comment {
    id: string;
    taskId: string;
    userId: string;
    content: string;
    createdAt: Date;
}
