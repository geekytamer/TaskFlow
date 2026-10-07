'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { formatDate, formatFileSize, formatMoney } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';
import { PLATFORMS } from '@/lib/influencer-types';
import { wsWrite } from '@/lib/workspace-client';
import type { OwnDeal, WsContact, WsDeliverable } from '@/lib/workspace-types';
import { DealForm } from './deal-form';
import { DealMoney } from './deal-money';
import { control } from './field';
import { FileIcon } from './file-list';
import { StatusBadge } from './status-badge';
import { button, Figure, list, panel, SectionTitle } from './ui';

const today = () => new Date().toISOString().slice(0, 10);
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = /\.(pdf|png|jpe?g|webp)$/i;

/** One of the influencer's own deals: its figures, deliverables, files and notes, all editable in place. */
export function OwnDealView({ lang, deal, contacts, defaultCurrency }: { lang: Lang; deal: OwnDeal; contacts: WsContact[]; defaultCurrency: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const to = lang === 'ar' ? 'إلى' : '–';

  async function remove() {
    if (!window.confirm(t(lang, 'deal.deleteConfirm'))) return;
    const res = await wsWrite(`deals/${deal.id}/delete`);
    if (res.ok) router.push('/deals');
  }

  return (
    <div className="space-y-10">
      <section aria-label={t(lang, 'deal.edit')}>
        {editing ? (
          <div className={`${panel} p-5 sm:p-6`}>
            <DealForm lang={lang} contacts={contacts} defaultCurrency={defaultCurrency} deal={deal} onDone={() => setEditing(false)} />
          </div>
        ) : (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
              <Figure
                label={t(lang, 'deal.amount')}
                value={deal.amount === null ? <span className="text-base font-medium text-ink-soft">{t(lang, 'deal.noAmount')}</span> : <bdi className="tabular-nums">{formatMoney(deal.amount, deal.currency, lang)}</bdi>}
              />
              <Figure label={t(lang, 'deal.status')} value={<StatusBadge lang={lang} deal={deal.status} />} />
              {(deal.startDate || deal.endDate) && (
                <Figure
                  label={t(lang, 'deal.dates')}
                  value={<span className="text-base"><bdi>{formatDate(deal.startDate, lang)}</bdi>{deal.endDate && <> {to} <bdi>{formatDate(deal.endDate, lang)}</bdi></>}</span>}
                />
              )}
            </dl>
            {deal.notes && <p dir="auto" className="max-w-prose whitespace-pre-line leading-relaxed text-ink-soft">{deal.notes}</p>}
            <button type="button" onClick={() => setEditing(true)} className={button.secondary}>{t(lang, 'deal.edit')}</button>
          </div>
        )}
      </section>

      <Deliverables lang={lang} dealId={deal.id} items={deal.deliverables} />
      <DealMoney lang={lang} deal={deal} />
      <Files lang={lang} dealId={deal.id} files={deal.files} />

      <div className="border-t border-line pt-6">
        <button type="button" onClick={remove} className="inline-flex min-h-11 items-center text-sm font-semibold text-danger underline-offset-4 hover:underline">
          {t(lang, 'deal.delete')}
        </button>
      </div>
    </div>
  );
}

function Deliverables({ lang, dealId, items }: { lang: Lang; dealId: string; items: WsDeliverable[] }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function act(id: string, path: string, body?: unknown) {
    setBusy(id);
    const res = await wsWrite(path, body);
    setBusy(null);
    setError(!res.ok);
    if (res.ok) router.refresh();
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const title = String(f.get('title') ?? '').trim();
    if (!title) return;
    await act('new', `deals/${dealId}/deliverables`, { title, platform: f.get('platform') || null, dueDate: f.get('dueDate') || null });
    form.current?.reset();
  }

  return (
    <section aria-labelledby="deliverables-title">
      <SectionTitle id="deliverables-title">{t(lang, 'deal.deliverables')}</SectionTitle>
      {items.length === 0 ? (
        <p className="mb-4 text-ink-soft">{t(lang, 'deal.noDeliverables')}</p>
      ) : (
        <ul className={`${list} mb-4`}>
          {items.map((d) => {
            const done = d.status === 'done';
            const overdue = !done && d.dueDate !== null && d.dueDate < today();
            return (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2 sm:px-4">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done}
                  aria-label={`${t(lang, done ? 'deal.markTodo' : 'deal.markDone')}: ${d.title}`}
                  disabled={busy === d.id}
                  onClick={() => act(d.id, `deliverables/${d.id}`, { status: done ? 'todo' : 'done' })}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-ink-soft hover:bg-ink/5 hover:text-ink"
                >
                  <span className={`grid h-5 w-5 place-items-center rounded-[6px] border transition-colors ${done ? 'border-success bg-success text-canvas' : 'border-field'}`}>
                    {done && <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>}
                  </span>
                </button>
                <div className="min-w-0 flex-1 py-1.5">
                  <p dir="auto" className={`truncate font-medium ${done ? 'text-ink-soft line-through decoration-ink-soft/60' : ''}`}><bdi>{d.title}</bdi></p>
                  <p className="text-sm text-ink-soft">
                    {d.platform && <bdi>{d.platform}</bdi>}
                    {d.platform && d.dueDate && <span aria-hidden="true"> · </span>}
                    {d.dueDate && (
                      <span className={overdue ? 'font-medium text-danger' : ''}>
                        {overdue ? t(lang, 'deal.overdue') : t(lang, 'deal.due')} <bdi>{formatDate(d.dueDate, lang)}</bdi>
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy === d.id}
                  onClick={() => act(d.id, `deliverables/${d.id}/delete`)}
                  className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-medium text-ink-soft hover:text-danger"
                  aria-label={`${t(lang, 'deal.remove')}: ${d.title}`}
                >
                  {t(lang, 'deal.remove')}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form ref={form} onSubmit={add} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_10rem_auto] sm:items-end">
        <div className="space-y-2">
          <label htmlFor="dl-title" className="block text-sm font-medium">{t(lang, 'deal.deliverableTitle')}</label>
          <input id="dl-title" name="title" dir="auto" required maxLength={160} className={`${control} h-11`} />
        </div>
        <div className="space-y-2">
          <label htmlFor="dl-platform" className="block text-sm font-medium">{t(lang, 'deal.platform')}</label>
          <select id="dl-platform" name="platform" defaultValue="" className={`${control} h-11`}>
            <option value="">—</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="dl-due" className="block text-sm font-medium">{t(lang, 'deal.due')}</label>
          <input id="dl-due" name="dueDate" type="date" className={`${control} h-11`} />
        </div>
        <button type="submit" disabled={busy === 'new'} className={button.secondary}>{t(lang, 'deal.addDeliverable')}</button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{t(lang, 'deal.errFailed')}</p>}
    </section>
  );
}

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

function Files({ lang, dealId, files }: { lang: Lang; dealId: string; files: OwnDeal['files'] }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    setError(null);
    if (!ALLOWED.test(file.name)) { setError(t(lang, 'file.errType')); return; }
    if (file.size > MAX_BYTES) { setError(t(lang, 'file.errSize')); return; }
    setUploading(true);
    const res = await wsWrite(`deals/${dealId}/files`, { fileName: file.name, contentBase64: await toBase64(file) });
    setUploading(false);
    if (res.ok) router.refresh(); else setError(t(lang, 'deal.errFailed'));
  }

  async function remove(id: string) {
    const res = await wsWrite(`files/${id}/delete`);
    if (res.ok) router.refresh();
  }

  return (
    <section aria-labelledby="files-title">
      <SectionTitle id="files-title">{t(lang, 'deal.files')}</SectionTitle>
      {files.length === 0 ? (
        <p className="mb-4 text-ink-soft">{t(lang, 'deal.noFiles')}</p>
      ) : (
        <ul className={`${list} mb-4`}>
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-2">
              <a href={`/api/workspace/files/${f.id}/content`} download className="flex min-h-11 min-w-0 flex-1 items-center gap-2 hover:text-accent">
                <FileIcon />
                <bdi dir="auto" className="truncate font-medium">{f.fileName}</bdi>
                <span className="shrink-0 text-sm text-ink-soft"><bdi>{formatFileSize(f.sizeBytes, lang)}</bdi></span>
              </a>
              <button type="button" onClick={() => remove(f.id)} className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-medium text-ink-soft hover:text-danger" aria-label={`${t(lang, 'deal.remove')}: ${f.fileName}`}>
                {t(lang, 'deal.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className={`${button.secondary} cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent`}>
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" disabled={uploading} onChange={(e) => { void pick(e.target.files); e.target.value = ''; }} />
        {uploading ? t(lang, 'deal.uploading') : t(lang, 'deal.upload')}
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </section>
  );
}

/** A link to a contact page, for the deal header. */
export const BrandLink = ({ brand }: { brand: NonNullable<OwnDeal['brand']> }) =>
  brand.id ? <Link href={`/contacts/${brand.id}`} className="underline-offset-4 hover:text-ink hover:underline"><bdi>{brand.name}</bdi></Link> : <bdi>{brand.name}</bdi>;
