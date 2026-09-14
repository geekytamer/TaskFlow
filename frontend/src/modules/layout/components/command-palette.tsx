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
import { usePermissions } from '@/context/permissions-context';
import { navPermission } from '@/modules/layout/lib/nav-permissions';
import { moduleForPath } from '@/modules/companies/lib/company-modules';
import {
  BarChart3,
  BadgeDollarSign,
  Banknote,
  BookUser,
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
  { href: '/documents', labelKey: 'nav.documents', icon: FileText, roles: ['Admin', 'Manager', 'Accountant'] },
  { href: '/sales', labelKey: 'nav.sales', icon: ReceiptText, roles: ['Admin', 'Manager', 'Accountant'] },
  { href: '/purchases', labelKey: 'nav.purchases', icon: ShoppingCart, roles: ['Admin', 'Manager', 'Accountant'] },
  { href: '/inventory', labelKey: 'nav.inventory', icon: Package, roles: ['Admin', 'Manager', 'Accountant'] },
  { href: '/finance', labelKey: 'nav.finance', icon: Banknote, roles: ['Admin', 'Manager', 'Accountant'] },
  { href: '/crm/commissions', labelKey: 'nav.commissions', icon: BadgeDollarSign, roles: ['Admin', 'Manager', 'Employee', 'Accountant'] },
  { href: '/contacts', labelKey: 'nav.contacts', icon: BookUser, roles: ['Admin', 'Manager', 'Employee', 'Accountant'] },
  { href: '/whatsapp', labelKey: 'nav.whatsapp', icon: MessageSquare, roles: ['Admin', 'Manager', 'Accountant'] },
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
  const { can, moduleOn, loaded: permissionsLoaded } = usePermissions();

  /** Quick actions are shortcuts to pages, so they answer to the same rule. */
  const allowsHref = React.useCallback((href: string) => {
    const hrefModule = moduleForPath(href);
    if (hrefModule && !moduleOn(hrefModule)) return false;
    const permission = navPermission(href);
    if (!permissionsLoaded) return true; // legacy mode: the page guard decides
    if (!permission) return true;
    const [module, action] = [
      permission.slice(0, permission.indexOf(':')),
      permission.slice(permission.indexOf(':') + 1),
    ];
    return can(module, action);
  }, [can, moduleOn, permissionsLoaded]);

  const quickActions = React.useMemo(() => ([
    { href: '/finance', labelKey: 'cmdk.openFinance', icon: Banknote },
    { href: '/whatsapp', labelKey: 'cmdk.openWhatsapp', icon: MessageSquare },
    { href: '/crm/followups', labelKey: 'cmdk.openFollowups', icon: CalendarClock },
  ].filter((action) => allowsHref(action.href))), [allowsHref]);
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
      (moduleOn('contacts') ? getContacts(cid) : Promise.resolve([])).then((d) => setContacts(d)),
      (moduleOn('invoices') ? getInvoices(cid) : Promise.resolve([])).then((d) => setInvoices(d)),
      (moduleOn('sales') ? getSalesOrders(cid) : Promise.resolve([])).then((d) => setOrders(d)),
    ]);
  }, [open, selectedCompany?.id, moduleOn]);

  const visibleNav = React.useMemo(
    () =>
      navTargets.filter((item) => {
        const itemModule = moduleForPath(item.href);
        if (itemModule && !moduleOn(itemModule)) return false;
        // Once the server reports a permission set it is the only authority;
        // the role list below is the fallback while AUTHZ_ENGINE is legacy.
        const permission = navPermission(item.href);
        if (permissionsLoaded) {
          if (!permission) return true; // record-level destinations stay listed
          const [module, action] = [
            permission.slice(0, permission.indexOf(':')),
            permission.slice(permission.indexOf(':') + 1),
          ];
          return can(module, action);
        }
        if (item.href === '/settings') return effectiveRole === 'Admin';
        return effectiveRole ? item.roles.includes(effectiveRole) : false;
      }),
    [effectiveRole, can, moduleOn, permissionsLoaded],
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
        {quickActions.length > 0 && (
          <CommandGroup heading={t('cmdk.quickActions')}>
            {quickActions.map((action) => (
              <CommandItem key={action.href} onSelect={() => go(action.href)}>
                <action.icon className="me-2 h-4 w-4" />
                {t(action.labelKey)}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
