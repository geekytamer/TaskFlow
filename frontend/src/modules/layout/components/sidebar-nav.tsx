'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
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
  Building2,
} from 'lucide-react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/context/i18n-context';
import { useCompany } from '@/context/company-context';
import { getWhatsappChats } from '@/services/whatsappService';

type NavItem = {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Array<'Admin' | 'Manager' | 'Employee' | 'Accountant'>;
  tutorial?: string;
};

type NavSection = {
  labelKey: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    labelKey: 'nav.section.workspace',
    items: [
      { href: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-dashboard' },
      { href: '/projects', labelKey: 'nav.projects', icon: FolderKanban, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-projects' },
      { href: '/tasks', labelKey: 'nav.tasks', icon: CheckSquare, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-tasks' },
      { href: '/diagram', labelKey: 'nav.diagram', icon: Network, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-diagram' },
    ],
  },
  {
    labelKey: 'nav.section.operations',
    items: [
      { href: '/sales', labelKey: 'nav.sales', icon: ReceiptText, roles: ['Admin', 'Manager', 'Accountant'], tutorial: 'nav-sales' },
      { href: '/purchases', labelKey: 'nav.purchases', icon: ShoppingCart, roles: ['Admin', 'Manager', 'Accountant'], tutorial: 'nav-purchases' },
      { href: '/inventory', labelKey: 'nav.inventory', icon: Package, roles: ['Admin', 'Manager', 'Accountant'], tutorial: 'nav-inventory' },
    ],
  },
  {
    labelKey: 'nav.section.finance',
    items: [
      { href: '/finance', labelKey: 'nav.finance', icon: Banknote, roles: ['Admin', 'Manager', 'Accountant'], tutorial: 'nav-finance' },
      { href: '/crm/commissions', labelKey: 'nav.commissions', icon: BadgeDollarSign, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-commissions' },
    ],
  },
  {
    labelKey: 'nav.section.crm',
    items: [
      { href: '/contacts', labelKey: 'nav.contacts', icon: BookUser, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-contacts' },
      { href: '/influencers', labelKey: 'nav.influencers', icon: Sparkles, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-influencers' },
      { href: '/whatsapp', labelKey: 'nav.whatsapp', icon: MessageSquare, roles: ['Admin', 'Manager', 'Accountant', 'Employee'], tutorial: 'nav-whatsapp' },
      { href: '/crm/opportunities', labelKey: 'nav.opportunities', icon: ChartNoAxesCombined, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-opportunities' },
      { href: '/crm/campaigns', labelKey: 'nav.campaigns', icon: Megaphone, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-campaigns' },
      { href: '/crm/followups', labelKey: 'nav.followups', icon: CalendarClock, roles: ['Admin', 'Manager', 'Employee'], tutorial: 'nav-followups' },
      { href: '/crm/vendor-requests', labelKey: 'nav.vendorRequests', icon: UserRoundSearch, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-vendor-requests' },
      { href: '/crm/performance', labelKey: 'nav.performance', icon: BarChart3, roles: ['Admin', 'Manager'], tutorial: 'nav-performance' },
    ],
  },
  {
    labelKey: 'nav.section.directory',
    items: [
      { href: '/clients', labelKey: 'nav.clients', icon: Handshake, roles: ['Admin', 'Manager', 'Accountant'], tutorial: 'nav-clients' },
      { href: '/suppliers', labelKey: 'nav.suppliers', icon: Truck, roles: ['Admin', 'Manager', 'Accountant'], tutorial: 'nav-suppliers' },
    ],
  },
  {
    labelKey: 'nav.section.hr',
    items: [
      { href: '/hr/employees', labelKey: 'nav.employees', icon: Contact2, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-employees' },
      { href: '/hr/leave', labelKey: 'nav.leave', icon: CalendarOff, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-leave' },
    ],
  },
  {
    labelKey: 'nav.section.admin',
    items: [
      { href: '/company-profile', labelKey: 'nav.companyProfile', icon: Building2, roles: ['Admin', 'Manager'], tutorial: 'nav-company-profile' },
      { href: '/users', labelKey: 'nav.users', icon: Users, roles: ['Admin', 'Manager'], tutorial: 'nav-users' },
      { href: '/settings', labelKey: 'nav.settings', icon: Settings, roles: ['Admin'], tutorial: 'nav-settings' },
    ],
  },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { user, loading, effectiveRole } = useAuthGuard();
  const { t } = useI18n();
  const { selectedCompany } = useCompany();
  const [whatsappUnread, setWhatsappUnread] = React.useState(0);

  React.useEffect(() => {
    if (!selectedCompany?.id) {
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
  }, [selectedCompany?.id]);

  const badges: Record<string, number> = {
    '/whatsapp': whatsappUnread,
  };

  if (loading || !user) {
    return (
      <div className="p-4 space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  const canSeeItem = (item: NavItem) => {
    if (item.href === '/settings') return effectiveRole === 'Admin';
    if (!effectiveRole) return false;
    return item.roles.includes(effectiveRole);
  };

  return (
    <div data-tutorial="sidebar-nav" className="flex flex-col gap-1">
      {sections.map((section) => {
        const visible = section.items.filter(canSeeItem);
        if (!visible.length) return null;
        return (
          <SidebarGroup key={section.labelKey} className="py-1">
            <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {t(section.labelKey)}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visible.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.href === '/'
                      ? pathname === '/'
                      : pathname.startsWith(item.href);
                  const badge = badges[item.href] || 0;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={{ children: t(item.labelKey), side: 'right' }}
                        data-tutorial={item.tutorial}
                      >
                        <a href={item.href} className="flex items-center justify-between">
                          <span className="flex items-center gap-2 min-w-0">
                            <Icon />
                            <span className="truncate">{t(item.labelKey)}</span>
                          </span>
                          {badge > 0 && (
                            <span className="ms-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-white">
                              {badge > 99 ? '99+' : badge}
                            </span>
                          )}
                        </a>
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
