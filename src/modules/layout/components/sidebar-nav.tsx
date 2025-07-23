'use client';

import { usePathname } from 'next/navigation';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { LayoutDashboard, Users, Network, FolderKanban, Building } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/diagram', label: 'Diagram', icon: Network },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/companies', label: 'Companies', icon: Building },
];

export function SidebarNav() {
  const pathname = usePathname();

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
