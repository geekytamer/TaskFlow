'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  Users,
  Network,
  FolderKanban,
  Building,
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
  FileText,
  Megaphone,
  UserRoundSearch,
  BadgeDollarSign,
  CheckSquare,
  MessageSquare,
} from 'lucide-react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/context/i18n-context';

const allNavItems = [
  { href: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-dashboard' },
  { href: '/projects', labelKey: 'nav.projects', icon: FolderKanban, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-projects' },
  { href: '/tasks', labelKey: 'nav.tasks', icon: CheckSquare, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-tasks' },
  { href: '/diagram', labelKey: 'nav.diagram', icon: Network, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-diagram' },
  { href: '/finance', labelKey: 'nav.finance', icon: Banknote, roles: ['Admin', 'Manager', 'Accountant'], tutorial: 'nav-finance' },
  { href: '/sales', labelKey: 'nav.sales', icon: ReceiptText, roles: ['Admin', 'Manager', 'Accountant'], tutorial: 'nav-sales' },
  { href: '/inventory', labelKey: 'nav.inventory', icon: Package, roles: ['Admin', 'Manager', 'Accountant'], tutorial: 'nav-inventory' },
  { href: '/purchases', labelKey: 'nav.purchases', icon: ShoppingCart, roles: ['Admin', 'Manager', 'Accountant'], tutorial: 'nav-purchases' },
  { href: '/contacts', labelKey: 'nav.contacts', icon: BookUser, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-contacts' },
  { href: '/crm/opportunities', labelKey: 'nav.opportunities', icon: ChartNoAxesCombined, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-opportunities' },
  { href: '/crm/proposals', labelKey: 'nav.proposals', icon: FileText, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-proposals' },
  { href: '/crm/campaigns', labelKey: 'nav.campaigns', icon: Megaphone, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-campaigns' },
  { href: '/crm/vendor-requests', labelKey: 'nav.vendorRequests', icon: UserRoundSearch, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-vendor-requests' },
  { href: '/crm/commissions', labelKey: 'nav.commissions', icon: BadgeDollarSign, roles: ['Admin', 'Manager', 'Employee', 'Accountant'], tutorial: 'nav-commissions' },
  { href: '/crm/followups', labelKey: 'nav.followups', icon: CalendarClock, roles: ['Admin', 'Manager', 'Employee'], tutorial: 'nav-followups' },
  { href: '/crm/performance', labelKey: 'nav.performance', icon: BarChart3, roles: ['Admin', 'Manager'], tutorial: 'nav-performance' },
  { href: '/whatsapp', labelKey: 'nav.whatsapp', icon: MessageSquare, roles: ['Admin', 'Manager', 'Accountant', 'Employee'], tutorial: 'nav-whatsapp' },
  { href: '/clients', labelKey: 'nav.clients', icon: Handshake, roles: ['Admin', 'Manager', 'Accountant'], tutorial: 'nav-clients' },
  { href: '/suppliers', labelKey: 'nav.suppliers', icon: Truck, roles: ['Admin', 'Manager', 'Accountant'], tutorial: 'nav-suppliers' },
  { href: '/users', labelKey: 'nav.users', icon: Users, roles: ['Admin', 'Manager'], tutorial: 'nav-users' },
  { href: '/companies', labelKey: 'nav.companies', icon: Building, roles: ['Admin'], tutorial: 'nav-companies' },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings, roles: ['Admin'], tutorial: 'nav-settings' },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { user, loading, effectiveRole } = useAuthGuard();
  const { t } = useI18n();

  if (loading || !user) {
    return (
      <div className="p-4 space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  const navItems = allNavItems.filter(item => {
    if (item.href === '/companies') {
      return user.role === 'Admin';
    }

    if (item.href === '/settings') {
      return effectiveRole === 'Admin';
    }

    if (!effectiveRole) return false;
    return item.roles.includes(effectiveRole)
  });

  return (
    <SidebarMenu data-tutorial="sidebar-nav">
      {navItems.map((item) => {
        const Icon = item.icon;

        let isActive = false;
        if (item.href === '/') {
          isActive = pathname === '/';
        } else {
          isActive = pathname.startsWith(item.href);
        }

        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              tooltip={{ children: t(item.labelKey), side: 'right' }}
              data-tutorial={item.tutorial}
            >
              <a href={item.href}>
                <Icon />
                <span>{t(item.labelKey)}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
