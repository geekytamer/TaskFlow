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
    <form onSubmit={onSubmit} noValidate className="space-y-3 rounded-panel border border-line bg-surface p-4">
      <label htmlFor="message" className="sr-only">{t(lang, 'msg.placeholder')}</label>
      <textarea
        id="message"
        dir="auto"
        rows={4}
        maxLength={4000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t(lang, 'msg.placeholder')}
        className="w-full resize-y rounded-control border border-field bg-surface px-3.5 py-2.5 text-[15px] leading-relaxed text-ink hover:border-ink/60 focus-visible:border-ink"
      />
      <FilePicker key={round} lang={lang} files={files} onChange={setFiles} disabled={busy} />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={busy} className={`${button.primary} w-full md:w-auto md:px-8`}>
          {busy ? t(lang, 'msg.sending') : t(lang, 'msg.send')}
        </button>
      </div>
    </form>
  );
}
