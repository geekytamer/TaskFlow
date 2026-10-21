'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { button } from '@/components/ui';
import { t, type Lang } from '@/lib/i18n';
import { hrefWithShortlist, parseShortlist, shortlistHref, toggleShortlist } from '@/lib/shortlist';

/**
 * The catalogue's shortlist lives in the browser. Choosing used to be a link
 * to the same page with a new `with=`, so every tap re-rendered the whole
 * server page (catalogue fetch, every photo) and taps made while one was
 * pending were dropped. Now a tap toggles at once and the URL follows with
 * history.replaceState, so a reload or a shared link keeps the shortlist.
 */
interface ShortlistState {
  ids: string[];
  toggle(id: string): void;
  /** Adds several at once (a suggested group); ones already chosen stay. */
  addMany(ids: string[]): void;
  clear(): void;
}

const ShortlistContext = createContext<ShortlistState | null>(null);

export function useShortlist(): ShortlistState {
  const state = useContext(ShortlistContext);
  if (!state) throw new Error('Shortlist components must sit inside <ShortlistProvider>.');
  return state;
}

function syncUrl(ids: string[]) {
  const here = `${window.location.pathname}${window.location.search}`;
  const next = hrefWithShortlist(here, ids);
  if (next !== here) window.history.replaceState(window.history.state, '', `${next}${window.location.hash}`);
}

export function ShortlistProvider({ initial, children }: { initial: string[]; children: ReactNode }) {
  const [ids, setIds] = useState(() => parseShortlist(initial));
  // Functional updates, so taps landing before the next render each count.
  const toggle = useCallback((id: string) => setIds((prev) => parseShortlist(toggleShortlist(prev, id))), []);
  const clear = useCallback(() => setIds([]), []);
  const addMany = useCallback((more: string[]) => setIds((prev) => parseShortlist([...prev, ...more.filter((id) => !prev.includes(id))])), []);
  useEffect(() => { syncUrl(ids); }, [ids]);
  // Back/Forward lands on a URL whose `with` may differ from what is held here: the URL wins.
  useEffect(() => {
    const fromUrl = () => setIds(parseShortlist(new URLSearchParams(window.location.search).getAll('with')));
    window.addEventListener('popstate', fromUrl);
    return () => window.removeEventListener('popstate', fromUrl);
  }, []);
  const value = useMemo<ShortlistState>(() => ({ ids, toggle, addMany, clear }), [ids, toggle, addMany, clear]);
  return <ShortlistContext.Provider value={value}>{children}</ShortlistContext.Provider>;
}

/** The shortlist as hidden fields, so applying filters keeps it. */
export function ShortlistInputs() {
  const { ids } = useShortlist();
  return <>{ids.map((id) => <input key={id} type="hidden" name="with" value={id} />)}</>;
}

/** A catalogue link (view switch, Clear filters) that carries the current shortlist. */
export function ShortlistLink({ href, className, children, ...rest }: {
  href: string; className?: string; children: ReactNode; 'aria-current'?: 'true';
}) {
  const { ids } = useShortlist();
  return <Link href={hrefWithShortlist(href, ids)} scroll={false} className={className} {...rest}>{children}</Link>;
}

/** One card or row; highlighted while chosen. */
export function ShortlistItem({ id, className, chosenClassName, children }: {
  id: string; className: string; chosenClassName: string; children: ReactNode;
}) {
  const { ids } = useShortlist();
  return <li className={`${className} ${ids.includes(id) ? chosenClassName : ''}`}>{children}</li>;
}

export function ChooseButton({ id, name, lang, unavailable = false }: { id: string; name: string; lang: Lang; unavailable?: boolean }) {
  const { ids, toggle } = useShortlist();
  const chosen = ids.includes(id);
  // Marked unavailable by Peak: shown so the client knows them, but not choosable.
  if (unavailable && !chosen) {
    return (
      <span aria-disabled="true" className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-control border border-line px-3 text-sm font-medium text-ink-soft">
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="8" cy="8" r="5.5" /><path d="m4.2 11.8 7.6-7.6" /></svg>
        {t(lang, 'dir.unavailableLock')}
      </span>
    );
  }
  return (
    <button type="button" onClick={() => toggle(id)} aria-pressed={chosen}
      aria-label={`${t(lang, chosen ? 'cat.removeShortlist' : 'cat.addShortlist')}: ${name}`}
      className={`inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium transition-colors duration-100 ${chosen ? 'bg-accent text-accent-ink' : 'border border-field hover:bg-surface-2'}`}>
      <span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded-[4px] border ${chosen ? 'border-accent-ink' : 'border-field bg-surface'}`}>
        {chosen && <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>}
      </span>
      {t(lang, chosen ? 'cat.chosen' : 'cat.choose')}
    </button>
  );
}

/** The sticky "N chosen — Request with these" bar. */
export function ShortlistBar({ lang }: { lang: Lang }) {
  const { ids, clear } = useShortlist();
  if (ids.length === 0) return null;
  return (
    <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-20 lg:bottom-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface p-3 shadow-float sm:px-5">
        <p role="status" className="text-[15px] font-medium">
          {t(lang, ids.length === 1 ? 'cat.chosenOne' : 'cat.chosenMany').replace('{n}', String(ids.length))}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={clear} className={button.ghost}>{t(lang, 'cat.clearShortlist')}</button>
          <Link href={shortlistHref(ids)} className={button.primary}>{t(lang, 'cat.requestWith')}</Link>
        </div>
      </div>
    </div>
  );
}
