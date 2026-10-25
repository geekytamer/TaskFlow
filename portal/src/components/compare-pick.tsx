'use client';

import Link from 'next/link';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { MAX_COMPARE } from '@/lib/compare';
import { t, type Lang } from '@/lib/i18n';
import { useShortlist } from './shortlist';

/**
 * Picking creators to compare from the directory: a "Compare" toggle on each
 * card and a floating button that opens the comparison with them. The picks
 * live for the browser tab (sessionStorage), so moving between pages keeps
 * them; at most three.
 */

const KEY = 'peak-compare';
const Ctx = createContext<{ ids: string[]; toggle: (id: string) => void } | null>(null);

export function CompareProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(KEY) ?? '[]'); if (Array.isArray(saved)) setIds(saved.filter((x) => typeof x === 'string').slice(0, MAX_COMPARE)); } catch { /* storage may be off */ }
  }, []);
  const toggle = (id: string) => setIds((prev) => {
    const next = prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_COMPARE ? prev : [...prev, id];
    try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage may be off */ }
    return next;
  });
  return <Ctx.Provider value={{ ids, toggle }}>{children}</Ctx.Provider>;
}

export function CompareButton({ id, name, lang }: { id: string; name: string; lang: Lang }) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  const on = ctx.ids.includes(id);
  const full = !on && ctx.ids.length >= MAX_COMPARE;
  return (
    <button type="button" onClick={() => ctx.toggle(id)} aria-pressed={on} disabled={full}
      aria-label={`${t(lang, on ? 'cmp.removeFrom' : 'cmp.addTo')}: ${name}`} title={full ? t(lang, 'cmp.full') : undefined}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'bg-ink text-canvas' : 'border border-white/[0.16] text-ink-soft hover:border-ink/50 hover:text-ink'}`}>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4v12M13 4v12M3 8l4-4 4 4M17 12l-4 4-4-4" /></svg>
      {t(lang, 'cmp.button')}
    </button>
  );
}

/** Floats above the bottom bar (and above the shortlist bar when it shows). */
export function CompareTray({ lang }: { lang: Lang }) {
  const ctx = useContext(Ctx);
  const shortlist = useShortlist();
  if (!ctx || ctx.ids.length === 0) return null;
  const lifted = shortlist.ids.length > 0;
  const href = `/influencers/compare?${ctx.ids.map((id) => `ids=${encodeURIComponent(id)}`).join('&')}`;
  return (
    <Link href={href}
      className={`chip-in fixed end-4 z-30 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-extrabold text-canvas shadow-[0_18px_40px_-12px_rgb(0_0_0/0.85)] transition-[bottom] duration-200 lg:end-8 ${lifted ? 'bottom-[calc(env(safe-area-inset-bottom)+10rem)] lg:bottom-28' : 'bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:bottom-8'}`}>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4v12M13 4v12M3 8l4-4 4 4M17 12l-4 4-4-4" /></svg>
      {t(lang, 'cmp.tray').replace('{n}', String(ctx.ids.length))}
    </Link>
  );
}
