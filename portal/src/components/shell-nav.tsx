'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t, type Lang } from '@/lib/i18n';
import { isActive, type NavEntry } from '@/lib/nav';
import { NavIcon } from './nav-icon';

export type Badges = Partial<Record<string, number>>;

function Count({ n, lang }: { n?: number; lang: Lang }) {
  if (!n) return null;
  return (
    <span className="ms-auto inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-ink">
      <bdi>{n > 99 ? '99+' : n}</bdi><span className="sr-only"> {t(lang, 'nav.waiting')}</span>
    </span>
  );
}

/** Desktop sidebar links: main pages, then the less frequent ones. */
export function SidebarNav({ lang, primary, secondary, badges }: { lang: Lang; primary: NavEntry[]; secondary: NavEntry[]; badges: Badges }) {
  const pathname = usePathname();
  const item = (e: NavEntry) => {
    const active = isActive(e.href, pathname);
    return (
      <li key={e.href}>
        <Link
          href={e.href}
          aria-current={active ? 'page' : undefined}
          className={`flex min-h-10 items-center gap-3 rounded-control px-3 text-[15px] font-medium transition-colors ${active ? 'bg-accent/10 text-accent' : 'text-ink-soft hover:bg-ink/5 hover:text-ink'}`}
        >
          <NavIcon name={e.icon} className="h-5 w-5 shrink-0" />
          <span className="truncate">{t(lang, e.label)}</span>
          <Count n={badges[e.href]} lang={lang} />
        </Link>
      </li>
    );
  };
  return (
    <nav aria-label={t(lang, 'nav.label')} className="space-y-6">
      <ul className="space-y-0.5">{primary.map(item)}</ul>
      <ul className="space-y-0.5 border-t border-line pt-6">{secondary.map(item)}</ul>
    </nav>
  );
}

/**
 * Phones: four tabs and More, fixed to the bottom, clear of the home indicator.
 * More opens a sheet with every other page, the account and sign out.
 */
export function BottomBar({ lang, bar, more, badges, account }: { lang: Lang; bar: NavEntry[]; more: NavEntry[]; badges: Badges; account: ReactNode }) {
  const pathname = usePathname();
  const sheet = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const moreActive = more.some((e) => isActive(e.href, pathname));

  // Navigating from the sheet closes it.
  useEffect(() => { sheet.current?.close(); }, [pathname]);

  const tab = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors';
  return (
    <>
      <nav aria-label={t(lang, 'nav.label')} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-float lg:hidden">
        <ul className="mx-auto flex max-w-xl">
          {bar.map((e) => {
            const active = isActive(e.href, pathname);
            return (
              <li key={e.href} className="flex flex-1">
                <Link href={e.href} aria-current={active ? 'page' : undefined} className={`${tab} relative ${active ? 'text-accent' : 'text-ink-soft'}`}>
                  <NavIcon name={e.icon} className="h-6 w-6" />
                  <span className={active ? 'font-semibold' : ''}>{t(lang, e.label)}</span>
                  {badges[e.href] ? (
                    <span className="absolute top-1.5 ms-6 inline-flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-accent-ink">
                      <bdi>{badges[e.href]! > 9 ? '9+' : badges[e.href]}</bdi><span className="sr-only"> {t(lang, 'nav.waiting')}</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => sheet.current?.showModal()} className={`${tab} ${moreActive ? 'text-accent' : 'text-ink-soft'}`}>
              <NavIcon name="more" className="h-6 w-6" />
              <span className={moreActive ? 'font-semibold' : ''}>{t(lang, 'nav.more')}</span>
            </button>
          </li>
        </ul>
      </nav>

      <dialog
        ref={sheet}
        aria-label={t(lang, 'nav.more')}
        onClose={() => setOpen(false)}
        onCancel={() => setOpen(false)}
        onClick={(e) => { if (e.target === sheet.current) sheet.current?.close(); }}
        onToggle={() => setOpen(Boolean(sheet.current?.open))}
        className="m-0 mt-auto w-full max-w-none rounded-t-[16px] bg-surface p-0 text-ink backdrop:bg-ink/40 open:flex open:flex-col lg:hidden"
      >
        <div className="max-h-[80dvh] overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden="true" />
          <ul className="divide-y divide-line">
            {more.map((e) => {
              const active = isActive(e.href, pathname);
              return (
                <li key={e.href}>
                  <Link href={e.href} aria-current={active ? 'page' : undefined} onClick={() => sheet.current?.close()}
                    className={`flex min-h-12 items-center gap-3 px-1 text-[15px] font-medium ${active ? 'text-accent' : 'text-ink'}`}>
                    <NavIcon name={e.icon} className="h-5 w-5 text-ink-soft" />
                    <span>{t(lang, e.label)}</span>
                    <Count n={badges[e.href]} lang={lang} />
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 border-t border-line pt-4">{account}</div>
          <form method="dialog" className="mt-3">
            <button type="submit" className="inline-flex h-11 w-full items-center justify-center rounded-control border border-field text-[15px] font-semibold">{t(lang, 'nav.close')}</button>
          </form>
        </div>
      </dialog>
    </>
  );
}
