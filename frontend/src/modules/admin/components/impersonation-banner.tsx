'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { endImpersonation, isImpersonating } from '@/services/adminService';
import { useCurrentUser } from '@/hooks/use-current-user';
import { LogOut, ShieldAlert } from 'lucide-react';
import { useI18n } from '@/context/i18n-context';

export function ImpersonationBanner() {
  const { user } = useCurrentUser();
  const { t } = useI18n();
  const [active, setActive] = React.useState(false);
  React.useEffect(() => { setActive(isImpersonating()); }, []);
  if (!active) return null;
  return (
    <div className="sticky top-0 z-50 flex items-center gap-3 bg-amber-500 text-amber-950 px-4 py-2 text-sm shadow-md">
      <ShieldAlert className="h-4 w-4" />
      <span className="font-medium">
        {t('admin.impersonatingAs').replace('{name}', user?.name || '?')}
      </span>
      <span className="text-xs opacity-80">{t('admin.impersonatingHint')}</span>
      <Button
        size="sm" variant="outline"
        className="ms-auto bg-white text-amber-900 border-amber-900/30 hover:bg-amber-50"
        onClick={endImpersonation}
      >
        <LogOut className="me-1 h-3.5 w-3.5" />
        {t('admin.endImpersonation')}
      </Button>
    </div>
  );
}
