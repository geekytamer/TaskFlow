'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { useI18n } from '@/context/i18n-context';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { NAV_SECTIONS, useInboxWaiting, useNavAccess } from './sidebar-nav';
import { useTeamUnread } from '@/modules/teamchat/use-team-unread';

/** Most-used screens first; the bar shows the first four this person can open. */
const TAB_CANDIDATES = ['/', '/inbox', '/tasks', '/sales', '/crm/followups', '/contacts', '/projects'];

const ITEMS = new Map(NAV_SECTIONS.flatMap((s) => s.items.map((item) => [item.href, item] as const)));

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * On a phone, the screens people use every day sit under the thumb, and
 * "More" opens the full menu. Hidden on wider screens, where the sidebar shows.
 */
export function MobileTabBar() {
  const isMobile = useIsMobile();
  const pathname = usePathname() ?? '/';
  const { t, language } = useI18n();
  const { ready, effectiveRole, canSee, isLocked } = useNavAccess();
  // Only the phone bar polls; on wider screens the sidebar does.
  const inboxWaiting = useInboxWaiting(effectiveRole, isMobile);
  const teamUnread = useTeamUnread(isMobile);
  const { openMobile, setOpenMobile } = useSidebar();

  if (!isMobile || !ready) return null;

  const tabs = TAB_CANDIDATES.filter((href) => canSee(href) && !isLocked(href)).slice(0, 4);
  const onTab = tabs.some((href) => isActive(pathname, href));
  const label = (href: string, key: string) =>
    href === '/' ? (language === 'ar' ? 'الرئيسية' : 'Home') : t(key);

  return (
    <nav
      aria-label={language === 'ar' ? 'التنقل الرئيسي' : 'Main'}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-card/85"
    >
      <ul className="grid h-16" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
        {tabs.map((href) => {
          const item = ITEMS.get(href)!;
          const Icon = item.icon;
          const active = isActive(pathname, href) && !openMobile;
          const badge = href === '/inbox' ? inboxWaiting + teamUnread : 0;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground active:text-foreground',
                )}
              >
                <span className="relative">
                  <Icon className={cn('h-5 w-5', active && 'stroke-[2.5]')} />
                  {badge > 0 && (
                    <span className="absolute -end-2.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate px-1">{label(href, item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setOpenMobile(!openMobile)}
            aria-expanded={openMobile}
            className={cn(
              'flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
              openMobile || !onTab ? 'text-primary' : 'text-muted-foreground active:text-foreground',
            )}
          >
            <Menu className="h-5 w-5" />
            <span>{language === 'ar' ? 'المزيد' : 'More'}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
