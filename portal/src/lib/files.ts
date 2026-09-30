/** Safe in the browser: no server imports here. */
export interface PortalFile {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export const fileHref = (file: Pick<PortalFile, 'id'>) => `/api/files/${encodeURIComponent(file.id)}`;
