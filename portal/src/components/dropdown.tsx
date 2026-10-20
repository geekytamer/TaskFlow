'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

/**
 * A filter list drawn in Peak's own style, for wide screens (phones keep the
 * native picker, which suits a thumb better). Opens with a short fade and
 * drop, a soft orange highlight slides to the option under the pointer or
 * the arrow keys, and each option can carry a count; an option with none is
 * dimmed and cannot be picked, so no choice leads to an empty page.
 * Keyboard: arrows, Home/End, Enter or Space to pick, Escape to close, and
 * typing jumps to an option. Built as a listbox for screen readers.
 */

export interface DropdownOption { value: string; label: string; count?: number }

export function Dropdown({ id, label, value, options, anyLabel, onChange, hideLabel = false }: {
  id: string; label: string; value: string; options: DropdownOption[]; anyLabel?: string; onChange: (v: string) => void; hideLabel?: boolean;
}) {
  const all: DropdownOption[] = anyLabel === undefined ? options : [{ value: '', label: anyLabel }, ...options];
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const listId = useId();
  const selected = all.find((o) => o.value === value) ?? all[0];
  const disabled = (o: DropdownOption) => o.value !== '' && o.value !== value && o.count === 0;

  const close = () => {
    if (!open) return;
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); }, 110);
  };
  const show = () => { setActive(Math.max(0, all.findIndex((o) => o.value === value))); setOpen(true); };
  const pick = (o: DropdownOption) => { if (disabled(o)) return; onChange(o.value); close(); };

  // A click anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  });

  // The highlight slides to the active option, and the option scrolls into view.
  useLayoutEffect(() => {
    if (!open) return;
    const item = list.current?.children[active + 1] as HTMLElement | undefined;
    if (!item || !bar.current) return;
    bar.current.style.transform = `translateY(${item.offsetTop}px)`;
    bar.current.style.height = `${item.offsetHeight}px`;
    item.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const step = (from: number, dir: 1 | -1) => {
    let i = from;
    for (let n = 0; n < all.length; n++) { i = (i + dir + all.length) % all.length; if (!disabled(all[i])) return i; }
    return from;
  };

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => step(i, 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => step(i, -1)); return; }
    if (e.key === 'Home') { e.preventDefault(); setActive(0); return; }
    if (e.key === 'End') { e.preventDefault(); setActive(step(0, -1)); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(all[active]); return; }
    if (e.key === 'Tab') { close(); return; }
    if (e.key.length === 1) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now };
      const hit = all.findIndex((o) => !disabled(o) && o.label.toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    }
  };

  return (
    <div ref={root} className="relative min-w-0 space-y-1.5">
      <span id={`${id}-label`} className={hideLabel ? 'sr-only' : 'block truncate text-sm font-medium text-ink-soft'}>{label}</span>
      <button id={id} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
        aria-labelledby={`${id}-label ${id}`} aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        onClick={() => (open ? close() : show())} onKeyDown={onKey}
        className={`flex h-11 w-full items-center gap-2 rounded-control border bg-surface pe-3 ps-3 text-start text-[15px] text-ink transition-colors hover:border-ink/60 ${value && anyLabel !== undefined ? 'border-ink/50' : 'border-field'} ${open ? 'border-ink/70' : ''}`}>
        <span className="min-w-0 flex-1 truncate"><bdi>{selected.label}</bdi></span>
        <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-4 w-4 shrink-0 text-ink-soft transition-transform duration-200 ${open && !closing ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      {open && (
        <ul ref={list} id={listId} role="listbox" aria-labelledby={`${id}-label`}
          className={`dd-panel absolute inset-x-0 top-full z-40 mt-1.5 max-h-72 overflow-y-auto overscroll-contain rounded-[12px] border border-line bg-surface-2 p-1.5 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.85)] ${closing ? 'dd-closing' : ''}`}>
          <span ref={bar} aria-hidden="true" className="dd-bar pointer-events-none absolute inset-x-1.5 top-0 rounded-[8px] bg-accent/[0.12]" />
          {all.map((o, i) => {
            const isSel = o.value === value;
            const off = disabled(o);
            return (
              <li key={o.value || 'any'} id={`${id}-opt-${i}`} role="option" aria-selected={isSel} aria-disabled={off || undefined}
                onMouseEnter={() => { if (!off) setActive(i); }} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}
                className={`relative flex min-h-10 cursor-pointer items-center gap-2 rounded-[8px] px-3 text-[15px] ${off ? 'cursor-not-allowed text-ink-soft/50' : isSel ? 'font-semibold text-accent' : 'text-ink'}`}>
                <span className="min-w-0 flex-1 truncate"><bdi>{o.label}</bdi></span>
                {o.count !== undefined && o.value !== '' && <span className="shrink-0 text-xs tabular-nums text-ink-soft">{o.count}</span>}
                <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-4 w-4 shrink-0 text-accent ${isSel ? 'opacity-100' : 'opacity-0'}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
