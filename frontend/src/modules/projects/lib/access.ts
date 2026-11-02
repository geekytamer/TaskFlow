import type { Project } from '@/lib/types';
import { usePermissions } from '@/context/permissions-context';

/**
 * Whether a project is listed for the viewer: everyone's projects with
 * projects.view at company scope, else public ones and those they belong to.
 * The server applies the same rule; this only avoids showing what it would refuse.
 */
export function canViewProject(
  project: Project,
  currentUserId: string | null | undefined,
  seesAllProjects: boolean,
) {
  if (!currentUserId) return false;
  if (seesAllProjects) return true;
  return project.visibility === 'Public' || Boolean(project.memberIds?.includes(currentUserId));
}

/** Whether the viewer sees every project in the company (projects.view at company scope). */
export function useSeesAllProjects(): boolean {
  return usePermissions().can('projects.view', { scope: 'company' });
}

/** Whether the viewer can edit and manage projects (projects.edit). */
export function useCanManageProjects(): boolean {
  return usePermissions().can('projects.edit');
}
