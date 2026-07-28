export const DOCUMENT_WORKSPACE_TABS = [
  { value: 'templates', label: 'Templates', labelAr: 'القوالب' },
  { value: 'documents', label: 'Documents', labelAr: 'المستندات' },
] as const;

export type DocumentWorkspaceTab = (typeof DOCUMENT_WORKSPACE_TABS)[number]['value'];

export function getDocumentWorkspaceTab(value: string | null): DocumentWorkspaceTab {
  return DOCUMENT_WORKSPACE_TABS.some((tab) => tab.value === value)
    ? value as DocumentWorkspaceTab
    : 'templates';
}
