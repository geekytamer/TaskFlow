export type DocumentWorkspaceRole = 'Admin' | 'Manager' | 'Accountant';

export const DOCUMENT_WORKSPACE_ROLES: DocumentWorkspaceRole[] = [
  'Admin',
  'Manager',
  'Accountant',
];

export function canAccessDocumentWorkspace(
  role: string | null | undefined,
): role is DocumentWorkspaceRole {
  return DOCUMENT_WORKSPACE_ROLES.includes(role as DocumentWorkspaceRole);
}
