'use client';

/**
 * The company-side Group screens (group-wide people, role templates) hosted
 * in the platform admin panel: the super admin is kept out of the company
 * app, so "Open group page" in Admin → Groups lands here.
 */
import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { GroupBaseProvider, useTr } from '@/modules/authz/components/shared';

export function AdminGroupFrame({ children, back = true }: { children: React.ReactNode; back?: boolean }) {
  const { tr } = useTr();
  return (
    <GroupBaseProvider value="/admin/groups">
      {back && (
        <div className="mx-auto w-full max-w-5xl">
          <Link
            href="/admin?tab=groups"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            {tr('System administration', 'إدارة النظام')}
          </Link>
        </div>
      )}
      {children}
    </GroupBaseProvider>
  );
}
