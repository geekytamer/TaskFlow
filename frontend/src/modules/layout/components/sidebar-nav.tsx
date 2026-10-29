'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMyHoldingGroups } from '@/modules/authz/components/shared';
import { useGroupScope } from '@/context/group-scope-context';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  Users,
  Network,
  FolderKanban,
  Settings,
  Banknote,
  ReceiptText,
  Package,
  ShoppingCart,
  Handshake,
  Truck,
  BookUser,
  CalendarClock,
  ChartNoAxesCombined,
  BarChart3,
  Megaphone,
  UserRoundSearch,
  BadgeDollarSign,
  CheckSquare,
  MessageSquare,
  Sparkles,
  Contact2,
  CalendarOff,
  CalendarCheck,
  Wallet,
  ClipboardCheck,
  FileQuestion,
  Scale,
  Factory,
  Building2,
  FileText,
  ShieldCheck, Layers, ClipboardList, GraduationCap, Lock, Ship, ScanLine, Inbox, MessagesSquare } from 'lucide-react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/context/i18n-context';
import { useCompany } from '@/context/company-context';
import { getInbox } from '@/services/conversationService';
import { INBOX_PERMISSION, waitingCount } from '@/modules/conversations/lib/inbox';
import { DATA_CHANGED_EVENT } from '@/lib/api-client';
import { LIVE_EVENT } from '@/lib/live';
import { useTeamUnread } from '@/modules/teamchat/use-team-unread';
import { getWhatsappChats } from '@/services/whatsappService';
import { usePermissions } from '@/context/permissions-context';
import { navAllowed } from '@/modules/layout/lib/nav-permissions';
import { PermissionsErrorNotice } from '@/components/permissions-error';
import { useAcademy } from '@/modules/academy/academy-context';
import { moduleForPath } from '@/modules/companies/lib/company-modules';

type NavItem = {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  tutorial?: string;
};

type NavSection = {
  labelKey: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: 'nav.section.workspace',
    items: [
      { href: '/inbox', labelKey: 'nav.inbox', icon: MessagesSquare },
      { href: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, tutorial: 'nav-dashboard' },
      { href: '/academy', labelKey: 'nav.academy', icon: GraduationCap, tutorial: 'nav-academy' },
      { href: '/projects', labelKey: 'nav.projects', icon: FolderKanban, tutorial: 'nav-projects' },
      { href: '/tasks', labelKey: 'nav.tasks', icon: CheckSquare, tutorial: 'nav-tasks' },
      { href: '/diagram', labelKey: 'nav.diagram', icon: Network, tutorial: 'nav-diagram' },
      { href: '/documents', labelKey: 'nav.documents', icon: FileText, tutorial: 'nav-documents' },
    ],
  },
  {
    labelKey: 'nav.section.operations',
    items: [
      { href: '/sales', labelKey: 'nav.sales', icon: ReceiptText, tutorial: 'nav-sales' },
      { href: '/purchases', labelKey: 'nav.purchases', icon: ShoppingCart, tutorial: 'nav-purchases' },
      { href: '/purchases/requisitions', labelKey: 'nav.requisitions', icon: ClipboardList },
      { href: '/purchases/rfq', labelKey: 'nav.rfq', icon: FileQuestion, tutorial: 'nav-rfq' },
      { href: '/purchases/matching', labelKey: 'nav.matching', icon: Scale, tutorial: 'nav-matching' },
      { href: '/inventory', labelKey: 'nav.inventory', icon: Package, tutorial: 'nav-inventory' },
      { href: '/inventory/counts', labelKey: 'nav.stockCounts', icon: ClipboardCheck, tutorial: 'nav-stock-counts' },
      { href: '/shipments', labelKey: 'nav.shipments', icon: Ship, tutorial: 'nav-shipments' },
      { href: '/warehouse', labelKey: 'nav.warehouseMode', icon: ScanLine, tutorial: 'nav-warehouse-mode' },
      { href: '/manufacturing', labelKey: 'nav.manufacturing', icon: Factory, tutorial: 'nav-manufacturing' },
    ],
  },
  {
    labelKey: 'nav.section.finance',
    items: [
      { href: '/finance', labelKey: 'nav.finance', icon: Banknote, tutorial: 'nav-finance' },
      { href: '/approvals', labelKey: 'nav.approvals', icon: ClipboardCheck, tutorial: 'nav-approvals' },
      { href: '/crm/commissions', labelKey: 'nav.commissions', icon: BadgeDollarSign, tutorial: 'nav-commissions' },
    ],
  },
  {
    labelKey: 'nav.section.crm',
    items: [
      { href: '/contacts', labelKey: 'nav.contacts', icon: BookUser, tutorial: 'nav-contacts' },
      { href: '/influencers', labelKey: 'nav.influencers', icon: Sparkles, tutorial: 'nav-influencers' },
      { href: '/whatsapp', labelKey: 'nav.whatsapp', icon: MessageSquare, tutorial: 'nav-whatsapp' },
      { href: '/crm/opportunities', labelKey: 'nav.opportunities', icon: ChartNoAxesCombined, tutorial: 'nav-opportunities' },
      { href: '/crm/campaigns', labelKey: 'nav.campaigns', icon: Megaphone, tutorial: 'nav-campaigns' },
      { href: '/crm/followups', labelKey: 'nav.followups', icon: CalendarClock, tutorial: 'nav-followups' },
      { href: '/crm/client-requests', labelKey: 'nav.clientRequests', icon: Inbox },
      { href: '/crm/vendor-requests', labelKey: 'nav.vendorRequests', icon: UserRoundSearch, tutorial: 'nav-vendor-requests' },
      { href: '/crm/performance', labelKey: 'nav.performance', icon: BarChart3, tutorial: 'nav-performance' },
    ],
  },
  {
    labelKey: 'nav.section.directory',
    items: [
      { href: '/clients', labelKey: 'nav.clients', icon: Handshake, tutorial: 'nav-clients' },
      { href: '/suppliers', labelKey: 'nav.suppliers', icon: Truck, tutorial: 'nav-suppliers' },
    ],
  },
  {
    labelKey: 'nav.section.hr',
    items: [
      { href: '/hr/employees', labelKey: 'nav.employees', icon: Contact2, tutorial: 'nav-employees' },
      { href: '/hr/attendance', labelKey: 'nav.attendance', icon: CalendarCheck, tutorial: 'nav-attendance' },
      { href: '/hr/leave', labelKey: 'nav.leave', icon: CalendarOff, tutorial: 'nav-leave' },
      { href: '/hr/payroll', labelKey: 'nav.payroll', icon: Wallet, tutorial: 'nav-payroll' },
    ],
  },
  {
    labelKey: 'nav.section.admin',
    items: [
      { href: '/company-profile', labelKey: 'nav.companyProfile', icon: Building2, tutorial: 'nav-company-profile' },
      { href: '/users', labelKey: 'nav.users', icon: Users, tutorial: 'nav-users' },
      { href: '/settings', labelKey: 'nav.settings', icon: Settings, tutorial: 'nav-settings' },
      { href: '/settings/people', labelKey: 'nav.peopleRoles', icon: ShieldCheck },
      { href: '/settings/group', labelKey: 'nav.group', icon: Layers },
    ],
  },
];

