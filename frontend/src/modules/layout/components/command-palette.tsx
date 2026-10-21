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
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { searchCompany, type SearchGroup, type SearchType } from '@/services/searchService';
import { usePermissions } from '@/context/permissions-context';
import { navAllowed } from '@/modules/layout/lib/nav-permissions';
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
  Inbox,
  MessagesSquare,
  Users,
} from 'lucide-react';

type PaletteNavItem = {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
};

const navTargets: PaletteNavItem[] = [
  { href: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/projects', labelKey: 'nav.projects', icon: FolderKanban },
  { href: '/tasks', labelKey: 'nav.tasks', icon: CheckSquare },
  { href: '/diagram', labelKey: 'nav.diagram', icon: Network },
  { href: '/documents', labelKey: 'nav.documents', icon: FileText },
  { href: '/sales', labelKey: 'nav.sales', icon: ReceiptText },
  { href: '/purchases', labelKey: 'nav.purchases', icon: ShoppingCart },
  { href: '/inventory', labelKey: 'nav.inventory', icon: Package },
  { href: '/finance', labelKey: 'nav.finance', icon: Banknote },
  { href: '/crm/commissions', labelKey: 'nav.commissions', icon: BadgeDollarSign },
  { href: '/contacts', labelKey: 'nav.contacts', icon: BookUser },
  { href: '/whatsapp', labelKey: 'nav.whatsapp', icon: MessageSquare },
  { href: '/crm/opportunities', labelKey: 'nav.opportunities', icon: ChartNoAxesCombined },
  { href: '/crm/campaigns', labelKey: 'nav.campaigns', icon: Megaphone },
  { href: '/crm/followups', labelKey: 'nav.followups', icon: CalendarClock },
  { href: '/crm/client-requests', labelKey: 'nav.clientRequests', icon: Inbox },
  { href: '/crm/vendor-requests', labelKey: 'nav.vendorRequests', icon: UserRoundSearch },
  { href: '/crm/performance', labelKey: 'nav.performance', icon: BarChart3 },
  { href: '/clients', labelKey: 'nav.clients', icon: Handshake },
  { href: '/suppliers', labelKey: 'nav.suppliers', icon: Truck },
  { href: '/users', labelKey: 'nav.users', icon: Users },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings },
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
  const { can, moduleOn } = usePermissions();

  /** Quick actions are shortcuts to pages, so they answer to the same rule as the menu. */
  const allowsHref = React.useCallback((href: string) => {
    const hrefModule = moduleForPath(href);
    if (hrefModule && !moduleOn(hrefModule)) return false;
    return navAllowed(href, can);
  }, [can, moduleOn]);

  const quickActions = React.useMemo(() => ([
    { href: '/inbox', labelKey: 'cmdk.openInbox', icon: MessagesSquare },
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
      navTargets.filter((item) => allowsHref(item.href)),
    [allowsHref],
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
