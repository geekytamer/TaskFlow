'use client';

import { useId, useRef, useState } from 'react';
import { formatFileSize } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';
import { FileIcon } from './file-list';

export interface UploadedFile {
  id: string;
  fileName: string;
  sizeBytes: number;
}

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10;
const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp';
const ALLOWED = /\.(pdf|png|jpe?g|webp)$/i;

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

/**
 * Uploads each chosen file straight away and hands back their ids. The checks
 * here only save a round trip; the server decides by the file's bytes.
 */
export function FilePicker({ lang, files, onChange, disabled }: {
  lang: Lang;
  files: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onPick(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const picked = [...list].slice(0, Math.max(0, MAX_FILES - files.length));
    let next = files;
    setUploading(picked.length);
    for (const file of picked) {
      if (!ALLOWED.test(file.name)) { setError(t(lang, 'file.errType')); continue; }
      if (file.size > MAX_BYTES) { setError(t(lang, 'file.errSize')); continue; }
      try {
        const response = await fetch('/api/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, contentBase64: await toBase64(file) }),
        });
        if (response.status === 201) {
          const uploaded = (await response.json()) as UploadedFile;
          next = [...next, uploaded];
          onChange(next);
        } else {
          setError(t(lang, response.status === 415 ? 'file.errType' : response.status === 413 ? 'file.errSize' : 'file.errFailed'));
        }
      } catch {
        setError(t(lang, 'file.errFailed'));
      }
      setUploading((n) => n - 1);
    }
    setUploading(0);
    if (input.current) input.current.value = '';
  }

  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f) => (
            <li key={f.id} className="inline-flex max-w-72 items-center gap-2 rounded-md border border-line bg-surface py-1 ps-3 pe-1 text-sm">
              <FileIcon />
              <bdi dir="auto" className="truncate font-medium">{f.fileName}</bdi>
              <span className="shrink-0 text-ink-soft"><bdi>{formatFileSize(f.sizeBytes, lang)}</bdi></span>
              <button
                type="button"
                onClick={() => onChange(files.filter((x) => x.id !== f.id))}
                className="rounded px-2 py-1 text-ink-soft hover:bg-canvas hover:text-ink"
                aria-label={`${t(lang, 'file.remove')} ${f.fileName}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          id={inputId}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          disabled={disabled || uploading > 0 || files.length >= MAX_FILES}
          onChange={(e) => onPick(e.target.files)}
        />
        <label
          htmlFor={inputId}
          className="inline-flex h-9 cursor-pointer items-center rounded-md border border-field bg-surface px-3 text-sm font-medium hover:border-ink/60 has-[:disabled]:cursor-not-allowed"
        >
          {uploading > 0 ? t(lang, 'file.uploading') : t(lang, 'file.attach')}
        </label>
        <span className="text-sm text-ink-soft">{t(lang, 'file.hint')}</span>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
