'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { getInvoices } from '@/services/financeService';
import { getWhatsappChats } from '@/services/whatsappService';
import type { Invoice } from '@/modules/finance/types';

interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: 'warning' | 'danger' | 'info';
}

/**
 * Computes the unread WhatsApp message count + overdue invoice list,
 * caches them, and surfaces a count badge + a Popover with the items.
 * Refreshes every 60 seconds and on window focus.
 */
export function NotificationBell() {
  const { selectedCompany } = useCompany();
  const { effectiveRole } = useAuthGuard();
  const { t } = useI18n();
  const [unreadWhatsapp, setUnreadWhatsapp] = React.useState(0);
  const [overdueInvoices, setOverdueInvoices] = React.useState<Invoice[]>([]);
  const [loading, setLoading] = React.useState(false);

  const canSeeFinance = effectiveRole !== 'Employee';
  const companyId = selectedCompany?.id;

  const refresh = React.useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const tasks: Array<Promise<unknown>> = [
        getWhatsappChats(companyId).then((chats) => {
          setUnreadWhatsapp(chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0));
        }),
      ];
      if (canSeeFinance) {
        tasks.push(
          getInvoices(companyId).then((invoices) => {
            const now = new Date();
            const overdue = invoices.filter(
              (inv) =>
                inv.status !== 'Paid' &&
                inv.status !== 'Draft' &&
                inv.dueDate &&
                inv.dueDate < now &&
                (inv.outstandingAmount || 0) > 0,
            );
            setOverdueInvoices(overdue);
          }),
        );
      } else {
        setOverdueInvoices([]);
      }
      await Promise.allSettled(tasks);
    } finally {
      setLoading(false);
    }
  }, [companyId, canSeeFinance]);

  React.useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 60000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const items: NotificationItem[] = React.useMemo(() => {
    const list: NotificationItem[] = [];
    if (unreadWhatsapp > 0) {
      list.push({
        id: 'whatsapp',
        title: t('notif.whatsappTitle').replace('{count}', String(unreadWhatsapp)),
        detail: t('notif.whatsappDetail'),
        href: '/whatsapp',
        tone: 'info',
      });
    }
    overdueInvoices.slice(0, 6).forEach((inv) => {
      list.push({
        id: `invoice-${inv.id}`,
        title: t('notif.invoiceOverdueTitle').replace('{number}', inv.invoiceNumber),
        detail: t('notif.invoiceOverdueDetail').replace(
          '{date}',
          new Date(inv.dueDate).toLocaleDateString(),
        ),
        href: '/finance?tab=invoices',
        tone: 'danger',
      });
    });
    return list;
  }, [unreadWhatsapp, overdueInvoices, t]);

  const total = unreadWhatsapp + overdueInvoices.length;
  const display = total > 99 ? '99+' : String(total);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background/60 transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label={t('notif.button')}
          title={t('notif.button')}
        >
          <Bell className="h-4 w-4" />
          {total > 0 && (
            <span className="absolute -end-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              {display}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b px-3 py-2 text-sm font-semibold">{t('notif.title')}</div>
        <div className="max-h-80 overflow-y-auto">
          {loading && items.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t('common.loading')}
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t('notif.empty')}
            </div>
          )}
          {items.map((item) => {
            const toneClass =
              item.tone === 'danger'
                ? 'border-l-4 border-l-red-500'
                : item.tone === 'warning'
                  ? 'border-l-4 border-l-amber-500'
                  : 'border-l-4 border-l-sky-500';
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`block border-b px-3 py-2.5 text-sm transition hover:bg-muted/50 ${toneClass}`}
              >
                <div className="font-medium">{item.title}</div>
                <div className="text-xs text-muted-foreground">{item.detail}</div>
              </Link>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
