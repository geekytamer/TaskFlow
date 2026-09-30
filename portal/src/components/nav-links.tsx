'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  href: string;
  label: string;
}

export function NavLinks({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label={label}>
      <ul className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`block whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
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
