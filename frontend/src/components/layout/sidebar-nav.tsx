'use client';

import { usePathname } from 'next/navigation';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { LayoutDashboard, ListTodo, Users, Network } from 'lucide-react';
import { useI18n } from '@/context/i18n-context';

const navItems = [
  { href: '/', en: 'Dashboard', ar: 'لوحة التحكم', icon: LayoutDashboard },
  { href: '/tasks', en: 'Tasks', ar: 'المهام', icon: ListTodo },
  { href: '/diagram', en: 'Diagram', ar: 'المخطط', icon: Network },
  { href: '/users', en: 'Users', ar: 'المستخدمون', icon: Users },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);

  return (
    <SidebarMenu>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        const label = tr(item.en, item.ar);
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              tooltip={{ children: label, side: 'right' }}
            >
              <a href={item.href}>
                <Icon />
                <span>{label}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
