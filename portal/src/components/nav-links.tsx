'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export interface NavItem {
  href: string;
  label: string;
}

export function NavLinks({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
  const list = useRef<HTMLUListElement>(null);
  const [hidden, setHidden] = useState({ start: false, end: false });

  // On a phone the links scroll sideways. Keep the current page in view, and fade
  // the edges that hide more links, so they read as reachable.
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    el.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    // scrollLeft runs negative in right-to-left layouts; its size is the distance from the start.
    const update = () => {
      const fromStart = Math.abs(el.scrollLeft);
      setHidden({ start: fromStart > 4, end: el.scrollWidth - el.clientWidth - fromStart > 4 });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [pathname]);

  // Fade whichever edge has links scrolled out of view, in the page's direction.
  const gradient = hidden.start || hidden.end
    ? `linear-gradient(to var(--nav-end), ${hidden.start ? 'transparent, #000 20%' : '#000'}, ${hidden.end ? '#000 80%, transparent' : '#000'})`
    : undefined;
  const fade = gradient ? { maskImage: gradient, WebkitMaskImage: gradient } : undefined;

  return (
    <nav aria-label={label}>
      <ul ref={list} style={fade} className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center whitespace-nowrap rounded-md px-3 sm:min-h-0 sm:py-1.5 text-sm font-medium transition-colors ${
                  active ? 'bg-canvas text-ink' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
