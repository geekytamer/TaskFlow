'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { t, type Key, type Lang } from '@/lib/i18n';
import { FilePicker, type UploadedFile } from './file-picker';

/**
 * Asking for a campaign, in three short steps (after the brief on
 * brief.peak-creative.agency): what you want to achieve, what you need from
 * Peak, then budget, payment and timing. Choices are cards, not blank boxes.
 * The answers go to the existing request API: the goal names the request,
 * every answer is written into the brief Peak reads, and the budget sent is
 * the exact figure if given, else the middle of the chosen range (Peak uses
 * it as the expected value of the opportunity).
 */

export interface ShortlistOption { id: string; name: string; detail: string }

const GOALS: Array<{ id: string; icon: string }> = [
  { id: 'sales', icon: 'M4 19V9m6 10V5m6 14v-7m4 7H2' },
  { id: 'awareness', icon: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
  { id: 'launch', icon: 'M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2m-1-4 4 4M14 4c3-1 6 0 6 0s1 3 0 6l-7 7-6-6z' },
  { id: 'visits', icon: 'M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
  { id: 'social', icon: 'M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0zM3 7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z' },
  { id: 'other', icon: 'M12 8v8m-4-4h8M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z' },
];
const SERVICES = ['influencers', 'content', 'social', 'ads', 'event', 'design'] as const;
/** Budget ranges: [min, max] (max null = open), and the figure sent as the expected value. */
const BUDGETS: Array<{ id: string; min: number | null; max: number | null; estimate: number }> = [
  { id: 'r1', min: null, max: 800, estimate: 600 },
  { id: 'r2', min: 800, max: 1200, estimate: 1000 },
  { id: 'r3', min: 1200, max: 2500, estimate: 1850 },
  { id: 'r4', min: 2500, max: 5000, estimate: 3750 },
  { id: 'r5', min: 5000, max: null, estimate: 5000 },
];

const display = { fontFamily: 'var(--font-display), var(--font-latin), var(--font-arabic), sans-serif' };
const field = 'w-full rounded-[14px] border border-white/[0.16] bg-canvas/60 px-4 text-[15px] text-ink transition-colors hover:border-ink/50 focus-visible:border-ink';
const choice = (on: boolean) => `text-start transition-[border-color,background-color,transform] duration-150 ${on ? 'border-[1.5px] border-accent bg-accent/[0.12]' : 'border border-white/[0.12] bg-canvas/60 hover:border-ink/40'}`;

export function RequestWizard({ lang, currency, options, platforms, preselected }: {
  lang: Lang; currency: string; options: ShortlistOption[]; platforms: string[]; preselected: string[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<string | null>(null);
  const [audience, setAudience] = useState('');
  const [name, setName] = useState('');
  const [services, setServices] = useState<Set<string>>(() => new Set(['influencers']));
  const [chosenPlatforms, setChosenPlatforms] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(preselected.filter((id) => options.some((o) => o.id === id))));
  const [filter, setFilter] = useState('');
  const [budget, setBudget] = useState<string | null>(null);
  const [exact, setExact] = useState('');
  const [pay, setPay] = useState<'once' | 'flexi'>('once');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const num = (n: number) => new Intl.NumberFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-OM').format(n);
  const rangeLabel = (b: (typeof BUDGETS)[number]) =>
    b.min === null ? t(lang, 'wiz.under').replace('{a}', `${num(b.max!)} ${currency}`)
      : b.max === null ? t(lang, 'wiz.over').replace('{a}', `${num(b.min)} ${currency}`)
        : t(lang, 'wiz.between').replace('{a}', num(b.min)).replace('{b}', `${num(b.max)} ${currency}`);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? options.filter((o) => `${o.name} ${o.detail}`.toLowerCase().includes(q)) : options;
  }, [filter, options]);

  const toggle = (set: Set<string>, value: string) => { const next = new Set(set); if (next.has(value)) next.delete(value); else next.add(value); return next; };
  const exactNumber = Number(exact);
  const exactOk = exact.trim() !== '' && Number.isFinite(exactNumber) && exactNumber > 0;
  const ready = step === 1 ? Boolean(goal) : step === 2 ? services.size > 0 : Boolean(budget) || exactOk;
  const datesOk = !startDate || !endDate || endDate >= startDate;

  async function submit() {
    if (!goal || !datesOk) { setError(t(lang, 'form.errDates')); return; }
    const range = BUDGETS.find((b) => b.id === budget);
    const goalLabel = t(lang, `wiz.goal.${goal}` as Key);
    const title = (name.trim() || goalLabel).slice(0, 120);
    // Everything the client chose, in their language, for Peak to read.
    const lines = [
      `${t(lang, 'wiz.sumGoal')}: ${goalLabel}`,
      audience.trim() && `${t(lang, 'wiz.sumAudience')}: ${audience.trim()}`,
      `${t(lang, 'wiz.sumServices')}: ${[...services].map((s) => t(lang, `wiz.svc.${s}` as Key)).join(lang === 'ar' ? '، ' : ', ')}`,
      exactOk ? `${t(lang, 'wiz.sumBudget')}: ${num(exactNumber)} ${currency}` : range && `${t(lang, 'wiz.sumBudget')}: ${rangeLabel(range)}`,
      `${t(lang, 'wiz.sumPay')}: ${t(lang, pay === 'once' ? 'wiz.pay.once' : 'wiz.pay.flexi')}`,
      notes.trim() && `${t(lang, 'wiz.sumNotes')}: ${notes.trim()}`,
    ].filter(Boolean).join('\n');
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.length >= 3 ? title : `${title} ${t(lang, 'wiz.campaign')}`,
          objective: lines.slice(0, 4000),
          budget: exactOk ? exactNumber : range ? range.estimate : null,
          startDate: startDate || null,
          endDate: endDate || null,
          platforms: [...chosenPlatforms],
          influencerIds: services.has('influencers') ? [...chosen] : [],
          fileIds: files.map((f) => f.id),
        }),
      });
      if (response.status === 201) {
        const created = (await response.json()) as { id: string };
        router.push(`/requests/${created.id}`);
        router.refresh();
        return;
      }
      setError(t(lang, 'form.errFailed'));
    } catch {
      setError(t(lang, 'form.errFailed'));
    }
    setBusy(false);
  }

  const stepNames = ['', t(lang, 'wiz.stepGoal'), t(lang, 'wiz.stepNeeds'), t(lang, 'wiz.stepBudget')];

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-white/[0.08] card-surface shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)]">
      <div className="space-y-3 border-b border-white/[0.08] px-5 py-4 sm:px-7">
        <div className="flex justify-between text-sm text-ink-soft">
          <span>{t(lang, 'wiz.stepOf').replace('{n}', String(step))}</span>
          <span>{stepNames[step]}</span>
        </div>
        <div className="flex gap-1.5" aria-hidden="true">
          {[1, 2, 3].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-accent' : 'bg-ink/[0.12]'}`} />)}
        </div>
      </div>

      <div key={step} className="page-enter space-y-6 px-5 py-6 sm:px-7 sm:py-7">
        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <h2 className="text-[26px] font-extrabold">{t(lang, 'wiz.goalTitle')}</h2>
              <p className="text-[15px] text-ink-soft">{t(lang, 'wiz.goalHint')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {GOALS.map((g) => {
                const on = goal === g.id;
                return (
                  <button key={g.id} type="button" aria-pressed={on} onClick={() => setGoal(g.id)}
                    className={`flex min-h-[7.5rem] flex-col items-start gap-3 rounded-[18px] p-4 ${choice(on)}`}>
                    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${on ? 'bg-accent text-accent-ink' : 'bg-ink/[0.06] text-accent'}`}>
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={g.icon} /></svg>
                    </span>
                    <span className="text-[15px] font-bold leading-snug" style={display}>{t(lang, `wiz.goal.${g.id}` as Key)}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="wiz-audience" className="block text-sm font-semibold">{t(lang, 'wiz.audience')}</label>
                <input id="wiz-audience" value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={300} placeholder={t(lang, 'wiz.audienceHint')} className={`${field} h-12`} />
              </div>
              <div className="space-y-2">
                <label htmlFor="wiz-name" className="block text-sm font-semibold">{t(lang, 'wiz.name')}</label>
                <input id="wiz-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={t(lang, 'form.titleHint')} className={`${field} h-12`} />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <h2 className="text-[26px] font-extrabold">{t(lang, 'wiz.needsTitle')}</h2>
              <p className="text-[15px] text-ink-soft">{t(lang, 'wiz.needsHint')}</p>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {SERVICES.map((s) => {
                const on = services.has(s);
                return (
                  <button key={s} type="button" aria-pressed={on} onClick={() => setServices(toggle(services, s))}
                    className={`flex min-h-16 items-center gap-3.5 rounded-2xl px-4 py-3 ${choice(on)}`}>
                    <span aria-hidden="true" className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] ${on ? 'bg-accent text-accent-ink' : 'border-[1.5px] border-ink/30'}`}>
                      {on && <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-bold" style={display}>{t(lang, `wiz.svc.${s}` as Key)}</span>
                      <span className="block text-sm text-ink-soft">{t(lang, `wiz.svcHint.${s}` as Key)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {services.has('influencers') && (
              <div className="space-y-5 rounded-[20px] border border-white/[0.08] bg-canvas/40 p-4 sm:p-5">
                {platforms.length > 0 && (
                  <fieldset className="space-y-3">
                    <legend className="text-sm font-semibold">{t(lang, 'form.platforms')}</legend>
                    <div className="flex flex-wrap gap-2">
                      {platforms.map((p) => {
                        const on = chosenPlatforms.has(p);
                        return (
                          <button key={p} type="button" aria-pressed={on} onClick={() => setChosenPlatforms(toggle(chosenPlatforms, p))}
                            className={`inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold ${on ? 'bg-accent text-accent-ink' : 'border border-white/[0.16] hover:border-ink/50'}`}>
                            <bdi>{p}</bdi>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
                {options.length > 0 && (
                  <fieldset className="space-y-3">
                    <legend className="text-sm font-semibold">
                      {t(lang, 'form.shortlist')}{chosen.size > 0 && <span className="ms-2 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-ink"><bdi>{chosen.size}</bdi></span>}
                    </legend>
                    <label htmlFor="wiz-filter" className="sr-only">{t(lang, 'form.shortlistFilter')}</label>
                    <input id="wiz-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t(lang, 'form.shortlistFilter')} className={`${field} h-11`} />
                    <ul className="max-h-72 divide-y divide-white/[0.07] overflow-y-auto overscroll-contain rounded-2xl border border-white/[0.08]">
                      {visible.map((o) => (
                        <li key={o.id}>
                          <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-3 hover:bg-ink/[0.04]">
                            <input type="checkbox" checked={chosen.has(o.id)} onChange={() => setChosen(toggle(chosen, o.id))} className="h-5 w-5 accent-[var(--accent)]" />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold"><bdi>{o.name}</bdi></span>
                              {o.detail && <span className="block truncate text-sm text-ink-soft">{o.detail}</span>}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                )}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <h2 className="text-[26px] font-extrabold">{t(lang, 'wiz.budgetTitle')}</h2>
              <p className="text-[15px] text-ink-soft">{t(lang, 'wiz.budgetHint')}</p>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {BUDGETS.map((b) => {
                const on = budget === b.id && !exactOk;
                return (
                  <button key={b.id} type="button" aria-pressed={on} onClick={() => { setBudget(b.id); setExact(''); }}
                    className={`flex flex-col items-start gap-0.5 rounded-2xl px-4 py-3.5 ${choice(on)}`}>
                    <span className="text-[17px] font-extrabold" style={display}><bdi>{rangeLabel(b)}</bdi></span>
                    <span className="text-sm text-ink-soft">{t(lang, `wiz.budgetHint.${b.id}` as Key)}</span>
                  </button>
                );
              })}
              <div className="space-y-1.5 rounded-2xl border border-dashed border-white/[0.16] px-4 py-3">
                <label htmlFor="wiz-exact" className="block text-sm font-semibold">{t(lang, 'wiz.exact')}</label>
                <div className="relative">
                  <input id="wiz-exact" type="text" inputMode="numeric" dir="ltr" value={exact} onChange={(e) => setExact(e.target.value.replace(/[^\d]/g, '').slice(0, 8))}
                    className={`${field} h-11 pl-3 pr-14 tabular-nums`} placeholder="2000" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft">{currency}</span>
                </div>
              </div>
            </div>
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">{t(lang, 'wiz.payTitle')}</legend>
              <div className="grid grid-cols-2 gap-2.5">
                {(['once', 'flexi'] as const).map((p) => (
                  <button key={p} type="button" aria-pressed={pay === p} onClick={() => setPay(p)}
                    className={`flex h-14 items-center justify-center rounded-2xl text-[15px] font-bold ${choice(pay === p)}`}>
                    {t(lang, p === 'once' ? 'wiz.pay.once' : 'wiz.pay.flexi')}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label htmlFor="wiz-start" className="block truncate text-sm font-semibold">{t(lang, 'form.start')}</label>
                <input id="wiz-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${field} h-12`} />
              </div>
              <div className="space-y-2">
                <label htmlFor="wiz-end" className="block truncate text-sm font-semibold">{t(lang, 'form.end')}</label>
                <input id="wiz-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${field} h-12`} />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="wiz-notes" className="block text-sm font-semibold">{t(lang, 'wiz.notes')}</label>
              <textarea id="wiz-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder={t(lang, 'wiz.notesHint')} className={`${field} py-3 leading-relaxed`} />
            </div>
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">{t(lang, 'form.files')}</legend>
              <FilePicker lang={lang} files={files} onChange={setFiles} disabled={busy} />
            </fieldset>
          </div>
        )}

        {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
      </div>

      <div className={`grid gap-3 px-5 pb-6 sm:px-7 ${step > 1 ? 'grid-cols-[1fr_2fr]' : 'grid-cols-1'}`}>
        {step > 1 && (
          <button type="button" onClick={() => setStep(step - 1)} disabled={busy}
            className="h-[52px] rounded-[14px] border border-white/[0.18] text-[15px] font-semibold transition-colors hover:border-ink/50">{t(lang, 'wiz.back')}</button>
        )}
        <button type="button" disabled={!ready || busy} onClick={() => (step < 3 ? setStep(step + 1) : submit())}
          className="h-[52px] rounded-[14px] bg-accent text-base font-extrabold text-accent-ink transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-ink/[0.08] disabled:text-ink-soft">
          {step < 3 ? t(lang, 'wiz.next') : busy ? t(lang, 'form.submitting') : t(lang, 'form.submit')}
        </button>
      </div>
    </section>
  );
}
