'use client';

import Link from 'next/link';
import { useI18n } from '@/context/i18n-context';
import { cn } from '@/lib/utils';
import { useTeamUnread } from '../use-team-unread';

/** The inbox has two sides: conversations with clients, and chats with colleagues. */
export function InboxModeSwitch({ mode, showClients = true }: { mode: 'clients' | 'team'; showClients?: boolean }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const teamUnread = useTeamUnread();

  const tab = (active: boolean) =>
    cn(
      'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
    );

  return (
    <nav className="flex gap-1 rounded-lg bg-muted p-1" aria-label={tr('Inbox', 'صندوق الوارد')}>
      {showClients && (
        <Link href="/inbox" className={tab(mode === 'clients')} aria-current={mode === 'clients' ? 'page' : undefined}>
          {tr('Clients', 'العملاء')}
        </Link>
      )}
      <Link href="/inbox?tab=team" className={tab(mode === 'team')} aria-current={mode === 'team' ? 'page' : undefined}>
        {tr('Team', 'الفريق')}
        {teamUnread > 0 && (
          <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {teamUnread > 99 ? '99+' : teamUnread}
          </span>
        )}
      </Link>
    </nav>
  );
}
