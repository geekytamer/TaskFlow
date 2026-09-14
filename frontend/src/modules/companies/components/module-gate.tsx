'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { PowerOff } from 'lucide-react';
import { usePermissions } from '@/context/permissions-context';
import { useI18n } from '@/context/i18n-context';
import { moduleLabel } from '@/modules/permissions/lib/labels';
import { moduleForPath } from '../lib/company-modules';

/**
 * Stands in for a page whose module the company has switched off. The server
 * refuses the module's requests anyway; this says why, instead of a page of errors.
 */
export function ModuleGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { moduleOn } = usePermissions();
  const { t, language } = useI18n();
  const pageModule = pathname ? moduleForPath(pathname) : undefined;
  if (!pageModule || moduleOn(pageModule)) return <>{children}</>;
  const name = moduleLabel(pageModule, t);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center" data-testid="module-off">
      <PowerOff className="h-10 w-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">
        {language === 'ar' ? `${name} متوقفة لهذه الشركة` : `${name} is turned off for this company`}
      </h1>
      <p className="text-sm text-muted-foreground">
        {language === 'ar' ? 'يمكن لمسؤول المنصة تشغيلها.' : 'The platform administrator can turn it on.'}
      </p>
    </div>
  );
}
