export type TaskStatus = 'To Do' | 'In Progress' | 'Done';

export const taskStatuses: TaskStatus[] = ['To Do', 'In Progress', 'Done'];

export type TaskPriority = 'Low' | 'Medium' | 'High';

export const taskPriorities: TaskPriority[] = ['Low', 'Medium', 'High'];

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: Date;
  assignedUserId?: string;
  tags: string[];
  companyId: string;
}