/** The installed app's icon shows the same number as the Inbox badge, where the browser supports it. */
function showAppBadge(count: number) {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  const done = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
  done?.catch(() => undefined);
}

/** What a group can show today; everything else stays company work (plan: 2026-10-29-group-scope). */
const GROUP_PAGES: ReadonlySet<string> = new Set(['/', '/tasks', '/projects', '/settings/group']);

/** Pages that belong to another menu entry (Roles sits under People and roles). */
const ACTIVE_ALIAS: Readonly<Record<string, string>> = { '/settings/roles': '/settings/people' };

/** The menu entry a path belongs to: the longest matching href, so /settings/people is not also /settings. */
export function activeHref(pathname: string): string | undefined {
  if (pathname === '/') return '/';
  let best: string | undefined;
  for (const href of NAV_ITEMS.keys()) {
    if (href === '/') continue;
    if ((pathname === href || pathname.startsWith(`${href}/`)) && (!best || href.length > best.length)) best = href;
  }
  for (const [from, to] of Object.entries(ACTIVE_ALIAS)) {
    if ((pathname === from || pathname.startsWith(`${from}/`)) && (!best || from.length >= best.length)) return to;
  }
  return best;
}

const NAV_ITEMS = new Map(NAV_SECTIONS.flatMap((section) => section.items.map((item) => [item.href, item] as const)));

/** Who may see which menu entry, shared by the sidebar and the phone tab bar. */
export function useNavAccess() {
  const { user, loading, effectiveRole } = useAuthGuard();
  const { canAdmin, moduleOn, loading: permissionsLoading } = usePermissions();
  const academy = useAcademy();
  // Group settings belong to group administrators, not to a company role.
  const { groups: adminOfGroups } = useMyHoldingGroups();
  const { group } = useGroupScope();

  /** Locked by an unfinished Academy mission (never inside the practice company). */
  const isLocked = (href: string) => {
    if (academy.inPractice) return false;
    const itemModule = moduleForPath(href);
    return Boolean(itemModule && academy.locked.has(itemModule));
  };

  // The server's permissions are the only authority: `can` answers false until
  // they are in, so a gated entry is never listed on a guess.
  const canSee = (href: string) => {
    const item = NAV_ITEMS.get(href);
    if (!item) return false;
    // In a group the menu offers only what a group can actually show; the rest
    // would put one company's data under a group heading.
    if (group && !GROUP_PAGES.has(item.href)) return false;
    // A module the company switched off is hidden whatever the role.
    const itemModule = moduleForPath(item.href);
    if (itemModule && !moduleOn(itemModule)) return false;
    if (item.href === '/settings/group') return adminOfGroups.length > 0;
    // canAdmin: equals can(), plus the super admin's own surfaces (Ruling R).
    return navAllowed(item.href, canAdmin);
  };

  return { ready: !loading && !!user && !permissionsLoading, effectiveRole, canSee, isLocked };
}

