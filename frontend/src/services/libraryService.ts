import { apiFetch } from '@/lib/api-client';

/** Documents → Library (spec 2026-11-06-documents-hub-design). */
export interface LibraryItem {
  id: string;
  kind: 'attachment' | 'document';
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  folder?: string;
  hasContent: boolean;
  url?: string;
  entityType: string;
  entityId: string;
  recordLabel?: string;
  route: string | null;
  uploadedByName?: string;
  createdAt: Date;
  /** Where the search words appear inside the file, when they matched its text. */
  snippet?: string;
}

export interface LibraryPage {
  items: LibraryItem[];
  /** More than the newest 500 matched: search or filter to narrow. */
  truncated: boolean;
  folders: string[];
}

export async function getLibrary(
  companyId: string,
  filters: { q?: string; source?: string; folder?: string } = {},
): Promise<LibraryPage> {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  if (filters.source) params.set('source', filters.source);
  if (filters.folder) params.set('folder', filters.folder);
  const query = params.toString();
  const page = await apiFetch<LibraryPage>(`/companies/${companyId}/library${query ? `?${query}` : ''}`);
  return { ...page, items: page.items.map((item) => ({ ...item, createdAt: new Date(item.createdAt) })) };
}

export async function uploadToLibrary(
  companyId: string,
  data: { fileName: string; mimeType?: string; sizeBytes?: number; contentBase64: string; folder?: string },
): Promise<void> {
  await apiFetch(`/companies/${companyId}/records/company/${companyId}/attachments`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateLibraryFile(
  attachmentId: string,
  updates: { fileName?: string; folder?: string },
): Promise<void> {
  await apiFetch(`/record-attachments/${attachmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}
