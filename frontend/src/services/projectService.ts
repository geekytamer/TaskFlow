import { apiFetch, isApiError } from '@/lib/api-client';
import type { Task, Project, Comment, TimeEntry, ProjectMilestone, ProjectSummary, ProjectTemplateSummary } from '@/modules/projects/types';

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
    if (isApiError(error) && error.status === 404) {
      return undefined;
    }
    console.error(`Error fetching project ${id}`, error);
    throw error;
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
    if (isApiError(error) && error.status === 404) {
      return undefined;
    }
    console.error(`Error fetching task ${id}`, error);
    throw error;
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

export async function updateTask(taskId: string, taskData: Partial<Task>): Promise<Task> {
  const task = await apiFetch<Task>(`/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify(taskData),
  });
  return mapTask(task);
}

export async function deleteTask(taskId: string): Promise<void> {
  await apiFetch(`/tasks/${taskId}`, { method: 'DELETE' });
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
  commentData: Omit<Comment, 'id' | 'createdAt'> & { mentionIds?: string[] },
): Promise<Comment> {
  const comment = await apiFetch<Comment>(`/tasks/${commentData.taskId}/comments`, {
    method: 'POST',
    body: JSON.stringify(commentData),
  });
  return mapComment(comment);
}

const mapTimeEntry = (e: any): TimeEntry => ({
  ...e,
  minutes: Number(e.minutes) || 0,
  cost: e.cost === null || e.cost === undefined ? undefined : Number(e.cost),
  spentOn: e.spentOn ? new Date(e.spentOn) : new Date(),
  createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
});

export async function getTimeEntries(taskId: string): Promise<TimeEntry[]> {
  const entries = await apiFetch<any[]>(`/tasks/${taskId}/time-entries`);
  return entries.map(mapTimeEntry);
}

export async function logTime(
  taskId: string,
  input: { hours: number; note?: string; spentOn?: string },
): Promise<TimeEntry> {
  const entry = await apiFetch<any>(`/tasks/${taskId}/time-entries`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return mapTimeEntry(entry);
}

export async function deleteTimeEntry(id: string): Promise<void> {
  await apiFetch(`/time-entries/${id}`, { method: 'DELETE' });
}

/** One person's part of a shared task: their status, or (for whoever runs the task) its label. */
export async function updateTaskPart(
  taskId: string,
  userId: string,
  changes: { status?: 'To Do' | 'In Progress' | 'Done'; label?: string | null },
): Promise<Task> {
  const task = await apiFetch<Task>(`/tasks/${encodeURIComponent(taskId)}/parts/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
  return mapTask(task);
}

/** One step of a task's checklist (backend tasks/task-checklist.ts). */
export interface ChecklistItem {
  id: string;
  taskId: string;
  text: string;
  done: boolean;
  position: number;
  doneBy: string | null;
  doneAt: string | null;
}

export const getChecklist = (taskId: string) =>
  apiFetch<ChecklistItem[]>(`/tasks/${encodeURIComponent(taskId)}/checklist`);

export const addChecklistItem = (taskId: string, text: string) =>
  apiFetch<ChecklistItem>(`/tasks/${encodeURIComponent(taskId)}/checklist`, { method: 'POST', body: JSON.stringify({ text }) });

export const updateChecklistItem = (taskId: string, itemId: string, changes: { text?: string; done?: boolean }) =>
  apiFetch<ChecklistItem>(`/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: JSON.stringify(changes) });

export const deleteChecklistItem = (taskId: string, itemId: string) =>
  apiFetch<{ success: boolean }>(`/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`, { method: 'DELETE' });

export async function getProjectSummary(projectId: string): Promise<ProjectSummary> {
  return apiFetch<ProjectSummary>(`/projects/${projectId}/summary`);
}

export async function getMilestones(projectId: string): Promise<ProjectMilestone[]> {
  return apiFetch<ProjectMilestone[]>(`/projects/${projectId}/milestones`);
}

export async function addMilestone(projectId: string, data: { name: string; dueDate?: string | null }): Promise<ProjectMilestone> {
  return apiFetch<ProjectMilestone>(`/projects/${projectId}/milestones`, { method: 'POST', body: JSON.stringify(data) });
}

export async function updateMilestone(projectId: string, milestoneId: string, data: { name?: string; dueDate?: string | null }): Promise<ProjectMilestone> {
  return apiFetch<ProjectMilestone>(`/projects/${projectId}/milestones/${milestoneId}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteMilestone(projectId: string, milestoneId: string): Promise<void> {
  await apiFetch(`/projects/${projectId}/milestones/${milestoneId}`, { method: 'DELETE' });
}

export async function getProjectTemplates(companyId: string): Promise<ProjectTemplateSummary[]> {
  return apiFetch<ProjectTemplateSummary[]>(`/companies/${companyId}/project-templates`);
}

export async function saveProjectAsTemplate(projectId: string, name: string): Promise<ProjectTemplateSummary> {
  return apiFetch<ProjectTemplateSummary>(`/projects/${projectId}/template`, { method: 'POST', body: JSON.stringify({ name }) });
}

export async function createProjectFromTemplate(templateId: string, data: { name: string; startDate: string; clientId?: string }): Promise<Project> {
  return apiFetch<Project>(`/project-templates/${templateId}/projects`, { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteProjectTemplate(templateId: string): Promise<void> {
  await apiFetch(`/project-templates/${templateId}`, { method: 'DELETE' });
}

export async function postponeProject(projectId: string, startDate: string): Promise<{ project: Project; days: number; moved: number }> {
  return apiFetch(`/projects/${projectId}/postpone`, { method: 'POST', body: JSON.stringify({ startDate }) });
}

export async function completeProject(projectId: string, closeOpenTasks: boolean): Promise<{ project: Project; closed: number }> {
  return apiFetch(`/projects/${projectId}/complete`, { method: 'POST', body: JSON.stringify({ closeOpenTasks }) });
}
