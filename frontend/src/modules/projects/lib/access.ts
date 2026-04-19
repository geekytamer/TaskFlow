import type { Project, UserRole } from '@/lib/types';

export function canViewProject(
  project: Project,
  currentUserId?: string | null,
  currentRole?: UserRole | null,
) {
  if (!currentUserId) return false;
  if (currentRole && currentRole !== 'Employee') return true;
  return project.visibility === 'Public' || Boolean(project.memberIds?.includes(currentUserId));
}

export function canManageProjects(currentRole?: UserRole | null) {
  return currentRole === 'Admin' || currentRole === 'Manager';
}
