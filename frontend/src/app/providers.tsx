'use client';

import * as React from 'react';
import { CompanyProvider } from '@/context/company-context';
import { PermissionsProvider } from '@/context/permissions-context';
import { I18nProvider } from '@/context/i18n-context';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <CompanyProvider>
        <PermissionsProvider>
          <ConfirmProvider>
            {children}
          </ConfirmProvider>
        </PermissionsProvider>
      </CompanyProvider>
    </I18nProvider>
  );
}
