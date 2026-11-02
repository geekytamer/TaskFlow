'use client';

import * as React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/i18n-context';
import { usePermissionsOptional } from '@/context/permissions-context';

/**
 * Shown while the person's permissions could not be loaded. Every gate stays
 * closed meanwhile; this says so and offers Retry, instead of a page that
 * spins forever or a menu that silently lost its entries.
 */
export function PermissionsErrorNotice({ compact = false }: { compact?: boolean }) {
  const permissions = usePermissionsOptional();
  const { language } = useI18n();
  if (!permissions?.error) return null;
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  return (
    <div
      role="alert"
      data-testid="permissions-error"
      className={compact
        ? 'mx-2 my-2 flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs'
        : 'mx-3 mt-3 flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm sm:mx-6'}
    >
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        {tr("Couldn't load your permissions.", 'تعذّر تحميل صلاحياتك.')}
      </span>
      <Button size="sm" variant="outline" onClick={permissions.refresh} className="gap-1">
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        {tr('Retry', 'إعادة المحاولة')}
      </Button>
    </div>
  );
}
