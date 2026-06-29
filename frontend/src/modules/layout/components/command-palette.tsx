'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { getContacts, type Contact } from '@/services/contactService';
import { getInvoices, getSalesOrders } from '@/services/financeService';
import type { Invoice, SalesOrder } from '@/modules/finance/types';
import {
  BarChart3,
  BadgeDollarSign,
  Banknote,
  BookUser,
  Building,
  CalendarClock,
  ChartNoAxesCombined,
  CheckSquare,
  FileText,
  FolderKanban,
  Handshake,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Network,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  UserRoundSearch,
  Users,
} from 'lucide-react';

type PaletteNavItem = {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Array<'Admin' | 'Manager' | 'Employee' | 'Accountant'>;
};

const navTargets: PaletteNavItem[] = [
  { href: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: ['Admin', 'Manager', 'Employee', 'Accountant'] },
  { href: '/projects', labelKey: 'nav.projects', icon: FolderKanban, roles: ['Admin', 'Manager', 'Employee', 'Accountant'] },
  { href: '/tasks', labelKey: 'nav.tasks', icon: CheckSquare, roles: ['Admin', 'Manager', 'Employee', 'Accountant'] },
  { href: '/diagram', labelKey: 'nav.diagram', icon: Network, roles: ['Admin', 'Manager', 'Employee', 'Accountant'] },
  { href: '/sales', labelKey: 'nav.sales', icon: ReceiptText, roles: ['Admin', 'Manager', 'Accountant'] },
  { href: '/purchases', labelKey: 'nav.purchases', icon: ShoppingCart, roles: ['Admin', 'Manager', 'Accountant'] },
  { href: '/inventory', labelKey: 'nav.inventory', icon: Package, roles: ['Admin', 'Manager', 'Accountant'] },
  { href: '/finance', labelKey: 'nav.finance', icon: Banknote, roles: ['Admin', 'Manager', 'Accountant'] },
  { href: '/crm/commissions', labelKey: 'nav.commissions', icon: BadgeDollarSign, roles: ['Admin', 'Manager', 'Employee', 'Accountant'] },
  { href: '/contacts', labelKey: 'nav.contacts', icon: BookUser, roles: ['Admin', 'Manager', 'Employee', 'Accountant'] },
  { href: '/whatsapp', labelKey: 'nav.whatsapp', icon: MessageSquare, roles: ['Admin', 'Manager', 'Accountant', 'Employee'] },
  { href: '/crm/opportunities', labelKey: 'nav.opportunities', icon: ChartNoAxesCombined, roles: ['Admin', 'Manager', 'Employee', 'Accountant'] },
  { href: '/crm/campaigns', labelKey: 'nav.campaigns', icon: Megaphone, roles: ['Admin', 'Manager', 'Employee', 'Accountant'] },
  { href: '/crm/followups', labelKey: 'nav.followups', icon: CalendarClock, roles: ['Admin', 'Manager', 'Employee'] },
  { href: '/crm/vendor-requests', labelKey: 'nav.vendorRequests', icon: UserRoundSearch, roles: ['Admin', 'Manager', 'Employee', 'Accountant'] },
  { href: '/crm/performance', labelKey: 'nav.performance', icon: BarChart3, roles: ['Admin', 'Manager'] },
  { href: '/clients', labelKey: 'nav.clients', icon: Handshake, roles: ['Admin', 'Manager', 'Accountant'] },
  { href: '/suppliers', labelKey: 'nav.suppliers', icon: Truck, roles: ['Admin', 'Manager', 'Accountant'] },
  { href: '/users', labelKey: 'nav.users', icon: Users, roles: ['Admin', 'Manager'] },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings, roles: ['Admin'] },
];

export function CommandPalette() {
  const router = useRouter();
  const { t } = useI18n();
  const { selectedCompany } = useCompany();
  const { effectiveRole } = useAuthGuard();
  const [open, setOpen] = React.useState(false);
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [orders, setOrders] = React.useState<SalesOrder[]>([]);

  // Toggle on ⌘K / Ctrl+K
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Lazy-load entity data the first time the palette opens
  React.useEffect(() => {
    if (!open || !selectedCompany?.id) return;
    const cid = selectedCompany.id;
    Promise.allSettled([
      getContacts(cid).then((d) => setContacts(d)),
      getInvoices(cid).then((d) => setInvoices(d)),
      getSalesOrders(cid).then((d) => setOrders(d)),
    ]);
  }, [open, selectedCompany?.id]);

  const visibleNav = React.useMemo(
    () =>
      navTargets.filter((item) => {
        if (item.href === '/settings') return effectiveRole === 'Admin';
        return effectiveRole ? item.roles.includes(effectiveRole) : false;
      }),
    [effectiveRole],
  );

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t('cmdk.placeholder')} />
      <CommandList>
        <CommandEmpty>{t('cmdk.empty')}</CommandEmpty>

        <CommandGroup heading={t('cmdk.navigate')}>
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.href}
                onSelect={() => go(item.href)}
                value={`${t(item.labelKey)} ${item.href}`}
              >
                <Icon className="me-2 h-4 w-4" />
                <span>{t(item.labelKey)}</span>
                <span className="ms-auto text-xs text-muted-foreground">{item.href}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {contacts.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('cmdk.contacts')}>
              {contacts.slice(0, 12).map((c) => (
                <CommandItem
                  key={c.id}
                  value={`contact ${c.name} ${c.phone || ''} ${c.email || ''}`}
                  onSelect={() => go('/contacts')}
                >
                  <BookUser className="me-2 h-4 w-4" />
                  <div className="flex flex-col">
                    <span className="text-sm">{c.name}</span>
                    {(c.phone || c.email) && (
                      <span className="text-xs text-muted-foreground">
                        {c.phone || c.email}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {invoices.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('cmdk.invoices')}>
              {invoices.slice(0, 12).map((inv) => (
                <CommandItem
                  key={inv.id}
                  value={`invoice ${inv.invoiceNumber} ${inv.status}`}
                  onSelect={() => go('/finance')}
                >
                  <FileText className="me-2 h-4 w-4" />
                  <span>{inv.invoiceNumber}</span>
                  <span className="ms-auto text-xs text-muted-foreground">{inv.status}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {orders.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('cmdk.salesOrders')}>
              {orders.slice(0, 12).map((so) => (
                <CommandItem
                  key={so.id}
                  value={`sales order ${so.orderNumber} ${so.status}`}
                  onSelect={() => go('/sales')}
                >
                  <ReceiptText className="me-2 h-4 w-4" />
                  <span>{so.orderNumber}</span>
                  <span className="ms-auto text-xs text-muted-foreground">{so.status}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading={t('cmdk.quickActions')}>
          <CommandItem onSelect={() => go('/finance')}>
            <Banknote className="me-2 h-4 w-4" />
            {t('cmdk.openFinance')}
          </CommandItem>
          <CommandItem onSelect={() => go('/whatsapp')}>
            <MessageSquare className="me-2 h-4 w-4" />
            {t('cmdk.openWhatsapp')}
          </CommandItem>
          <CommandItem onSelect={() => go('/crm/followups')}>
            <CalendarClock className="me-2 h-4 w-4" />
            {t('cmdk.openFollowups')}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
