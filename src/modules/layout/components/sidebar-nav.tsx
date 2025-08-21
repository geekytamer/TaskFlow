'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { LayoutDashboard, Users, Network, FolderKanban, Building, Settings } from 'lucide-react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { Skeleton } from '@/components/ui/skeleton';

const allNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['Admin', 'Manager', 'Employee'] },
  { href: '/projects', label: 'Projects', icon: FolderKanban, roles: ['Admin', 'Manager', 'Employee'] },
  { href: '/diagram', label: 'Diagram', icon: Network, roles: ['Admin', 'Manager', 'Employee'] },
  { href: '/users', label: 'Users', icon: Users, roles: ['Admin', 'Manager'] },
  { href: '/companies', label: 'Companies', icon: Building, roles: ['Admin'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['Admin'] },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { user, loading } = useAuthGuard();

  if (loading || !user) {
    return (
      <div className="p-4 space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  const navItems = allNavItems.filter(item => item.roles.includes(user.role));

  return (
    <SidebarMenu>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname.startsWith(item.href) && item.href !== '/';
        const isDashboardActive = pathname === '/';
        
        const finalIsActive = item.href === '/' ? isDashboardActive : isActive;

        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={finalIsActive}
              tooltip={{ children: item.label, side: 'right' }}
            >
              <a href={item.href}>
                <Icon />
                <span>{item.label}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