/** Conversations waiting on us, polled; also mirrored on the installed app's icon. */
export function useInboxWaiting(enabled = true) {
  const { selectedCompany } = useCompany();
  const [inboxWaiting, setInboxWaiting] = React.useState(0);
  // The client conversations' permission: no badge fetch for someone the server would refuse.
  const canUseInbox = usePermissions().can(INBOX_PERMISSION);
  React.useEffect(() => {
    if (!enabled || !selectedCompany?.id || !canUseInbox) {
      setInboxWaiting(0);
      return;
    }
    const companyId = selectedCompany.id;
    let live = true;
    const fetchWaiting = () => {
      getInbox(companyId, 'mine', 'waiting_us')
        .then((r) => {
          if (!live) return;
          const count = waitingCount(r.counts);
          setInboxWaiting(count);
          showAppBadge(count);
        })
        .catch(() => undefined);
    };
    fetchWaiting();
    const id = window.setInterval(fetchWaiting, 30000);
    window.addEventListener(DATA_CHANGED_EVENT, fetchWaiting);
    // A client's message lifts the count at once, not at the next poll.
    const onLive = (e: Event) => {
      const topics = (e as CustomEvent<{ topics: string[]; all?: boolean }>).detail;
      if (topics?.all || topics?.topics.some((t) => t === 'inbox' || t === 'conversation-threads')) fetchWaiting();
    };
    window.addEventListener(LIVE_EVENT, onLive);
    return () => {
      live = false;
      window.clearInterval(id);
      window.removeEventListener(DATA_CHANGED_EVENT, fetchWaiting);
      window.removeEventListener(LIVE_EVENT, onLive);
    };
  }, [selectedCompany?.id, canUseInbox, enabled]);
  return inboxWaiting;
}

export function SidebarNav() {
  const pathname = usePathname();
  const { ready, canSee, isLocked } = useNavAccess();
  const { t } = useI18n();
  const { selectedCompany } = useCompany();
  const [whatsappUnread, setWhatsappUnread] = React.useState(0);
  const canReadChats = usePermissions().can('whatsapp.view');

  React.useEffect(() => {
    if (!selectedCompany?.id || !canReadChats) {
      setWhatsappUnread(0);
      return;
    }
    const fetchUnread = () => {
      getWhatsappChats(selectedCompany.id)
        .then((chats) =>
          setWhatsappUnread(chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0)),
        )
        .catch(() => undefined);
    };
    fetchUnread();
    const id = window.setInterval(fetchUnread, 30000);
    return () => window.clearInterval(id);
  }, [selectedCompany?.id, canReadChats]);

  const inboxWaiting = useInboxWaiting();
  const teamUnread = useTeamUnread();

  // On a phone the menu is a drawer: close it once a page is picked.
  // The drawer mounts this list when it opens, so only a change of page closes it.
  const { setOpenMobile } = useSidebar();
  const shownAt = React.useRef(pathname);
  React.useEffect(() => {
    if (shownAt.current === pathname) return;
    shownAt.current = pathname;
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  const badges: Record<string, number> = {
    '/inbox': inboxWaiting + teamUnread,
    '/whatsapp': whatsappUnread,
  };

  if (!ready) {
    return (
      <div className="p-4 space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  const canSeeItem = (item: NavItem) => canSee(item.href);

  return (
    <div data-tutorial="sidebar-nav" className="flex flex-col gap-1">
      <PermissionsErrorNotice compact />
      {NAV_SECTIONS.map((section) => {
        const visible = section.items.filter(canSeeItem);
        if (!visible.length) return null;
        return (
          <SidebarGroup key={section.labelKey} className="py-1">
            <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/55">
              {t(section.labelKey)}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visible.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.href === activeHref(pathname);
                  const badge = badges[item.href] || 0;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={{ children: t(item.labelKey), side: 'right' }}
                        data-tutorial={item.tutorial}
                      >
                        <Link href={item.href} className="flex items-center justify-between">
                          <span className="flex items-center gap-2 min-w-0">
                            <Icon />
                            <span className="truncate">{t(item.labelKey)}</span>
                          </span>
                          {isLocked(item.href) && (
                            <Lock className="ms-2 h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" aria-label={t('nav.lockedByAcademy')} />
                          )}
                          {badge > 0 && (
                            <span className="ms-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-white">
                              {badge > 99 ? '99+' : badge}
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}
    </div>
  );
}
