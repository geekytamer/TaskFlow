import { formatFileSize } from '@/lib/format';
import type { Lang } from '@/lib/i18n';
import { fileHref, type PortalFile } from '@/lib/files';

/** Files always download; none opens in the page. */
export function FileList({ files, lang }: { files: PortalFile[]; lang: Lang }) {
  if (files.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.id}>
          <a href={fileHref(f)} download className="inline-flex max-w-72 items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-sm hover:border-ink/60">
            <FileIcon />
            <bdi dir="auto" className="truncate font-medium">{f.fileName}</bdi>
            <span className="shrink-0 text-ink-soft"><bdi>{formatFileSize(f.sizeBytes, lang)}</bdi></span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function FileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5z" />
      <path d="M9 1.5v4h4" />
    </svg>
  );
}
