'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Banknote, Handshake, Package, ShoppingCart, Truck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/context/i18n-context';
import { usePermissions } from '@/context/permissions-context';
import { navAllowed } from '@/modules/layout/lib/nav-permissions';
import { moduleForPath } from '@/modules/companies/lib/company-modules';
import { cn } from '@/lib/utils';

const sectionItems: Array<{
  href: string;
  titleKey: string;
  descriptionKey: string;
  icon: typeof Banknote;
}> = [
  {
    href: '/finance',
    titleKey: 'sections.finance.title',
    descriptionKey: 'sections.finance.description',
    icon: Banknote,
  },
  {
    href: '/inventory',
    titleKey: 'sections.inventory.title',
    descriptionKey: 'sections.inventory.description',
    icon: Package,
  },
  {
    href: '/purchases',
    titleKey: 'sections.purchases.title',
    descriptionKey: 'sections.purchases.description',
    icon: ShoppingCart,
  },
  {
    href: '/clients',
    titleKey: 'sections.clients.title',
    descriptionKey: 'sections.clients.description',
    icon: Handshake,
  },
  {
    href: '/suppliers',
    titleKey: 'sections.suppliers.title',
    descriptionKey: 'sections.suppliers.description',
    icon: Truck,
  },
];

export function SectionLinks() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { can, moduleOn } = usePermissions();

  // Same rule as the sidebar: the destination's permission, from the server.
  const visibleItems = sectionItems.filter((item) => {
    const itemModule = moduleForPath(item.href);
    if (itemModule && !moduleOn(itemModule)) return false;
    return navAllowed(item.href, can);
  });

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
