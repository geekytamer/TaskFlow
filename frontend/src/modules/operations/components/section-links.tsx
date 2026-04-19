'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Banknote, Handshake, Package, ShoppingCart, Truck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/lib/types';

const sectionItems: Array<{
  href: string;
  titleKey: string;
  descriptionKey: string;
  icon: typeof Banknote;
  roles: UserRole[];
}> = [
  {
    href: '/finance',
    titleKey: 'sections.finance.title',
    descriptionKey: 'sections.finance.description',
    icon: Banknote,
    roles: ['Admin', 'Manager', 'Accountant'],
  },
  {
    href: '/inventory',
    titleKey: 'sections.inventory.title',
    descriptionKey: 'sections.inventory.description',
    icon: Package,
    roles: ['Admin', 'Manager', 'Accountant'],
  },
  {
    href: '/purchases',
    titleKey: 'sections.purchases.title',
    descriptionKey: 'sections.purchases.description',
    icon: ShoppingCart,
    roles: ['Admin', 'Manager', 'Accountant'],
  },
  {
    href: '/clients',
    titleKey: 'sections.clients.title',
    descriptionKey: 'sections.clients.description',
    icon: Handshake,
    roles: ['Admin', 'Manager', 'Accountant'],
  },
  {
    href: '/suppliers',
    titleKey: 'sections.suppliers.title',
    descriptionKey: 'sections.suppliers.description',
    icon: Truck,
    roles: ['Admin', 'Manager', 'Accountant'],
  },
];

export function SectionLinks() {
  const pathname = usePathname();
  const { currentRole } = useCompany();
  const { t } = useI18n();

  const visibleItems = sectionItems.filter((item) =>
    currentRole ? item.roles.includes(currentRole) : false,
  );

  if (!visibleItems.length) return null;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link key={item.href} href={item.href} className="block">
            <Card
              className={cn(
                'h-full transition-colors hover:border-primary/60',
                isActive && 'border-primary bg-primary/5',
              )}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base font-semibold">
                  {t(item.titleKey)}
                </CardTitle>
                <Icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {t(item.descriptionKey)}
                </p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
