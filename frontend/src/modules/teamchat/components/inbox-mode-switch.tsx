'use client';

import Link from 'next/link';
import { useI18n } from '@/context/i18n-context';
import { cn } from '@/lib/utils';
import { useTeamUnread } from '../use-team-unread';
import { usePermissions } from '@/context/permissions-context';
import { useWhatsappUnread } from '@/modules/whatsapp/use-whatsapp-unread';

/** One inbox: conversations with clients, WhatsApp, and chats with colleagues. */
export function InboxModeSwitch({ mode, showClients = true }: { mode: 'clients' | 'team' | 'whatsapp'; showClients?: boolean }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const teamUnread = useTeamUnread();
  const whatsappUnread = useWhatsappUnread();
  const { can, moduleOn } = usePermissions();
  const showWhatsapp = can('whatsapp.view') && moduleOn('whatsapp');
  const badge = (n: number) =>
    n > 0 && (
      <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
        {n > 99 ? '99+' : n}
      </span>
    );

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
      {showWhatsapp && (
        <Link href="/whatsapp" className={tab(mode === 'whatsapp')} aria-current={mode === 'whatsapp' ? 'page' : undefined}>
          {tr('WhatsApp', 'واتساب')}
          {badge(whatsappUnread)}
        </Link>
      )}
      <Link href="/inbox?tab=team" className={tab(mode === 'team')} aria-current={mode === 'team' ? 'page' : undefined}>
        {tr('Team', 'الفريق')}
        {badge(teamUnread)}
      </Link>
    </nav>
  );
}
