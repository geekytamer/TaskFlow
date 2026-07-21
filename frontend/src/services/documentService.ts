import { apiFetch } from '@/lib/api-client';
import type {
  DocumentTemplate, DocumentInstance, DocumentModel, Letterhead,
  DocumentType, DocumentDataSource, DocumentManualField,
} from '@/modules/documents/types';

export async function getDocumentTemplates(companyId: string): Promise<DocumentTemplate[]> {
  if (!companyId) return [];
  return apiFetch<DocumentTemplate[]>(`/companies/${companyId}/document-templates`);
}

export async function getDocumentTemplate(id: string): Promise<DocumentTemplate> {
  return apiFetch<DocumentTemplate>(`/document-templates/${id}`);
}

export async function createDocumentTemplate(
  companyId: string,
  data: { name: string; type: DocumentType; dataSource: DocumentDataSource; letterhead?: Letterhead; doc?: DocumentModel; manualFields?: DocumentManualField[] },
): Promise<DocumentTemplate> {
  return apiFetch<DocumentTemplate>(`/companies/${companyId}/document-templates`, { method: 'POST', body: JSON.stringify(data) });
}

export async function updateDocumentTemplate(
  id: string,
  data: Partial<{ name: string; type: DocumentType; dataSource: DocumentDataSource; letterhead: Letterhead; doc: DocumentModel; manualFields: DocumentManualField[] }>,
): Promise<DocumentTemplate> {
  return apiFetch<DocumentTemplate>(`/document-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteDocumentTemplate(id: string): Promise<void> {
  await apiFetch(`/document-templates/${id}`, { method: 'DELETE' });
}

export async function getDocuments(companyId: string): Promise<DocumentInstance[]> {
  if (!companyId) return [];
  return apiFetch<DocumentInstance[]>(`/companies/${companyId}/documents`);
}

export async function getDocument(id: string): Promise<DocumentInstance> {
  return apiFetch<DocumentInstance>(`/documents/${id}`);
}

export async function createDocument(
  companyId: string,
  data: { templateId: string; title?: string; recordType?: DocumentDataSource; recordId?: string; fieldValues?: Record<string, string> },
): Promise<DocumentInstance> {
  return apiFetch<DocumentInstance>(`/companies/${companyId}/documents`, { method: 'POST', body: JSON.stringify(data) });
}

export async function updateDocument(
  id: string,
  data: Partial<{ title: string; fieldValues: Record<string, string>; recordId: string; status: 'draft' | 'final' }>,
): Promise<DocumentInstance> {
  return apiFetch<DocumentInstance>(`/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteDocument(id: string): Promise<void> {
  await apiFetch(`/documents/${id}`, { method: 'DELETE' });
}
