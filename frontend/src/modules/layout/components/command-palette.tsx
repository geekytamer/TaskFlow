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
import { searchCompany, type SearchGroup, type SearchType } from '@/services/searchService';
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
  Ship,
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

const SEARCH_GROUPS: Record<SearchType, { en: string; ar: string; icon: React.ComponentType<{ className?: string }> }> = {
  contacts: { en: 'Contacts', ar: 'جهات الاتصال', icon: BookUser },
  invoices: { en: 'Invoices', ar: 'الفواتير', icon: FileText },
  salesOrders: { en: 'Sales orders', ar: 'أوامر البيع', icon: ReceiptText },
  purchaseOrders: { en: 'Purchase orders', ar: 'أوامر الشراء', icon: ShoppingCart },
  items: { en: 'Stock items', ar: 'أصناف المخزون', icon: Package },
  batches: { en: 'Batches', ar: 'الدفعات', icon: Package },
  shipments: { en: 'Shipments', ar: 'الشحنات', icon: Ship },
  projects: { en: 'Projects', ar: 'المشاريع', icon: FolderKanban },
  tasks: { en: 'Tasks', ar: 'المهام', icon: CheckSquare },
  employees: { en: 'People', ar: 'الموظفون', icon: Users },
};

export function CommandPalette() {
  const router = useRouter();
  const { t, language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
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
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchGroup[]>([]);

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

  // Search the company as the person types (server-side, so every record counts, not the first few).
  React.useEffect(() => {
    if (!open || !selectedCompany?.id || query.trim().length < 2) { setResults([]); return; }
    let live = true;
    const timer = window.setTimeout(() => {
      searchCompany(selectedCompany.id, query.trim()).then((r) => { if (live) setResults(r); }).catch(() => { if (live) setResults([]); });
    }, 200);
    return () => { live = false; window.clearTimeout(timer); };
  }, [open, query, selectedCompany?.id]);
  React.useEffect(() => { if (!open) setQuery(''); }, [open]);

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
      <CommandInput placeholder={t('cmdk.placeholder')} value={query} onValueChange={setQuery} />
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

        {results.map((group) => {
          const meta = SEARCH_GROUPS[group.type];
          const Icon = meta?.icon ?? FileText;
          return (
            <React.Fragment key={group.type}>
              <CommandSeparator />
              <CommandGroup heading={meta ? tr(meta.en, meta.ar) : group.type}>
                {group.items.map((item) => (
                  <CommandItem
                    key={`${group.type}-${item.id}`}
                    // The server already matched it; the typed text keeps the list's own filter from hiding it.
                    value={`${query} ${group.type} ${item.title} ${item.subtitle ?? ''} ${item.id}`}
                    onSelect={() => go(item.route)}
                  >
                    <Icon className="me-2 h-4 w-4" />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm" dir="auto">{item.title}</span>
                      {item.subtitle && <span className="truncate text-xs text-muted-foreground" dir="auto">{item.subtitle}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </React.Fragment>
          );
        })}

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
