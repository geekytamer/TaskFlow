'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import type { Contact } from '@/services/contactService';
import {
  downloadPortalFile,
  getPortalThread,
  sendPortalMessage,
  uploadPortalFile,
  type PortalFile,
  type PortalMessage,
} from '@/services/portalAccessService';
import { FileText, Paperclip, X } from 'lucide-react';

const MAX_BYTES = 10 * 1024 * 1024;

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const sizeOf = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * The conversation this client sees in its portal. Everything written here is
 * visible to the client; internal notes stay on the contact.
 */
export function PortalThreadSection({ contact }: { contact: Contact }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [messages, setMessages] = React.useState<PortalMessage[] | null>(null);
  const [body, setBody] = React.useState('');
  const [files, setFiles] = React.useState<PortalFile[]>([]);
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    try {
      setMessages((await getPortalThread(contact.companyId, contact.id)).messages);
    } catch {
      setMessages([]);
    }
  }, [contact.companyId, contact.id]);

  React.useEffect(() => {
    setMessages(null);
    setBody('');
    setFiles([]);
    void load();
  }, [load]);

  const fail = (error: unknown, fallback: string) =>
    toast({ title: error instanceof Error ? error.message : fallback, variant: 'destructive' });

  const attach = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    for (const file of [...list]) {
      if (file.size > MAX_BYTES) {
        toast({ title: tr(`${file.name} is over 10 MB`, `${file.name} أكبر من 10 ميغابايت`), variant: 'destructive' });
        continue;
      }
      try {
        const uploaded = await uploadPortalFile(contact.companyId, contact.id, { fileName: file.name, contentBase64: await toBase64(file) });
        setFiles((current) => [...current, uploaded]);
      } catch (error) {
        fail(error, tr('Upload failed', 'فشل الرفع'));
      }
    }
    if (input.current) input.current.value = '';
    setBusy(false);
  };

  const send = async () => {
    setBusy(true);
    try {
      await sendPortalMessage(contact.companyId, contact.id, { body: body.trim(), fileIds: files.map((f) => f.id) });
      setBody('');
      setFiles([]);
      await load();
    } catch (error) {
      fail(error, tr('Could not send', 'تعذّر الإرسال'));
    } finally {
      setBusy(false);
    }
  };

  const save = (file: PortalFile) =>
    downloadPortalFile(contact.companyId, file).catch((error) => fail(error, tr('Download failed', 'فشل التنزيل')));

  const fileChip = (file: PortalFile, onRemove?: () => void) => (
    <span key={file.id} className="inline-flex max-w-full items-center gap-1 rounded border bg-background text-xs">
      <button type="button" onClick={() => save(file)} className="inline-flex min-w-0 items-center gap-1 px-2 py-1 hover:underline">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <bdi dir="auto" className="truncate">{file.fileName}</bdi>
        <span className="shrink-0 text-muted-foreground" dir="ltr">{sizeOf(file.sizeBytes)}</span>
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove} className="px-1 py-1 text-muted-foreground hover:text-foreground" aria-label={tr('Remove', 'إزالة')}>
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );

  return (
    <section className="space-y-3 border-t pt-4">
      <div>
        <h3 className="text-sm font-semibold">{tr('Portal messages', 'رسائل البوابة')}</h3>
        <p className="text-xs text-muted-foreground">
          {tr('Shared with everyone at this client who has portal access. Keep internal notes on the contact.', 'مشتركة مع كل من لديه وصول إلى البوابة لدى هذا العميل. أبقِ الملاحظات الداخلية على جهة الاتصال.')}
        </p>
      </div>

      {messages === null ? (
        <p className="text-xs text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted-foreground">{tr('No messages yet.', 'لا توجد رسائل بعد.')}</p>
      ) : (
        <ol className="max-h-96 space-y-2 overflow-y-auto rounded-md border p-2">
          {messages.map((m) => (
            <li key={m.id} className={`rounded-md p-2 text-sm ${m.author.type === 'staff' ? 'ms-6 bg-muted' : 'me-6 border'}`}>
              <p className="flex flex-wrap justify-between gap-x-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {m.author.name ?? '-'}
                  <span className="ms-1 font-normal text-muted-foreground">
                    {m.author.type === 'staff' ? tr('(team)', '(الفريق)') : tr('(client)', '(العميل)')}
                  </span>
                </span>
                <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleString(language === 'ar' ? 'ar-u-nu-latn' : 'en')}</time>
              </p>
              <p dir="auto" className="mt-1 whitespace-pre-line">{m.body}</p>
              {m.files.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{m.files.map((f) => fileChip(f))}</div>}
            </li>
          ))}
        </ol>
      )}

      <div className="space-y-2">
        <Textarea
          dir="auto"
          rows={3}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={tr('Reply to the client…', 'رد على العميل…')}
          aria-label={tr('Message to the client', 'رسالة إلى العميل')}
        />
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {files.map((f) => fileChip(f, () => setFiles((current) => current.filter((x) => x.id !== f.id))))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <input
            ref={input}
            type="file"
            multiple
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => attach(e.target.files)}
          />
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => input.current?.click()}>
            <Paperclip className="me-1 h-4 w-4" />
            {tr('Attach', 'إرفاق')}
          </Button>
          <Button type="button" size="sm" disabled={busy || !body.trim()} onClick={send}>
            {tr('Send to client', 'إرسال إلى العميل')}
          </Button>
        </div>
      </div>
    </section>
  );
}
