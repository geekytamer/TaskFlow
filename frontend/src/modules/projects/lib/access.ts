import type { Project, UserRole } from '@/lib/types';
import { usePermissionOr } from '@/context/permissions-context';

export function canViewProject(
  project: Project,
  currentUserId?: string | null,
  currentRole?: UserRole | null,
  seesAllProjects?: boolean,
) {
  if (!currentUserId) return false;
  // seesAllProjects comes from projects:all.read (useSeesAllProjects). Without
  // it, the role decides, as it does under the legacy engine.
  const seesAll = seesAllProjects ?? Boolean(currentRole && currentRole !== 'Employee');
  if (seesAll) return true;
  return project.visibility === 'Public' || Boolean(project.memberIds?.includes(currentUserId));
}

export function canManageProjects(currentRole?: UserRole | null) {
  return currentRole === 'Admin' || currentRole === 'Manager';
}

/** Whether the viewer sees every project in the company (projects:all.read). */
export function useSeesAllProjects(currentRole?: UserRole | null): boolean {
  return usePermissionOr('projects', 'all.read', Boolean(currentRole && currentRole !== 'Employee'));
}

/** Whether the viewer can edit and manage projects (projects:write). */
export function useCanManageProjects(currentRole?: UserRole | null): boolean {
  return usePermissionOr('projects', 'write', canManageProjects(currentRole));
}
