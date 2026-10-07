'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { formatDateTime } from '@/lib/format';
import { t, type Key, type Lang } from '@/lib/i18n';
import { wsWrite } from '@/lib/workspace-client';
import { CONTACT_KINDS, contactKindKey, type WsContact, type WsContactPage } from '@/lib/workspace-types';
import { control } from './field';
import { button, panel } from './ui';

/** Adding a contact, or editing one in place. */
export function ContactForm({ lang, contact, onDone, startOpen = false }: { lang: Lang; contact?: WsContact; onDone?: () => void; startOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(contact) || startOpen);
  const [errors, setErrors] = useState<Key[]>([]);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const value = (k: string) => String(f.get(k) ?? '').trim();
    const problems: Key[] = [];
    if (!value('name')) problems.push('wsc.errName');
    if (value('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value('email'))) problems.push('wsc.errEmail');
    setErrors(problems);
    if (problems.length) return;
    setBusy(true);
    const body = { name: value('name'), kind: value('kind'), company: value('company'), email: value('email'), phone: value('phone'), notes: value('notes') };
    const res = await wsWrite<{ id: string }>(contact ? `contacts/${contact.id}` : 'contacts', body);
    setBusy(false);
    if (!res.ok || !res.data) { setErrors(['deal.errFailed']); return; }
    if (contact) { onDone?.(); router.refresh(); } else router.push(`/contacts/${res.data.id}`);
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className={button.primary}>{t(lang, 'wsc.new')}</button>;
  }

  const label = 'block text-sm font-medium';
  return (
    <form onSubmit={onSubmit} noValidate className={`${panel} space-y-5 p-5 sm:p-6`}>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="space-y-2">
          <label htmlFor="wsc-name" className={label}>{t(lang, 'wsc.name')}</label>
          <input id="wsc-name" name="name" dir="auto" required maxLength={120} defaultValue={contact?.name} autoFocus={!contact} className={`${control} h-11`} />
        </div>
        <div className="space-y-2">
          <label htmlFor="wsc-kind" className={label}>{t(lang, 'wsc.kindLabel')}</label>
          <select id="wsc-kind" name="kind" defaultValue={contact?.kind ?? 'brand'} className={`${control} h-11`}>
            {CONTACT_KINDS.map((k) => <option key={k} value={k}>{t(lang, contactKindKey(k))}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <label htmlFor="wsc-company" className={label}>{t(lang, 'wsc.company')}</label>
        <input id="wsc-company" name="company" dir="auto" maxLength={120} defaultValue={contact?.company ?? ''} className={`${control} h-11`} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="wsc-email" className={label}>{t(lang, 'wsc.email')}</label>
          <input id="wsc-email" name="email" type="email" dir="ltr" maxLength={200} defaultValue={contact?.email ?? ''} className={`${control} h-11`} />
        </div>
        <div className="space-y-2">
          <label htmlFor="wsc-phone" className={label}>{t(lang, 'wsc.phone')}</label>
          <input id="wsc-phone" name="phone" type="tel" dir="ltr" maxLength={40} defaultValue={contact?.phone ?? ''} className={`${control} h-11`} />
        </div>
      </div>
      <div className="space-y-2">
        <label htmlFor="wsc-notes" className={label}>{t(lang, 'wsc.about')}</label>
        <textarea id="wsc-notes" name="notes" dir="auto" rows={3} maxLength={4000} defaultValue={contact?.notes ?? ''} className={`${control} py-2.5 leading-relaxed`} />
      </div>
      {errors.length > 0 && <ul role="alert" className="space-y-1 text-sm text-danger">{errors.map((e) => <li key={e}>{t(lang, e)}</li>)}</ul>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className={button.primary}>{busy ? t(lang, 'deal.saving') : t(lang, contact ? 'deal.save' : 'wsc.create')}</button>
        <button type="button" onClick={() => (contact ? onDone?.() : setOpen(false))} className={button.secondary}>{t(lang, 'deal.cancelEdit')}</button>
      </div>
    </form>
  );
}

/** The contact's details, with an edit toggle and archiving. */
export function ContactDetails({ lang, contact }: { lang: Lang; contact: WsContactPage }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  if (editing) return <ContactForm lang={lang} contact={contact} onDone={() => setEditing(false)} />;

  async function archive() {
    if (!window.confirm(t(lang, 'wsc.archiveConfirm'))) return;
    const res = await wsWrite(`contacts/${contact.id}/archive`);
    if (res.ok) router.push('/contacts');
  }

  const rows: Array<[Key, React.ReactNode]> = [];
  if (contact.email) rows.push(['wsc.email', <a key="e" href={`mailto:${contact.email}`} dir="ltr" className="underline-offset-4 hover:underline">{contact.email}</a>]);
  if (contact.phone) rows.push(['wsc.phone', <a key="p" href={`tel:${contact.phone.replace(/\s+/g, '')}`} dir="ltr" className="tabular-nums underline-offset-4 hover:underline">{contact.phone}</a>]);
  if (contact.notes) rows.push(['wsc.about', <span key="n" dir="auto" className="whitespace-pre-line">{contact.notes}</span>]);

  return (
    <div className="space-y-5">
      {rows.length > 0 && (
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-sm text-ink-soft sm:pt-0.5">{t(lang, k)}</dt>
              <dd className="leading-relaxed [overflow-wrap:anywhere]">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button type="button" onClick={() => setEditing(true)} className={button.secondary}>{t(lang, 'wsc.edit')}</button>
        {!contact.archived && (
          <button type="button" onClick={archive} className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-soft underline-offset-4 hover:text-danger hover:underline">
            {t(lang, 'wsc.archive')}
          </button>
        )}
      </div>
    </div>
  );
}

/** A running log of what was agreed and what to remember, newest first. */
export function ContactNotes({ lang, contactId, log }: { lang: Lang; contactId: string; log: WsContactPage['log'] }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = String(new FormData(event.currentTarget).get('body') ?? '').trim();
    if (!body) return;
    setBusy(true);
    const res = await wsWrite(`contacts/${contactId}/notes`, { body });
    setBusy(false);
    setError(!res.ok);
    if (res.ok) { form.current?.reset(); router.refresh(); }
  }

  return (
    <div className="space-y-5">
      <form ref={form} onSubmit={add} className="space-y-3">
        <label htmlFor="note-body" className="sr-only">{t(lang, 'wsc.addNote')}</label>
        <textarea id="note-body" name="body" dir="auto" rows={2} maxLength={4000} placeholder={t(lang, 'wsc.notePlaceholder')} className={`${control} py-2.5 leading-relaxed`} />
        <button type="submit" disabled={busy} className={button.secondary}>{t(lang, 'wsc.addNote')}</button>
        {error && <p role="alert" className="text-sm text-danger">{t(lang, 'deal.errFailed')}</p>}
      </form>
      {log.length === 0 ? (
        <p className="text-ink-soft">{t(lang, 'wsc.noNotes')}</p>
      ) : (
        <ol className="space-y-4 border-s border-line ps-5">
          {log.map((n) => (
            <li key={n.id} className="relative">
              <span aria-hidden="true" className="absolute -start-[25px] top-2 h-2 w-2 rounded-full bg-ink-soft/60" />
              <time dateTime={n.createdAt} className="text-sm text-ink-soft"><bdi>{formatDateTime(n.createdAt, lang)}</bdi></time>
              <p dir="auto" className="mt-0.5 whitespace-pre-line leading-relaxed [overflow-wrap:anywhere]">{n.body}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
