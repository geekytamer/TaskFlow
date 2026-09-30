'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { t, type Lang } from '@/lib/i18n';
import { primaryButton } from './field';
import { FilePicker, type UploadedFile } from './file-picker';

export interface ShortlistOption {
  id: string;
  name: string;
  detail: string;
}

const control =
  'w-full rounded-[10px] border border-field bg-surface px-3.5 text-[15px] text-ink transition-colors hover:border-ink/60 focus-visible:border-ink';

export function RequestForm({
  lang, currency, options, platforms, preselected,
}: { lang: Lang; currency: string; options: ShortlistOption[]; platforms: string[]; preselected: string[] }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(preselected.filter((id) => options.some((o) => o.id === id))));
  const [chosenPlatforms, setChosenPlatforms] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? options.filter((o) => `${o.name} ${o.detail}`.toLowerCase().includes(q)) : options;
  }, [filter, options]);

  const toggle = (set: Set<string>, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '').trim();
    const objective = String(form.get('objective') ?? '').trim();
    const budgetRaw = String(form.get('budget') ?? '').trim();
    const startDate = String(form.get('startDate') ?? '');
    const endDate = String(form.get('endDate') ?? '');

    const problems: string[] = [];
    if (title.length < 3 || title.length > 120) problems.push(t(lang, 'form.errTitle'));
    if (objective.length < 10) problems.push(t(lang, 'form.errObjective'));
    if (budgetRaw && (!Number.isFinite(Number(budgetRaw)) || Number(budgetRaw) < 0)) problems.push(t(lang, 'form.errBudget'));
    if (startDate && endDate && endDate < startDate) problems.push(t(lang, 'form.errDates'));
    setErrors(problems);
    if (problems.length) return;

    setBusy(true);
    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, objective,
          budget: budgetRaw ? Number(budgetRaw) : null,
          startDate: startDate || null,
          endDate: endDate || null,
          platforms: [...chosenPlatforms],
          influencerIds: [...chosen],
          fileIds: files.map((f) => f.id),
        }),
      });
      if (response.status === 201) {
        const created = (await response.json()) as { id: string };
        router.push(`/requests/${created.id}`);
        router.refresh();
        return;
      }
      setErrors([t(lang, 'form.errFailed')]);
    } catch {
      setErrors([t(lang, 'form.errFailed')]);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="title" className="block text-sm font-medium">{t(lang, 'form.title')}</label>
          <input id="title" name="title" required maxLength={120} placeholder={t(lang, 'form.titleHint')} className={`${control} h-11`} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="objective" className="block text-sm font-medium">{t(lang, 'form.objective')}</label>
          <textarea id="objective" name="objective" required rows={5} maxLength={4000} className={`${control} py-2.5 leading-relaxed`} aria-describedby="objective-hint" />
          <p id="objective-hint" className="text-sm text-ink-soft">{t(lang, 'form.objectiveHint')}</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="budget" className="block text-sm font-medium">{t(lang, 'form.budget')}</label>
          <div className="flex items-center gap-2">
            <input id="budget" name="budget" type="number" min={0} step="any" inputMode="decimal" className={`${control} h-11`} />
            <span className="text-sm font-medium text-ink-soft">{currency}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="startDate" className="block truncate text-sm font-medium">{t(lang, 'form.start')}</label>
            <input id="startDate" name="startDate" type="date" className={`${control} h-11`} />
          </div>
          <div className="space-y-2">
            <label htmlFor="endDate" className="block truncate text-sm font-medium">{t(lang, 'form.end')}</label>
            <input id="endDate" name="endDate" type="date" className={`${control} h-11`} />
          </div>
        </div>
      </div>

      {platforms.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t(lang, 'form.platforms')}</legend>
          <div className="flex flex-wrap gap-2">
            {platforms.map((p) => {
              const on = chosenPlatforms.has(p);
              return (
                <label key={p} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors ${on ? 'border-ink bg-ink text-white' : 'border-field bg-surface hover:border-ink/60'}`}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => setChosenPlatforms(toggle(chosenPlatforms, p))} />
                  <bdi>{p}</bdi>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {options.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t(lang, 'form.shortlist')}</legend>
          <label htmlFor="shortlist-filter" className="sr-only">{t(lang, 'form.shortlistFilter')}</label>
          <input id="shortlist-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t(lang, 'form.shortlistFilter')} className={`${control} h-10 max-w-sm`} />
          <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-surface">
            {visible.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-canvas">
                  <input type="checkbox" checked={chosen.has(o.id)} onChange={() => setChosen(toggle(chosen, o.id))} className="h-4 w-4 accent-[var(--accent)]" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{o.name}</span>
                    {o.detail && <span className="block truncate text-sm text-ink-soft">{o.detail}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t(lang, 'form.files')}</legend>
        <FilePicker lang={lang} files={files} onChange={setFiles} disabled={busy} />
      </fieldset>

      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm text-danger">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      <button type="submit" disabled={busy} className={`${primaryButton} md:w-auto md:px-8`}>
        {busy ? t(lang, 'form.submitting') : t(lang, 'form.submit')}
      </button>
    </form>
  );
}
