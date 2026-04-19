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
  Package,
  ShoppingCart,
  Handshake,
  Truck,
} from 'lucide-react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/context/i18n-context';

const allNavItems = [
  { href: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: ['Admin', 'Manager', 'Employee', 'Accountant'] },
  { href: '/projects', labelKey: 'nav.projects', icon: FolderKanban, roles: ['Admin', 'Manager', 'Employee', 'Accountant'] },
  { href: '/diagram', labelKey: 'nav.diagram', icon: Network, roles: ['Admin', 'Manager', 'Employee', 'Accountant'] },
  { href: '/finance', labelKey: 'nav.finance', icon: Banknote, roles: ['Admin', 'Manager', 'Accountant'] },
  { href: '/inventory', labelKey: 'nav.inventory', icon: Package, roles: ['Admin', 'Manager', 'Accountant'] },
  { href: '/purchases', labelKey: 'nav.purchases', icon: ShoppingCart, roles: ['Admin', 'Manager', 'Accountant'] },
  { href: '/clients', labelKey: 'nav.clients', icon: Handshake, roles: ['Admin', 'Manager', 'Accountant'] },
  { href: '/suppliers', labelKey: 'nav.suppliers', icon: Truck, roles: ['Admin', 'Manager', 'Accountant'] },
  { href: '/users', labelKey: 'nav.users', icon: Users, roles: ['Admin', 'Manager'] },
  { href: '/companies', labelKey: 'nav.companies', icon: Building, roles: ['Admin'] },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings, roles: ['Admin'] },
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
    if (item.href === '/companies' || item.href === '/settings') {
      return user.role === 'Admin';
    }

    if (!effectiveRole) return false;
    return item.roles.includes(effectiveRole)
  });

  return (
    <SidebarMenu>
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
