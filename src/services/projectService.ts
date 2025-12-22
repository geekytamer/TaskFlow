import { apiFetch } from '@/lib/api-client';
import type { Task, Project, Comment } from '@/modules/projects/types';

const toDate = (value: any) => (value ? new Date(value) : undefined);

const mapTask = (task: any): Task => ({
  ...task,
  createdAt: toDate(task.createdAt) || new Date(),
  dueDate: toDate(task.dueDate),
  invoiceDate: toDate(task.invoiceDate),
});

const mapComment = (comment: any): Comment => ({
  ...comment,
  createdAt: toDate(comment.createdAt) || new Date(),
});

export async function getProjects(): Promise<Project[]> {
  return apiFetch<Project[]>('/projects');
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  if (!id) return undefined;
  try {
    return await apiFetch<Project>(`/projects/${id}`);
  } catch (error) {
    console.error(`Error fetching project ${id}`, error);
    return undefined;
  }
}

export async function createProject(projectData: Omit<Project, 'id'>): Promise<Project> {
  return apiFetch<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(projectData),
  });
}

export async function updateProject(
  projectId: string,
  projectData: Partial<Project>,
): Promise<Project> {
  return apiFetch<Project>(`/projects/${projectId}`, {
    method: 'PUT',
    body: JSON.stringify(projectData),
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  await apiFetch(`/projects/${projectId}`, { method: 'DELETE' });
}

export async function addProjectMember(projectId: string, userId: string): Promise<Project> {
  return apiFetch<Project>(`/projects/${projectId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function removeProjectMember(projectId: string, userId: string): Promise<Project> {
  return apiFetch<Project>(`/projects/${projectId}/members/${userId}`, {
    method: 'DELETE',
  });
}

export async function getTasks(): Promise<Task[]> {
  const tasks = await apiFetch<Task[]>('/tasks');
  return tasks.map(mapTask);
}

export async function getTasksByClient(companyId: string, clientId: string): Promise<Task[]> {
  const tasks = await apiFetch<Task[]>(`/companies/${companyId}/clients/${clientId}/tasks`);
  return tasks.map(mapTask);
}

export async function getTaskById(id: string): Promise<Task | undefined> {
  if (!id) return undefined;
  try {
    const task = await apiFetch<Task>(`/tasks/${id}`);
    return mapTask(task);
  } catch (error) {
    console.error(`Error fetching task ${id}`, error);
    return undefined;
  }
}

export async function createTask(
  taskData: Omit<Task, 'id' | 'status' | 'createdAt'>,
): Promise<Task> {
  const payload = { ...taskData, status: 'To Do', createdAt: new Date() };
  const task = await apiFetch<Task>('/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapTask(task);
}

export async function updateTask(taskId: string, taskData: Partial<Task>): Promise<Task | undefined> {
  try {
    const task = await apiFetch<Task>(`/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(taskData),
    });
    return mapTask(task);
  } catch (error) {
    console.error(`Error updating task ${taskId}`, error);
    return undefined;
  }
}

export async function markTasksAsInvoiced(taskIds: string[], invoiceId: string): Promise<void> {
  if (taskIds.length === 0) return;
  await apiFetch('/tasks/mark-invoiced', {
    method: 'POST',
    body: JSON.stringify({ taskIds, invoiceId }),
  });
}

export async function getCommentsByTaskId(taskId: string): Promise<Comment[]> {
  const comments = await apiFetch<Comment[]>(`/tasks/${taskId}/comments`);
  return comments.map(mapComment);
}

export async function createComment(
  commentData: Omit<Comment, 'id' | 'createdAt'>,
): Promise<Comment> {
  const comment = await apiFetch<Comment>(`/tasks/${commentData.taskId}/comments`, {
    method: 'POST',
    body: JSON.stringify(commentData),
  });
  return mapComment(comment);
}
