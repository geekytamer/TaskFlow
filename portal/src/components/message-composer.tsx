'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { t, type Lang } from '@/lib/i18n';
import { button } from './ui';
import { FilePicker, type UploadedFile } from './file-picker';

export function MessageComposer({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Remounting the picker after a send clears its own upload errors too.
  const [round, setRound] = useState(0);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) { setError(t(lang, 'msg.errEmpty')); return; }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, fileIds: files.map((f) => f.id) }),
      });
      if (response.status === 201) {
        setBody('');
        setFiles([]);
        setRound((n) => n + 1);
        router.refresh();
      } else {
        setError(t(lang, 'msg.errFailed'));
      }
    } catch {
      setError(t(lang, 'msg.errFailed'));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-2 rounded-panel border border-line bg-surface p-3 shadow-float lg:shadow-none">
      <label htmlFor="message" className="sr-only">{t(lang, 'msg.placeholder')}</label>
      <textarea
        id="message"
        dir="auto"
        rows={2}
        maxLength={4000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl or Cmd + Enter sends; plain Enter is a new line, as people write longer notes here.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); }
        }}
        placeholder={t(lang, 'msg.placeholder')}
        className="max-h-48 min-h-11 w-full resize-none rounded-control border border-field bg-surface px-3.5 py-2.5 text-[15px] leading-relaxed text-ink [field-sizing:content] hover:border-ink/60 focus-visible:border-ink"
      />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1"><FilePicker key={round} lang={lang} files={files} onChange={setFiles} disabled={busy} /></div>
        <button type="submit" disabled={busy} className={`${button.primary} px-6`}>
          {busy ? t(lang, 'msg.sending') : t(lang, 'msg.send')}
        </button>
      </div>
    </form>
  );
}
