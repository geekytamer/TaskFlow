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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4006';

/** Public, unauthenticated print payload (used by the /document/[id] print page). */
export async function getPublicDocument(id: string): Promise<{
  title: string;
  doc: DocumentModel | null;
  letterhead: Letterhead | null;
  context: Record<string, string>;
}> {
  const res = await fetch(`${API_BASE}/public/documents/${id}`);
  if (!res.ok) throw new Error('Document not found.');
  return res.json();
}

/** Fetch the server-rendered PDF (authenticated) and trigger a download. */
export async function downloadDocumentPdf(id: string, title: string): Promise<void> {
  const { getStoredToken } = await import('@/lib/api-client');
  const res = await fetch(`${API_BASE}/documents/${id}/pdf`, {
    headers: { Authorization: `Bearer ${getStoredToken() ?? ''}` },
  });
  if (!res.ok) throw new Error('PDF is unavailable (server Chromium may not be running).');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(title || 'document').replace(/[^a-z0-9._-]+/gi, '-')}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
