import { HttpError } from '../http';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type PortalFileType = 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp';

const EXTENSION: Record<PortalFileType, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

/**
 * The file's real type from its first bytes. The name and any claimed type are
 * ignored: a file named logo.png that is really HTML is refused. Only types that
 * cannot carry script are accepted, so SVG and HTML never get in.
 */
export function detectType(buf: Buffer): PortalFileType | undefined {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return undefined;
}

/** A display name with no path or control characters, whose extension matches the real type. */
export function safeFileName(raw: unknown, type: PortalFileType): string {
  const base = (typeof raw === 'string' ? raw : '')
    .split(/[\\/]/).pop()!
    .replace(/[\u0000-\u001f\u007f"<>|*?:]/g, '')
    .trim();
  const stem = base.replace(/\.[^.]*$/, '').slice(0, 100).trim() || 'file';
  return `${stem}.${EXTENSION[type]}`;
}

/** Decodes and checks an uploaded file, throwing the right HTTP error for each way it can fail. */
export function readUpload(body: Record<string, unknown>): { content: Buffer; type: PortalFileType; fileName: string } {
  const raw = typeof body.contentBase64 === 'string' ? body.contentBase64.trim() : '';
  const base64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new HttpError(400, 'The file is missing or not valid base64.');
  const content = Buffer.from(base64, 'base64');
  if (content.length === 0) throw new HttpError(400, 'The file is empty.');
  if (content.length > MAX_FILE_BYTES) throw new HttpError(413, 'Files can be at most 10 MB.');
  const type = detectType(content);
  if (!type) throw new HttpError(415, 'Only PDF, PNG, JPEG and WebP files can be shared.');
  return { content, type, fileName: safeFileName(body.fileName, type) };
}

/** Headers for serving a stored file: always a download, never interpreted by the browser. */
export function downloadHeaders(file: { fileName: string; mimeType: string; sizeBytes: number }) {
  const asciiName = file.fileName.replace(/[^\x20-\x7e]/g, '_');
  return {
    'Content-Type': file.mimeType,
    'Content-Length': String(file.sizeBytes),
    'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'",
    'Cache-Control': 'private, no-store',
  };
}
