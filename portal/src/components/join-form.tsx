'use client';

import { useState, type FormEvent } from 'react';
import { t, type Key, type Lang } from '@/lib/i18n';
import { control, primaryButton } from './field';

/** Industry choices: shown in the visitor's language, sent to staff in English. */
const INDUSTRIES: Array<{ key: Key; en: string }> = [
  { key: 'join.ind.food', en: 'Restaurants and cafes' },
  { key: 'join.ind.fashion', en: 'Fashion and beauty' },
  { key: 'join.ind.retail', en: 'Retail and e-commerce' },
  { key: 'join.ind.tech', en: 'Technology' },
  { key: 'join.ind.realEstate', en: 'Real estate' },
  { key: 'join.ind.auto', en: 'Cars' },
  { key: 'join.ind.health', en: 'Health and fitness' },
  { key: 'join.ind.education', en: 'Education' },
  { key: 'join.ind.other', en: 'Other' },
];
/** What they would like to run with Peak Flexi: shown translated, sent as keys. */
const SERVICES: Array<{ value: string; label: Key }> = [
  { value: 'influencers', label: 'join.svc.influencers' },
  { value: 'ads', label: 'join.svc.ads' },
  { value: 'content', label: 'join.svc.content' },
  { value: 'social', label: 'join.svc.social' },
  { value: 'events', label: 'join.svc.events' },
  { value: 'design', label: 'join.svc.design' },
];
const ROLES: Array<{ value: string; label: Key }> = [
  { value: 'owner', label: 'join.role.owner' },
  { value: 'marketing', label: 'join.role.marketing' },
  { value: 'other', label: 'join.role.other' },
];

const label = 'mb-2 block text-sm font-semibold text-ink';
const input = `${control} h-12 bg-canvas/60`;

export function JoinForm({ lang }: { lang: Lang }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [services, setServices] = useState<string[]>([]);
  const [sent, setSent] = useState<{ name: string; phone: string } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = (k: string) => String(form.get(k) ?? '').trim();
    if (!get('company') || !get('name') || get('phone').replace(/\D/g, '').length < 6) {
      setError(t(lang, 'join.missing'));
      return;
    }
    setState('busy');
    setError(null);
    const industry = INDUSTRIES.find((i) => i.key === get('industry'));
    try {
      const response = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: get('company'), name: get('name'), phone: get('phone'), email: get('email') || null,
          industry: industry?.en ?? null, city: get('city') || null, role, crNumber: get('crNumber') || null, services, notes: get('notes') || null, website: get('website'),
        }),
      });
      if (response.ok) {
        setSent({ name: get('name'), phone: get('phone') });
        setState('done');
        return;
      }
      setError(t(lang, response.status === 429 ? 'join.throttled' : response.status === 400 ? 'join.invalid' : 'join.failed'));
    } catch {
      setError(t(lang, 'join.failed'));
    }
    setState('idle');
  }

  if (state === 'done' && sent) {
    return (
      <div role="status" className="flex h-full flex-col items-start justify-center gap-4 py-6">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-ink">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </span>
        <p className="text-[24px] font-extrabold leading-snug">{t(lang, 'join.doneTitle').replace('{name}', sent.name.split(' ')[0])}</p>
        <p className="max-w-md text-[16px] leading-relaxed text-ink-soft">{t(lang, 'join.doneBody').replace('{phone}', '⁨' + sent.phone + '⁩')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="j-company" className={label}>{t(lang, 'join.company')} <span className="text-accent">*</span></label>
        <input id="j-company" name="company" required maxLength={120} autoComplete="organization" className={input} />
      </div>
      <div>
        <label htmlFor="j-name" className={label}>{t(lang, 'join.name')} <span className="text-accent">*</span></label>
        <input id="j-name" name="name" required maxLength={80} autoComplete="name" className={input} />
      </div>
      <div>
        <label htmlFor="j-phone" className={label}>{t(lang, 'join.phone')} <span className="text-accent">*</span></label>
        <input id="j-phone" name="phone" type="tel" required maxLength={30} autoComplete="tel" inputMode="tel" dir="ltr" placeholder="+968" className={`${input} text-start`} />
      </div>
      <div>
        <label htmlFor="j-email" className={label}>{t(lang, 'join.email')}</label>
        <input id="j-email" name="email" type="email" maxLength={160} autoComplete="email" dir="ltr" className={`${input} text-start`} />
      </div>
      <div>
        <label htmlFor="j-industry" className={label}>{t(lang, 'join.industry')}</label>
        <select id="j-industry" name="industry" defaultValue="" className={input}>
          <option value="">{t(lang, 'join.choose')}</option>
          {INDUSTRIES.map((i) => <option key={i.key} value={i.key}>{t(lang, i.key)}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="j-city" className={label}>{t(lang, 'join.city')}</label>
        <input id="j-city" name="city" maxLength={60} autoComplete="address-level2" className={input} />
      </div>
      <div>
        <label htmlFor="j-cr" className={label}>{t(lang, 'join.cr')}</label>
        <input id="j-cr" name="crNumber" maxLength={40} inputMode="numeric" dir="ltr" className={`${input} text-start`} />
      </div>
      <fieldset className="sm:col-span-2">
        <legend className={label}>{t(lang, 'join.services')}</legend>
        <div className="flex flex-wrap gap-2">
          {SERVICES.map((v) => {
            const on = services.includes(v.value);
            return (
              <button key={v.value} type="button" aria-pressed={on} onClick={() => setServices(on ? services.filter((x) => x !== v.value) : [...services, v.value])}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors ${on ? 'border-accent bg-accent text-accent-ink' : 'border-white/[0.16] text-ink-soft hover:border-ink/50 hover:text-ink'}`}>
                {t(lang, v.label)}
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="sm:col-span-2">
        <legend className={label}>{t(lang, 'join.role')}</legend>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <button key={r.value} type="button" aria-pressed={role === r.value} onClick={() => setRole(role === r.value ? null : r.value)}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors ${role === r.value ? 'border-accent bg-accent text-accent-ink' : 'border-white/[0.16] text-ink-soft hover:border-ink/50 hover:text-ink'}`}>
              {t(lang, r.label)}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2">
        <label htmlFor="j-notes" className={label}>{t(lang, 'join.notes')}</label>
        <textarea id="j-notes" name="notes" rows={3} maxLength={1000} placeholder={t(lang, 'join.notesHint')} className={`${control} bg-canvas/60 py-3`} />
      </div>
      {/* People never see this field; form-filling bots do. */}
      <div aria-hidden="true" className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="j-website">Website</label>
        <input id="j-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-danger sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button type="submit" disabled={state === 'busy'} className={`${primaryButton} h-12 text-[16px] font-extrabold`}>
          {t(lang, state === 'busy' ? 'join.sending' : 'join.submit')}
        </button>
      </div>
    </form>
  );
}
