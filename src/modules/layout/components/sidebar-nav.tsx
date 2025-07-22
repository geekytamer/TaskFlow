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
  { href: '/tasks', label: 'Projects', icon: FolderKanban },
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
        const isActive = pathname === item.href || (item.href === '/tasks' && pathname.startsWith('/projects'));
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={isActive}
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
