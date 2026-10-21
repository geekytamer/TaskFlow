'use client';

import * as React from 'react';
import { CompanyProvider } from '@/context/company-context';
import { PermissionsProvider } from '@/context/permissions-context';
import { I18nProvider } from '@/context/i18n-context';
import { ThemeProvider } from '@/context/theme-context';
import { BrandProvider } from '@/modules/branding/brand-context';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { CreditLimitBridge } from '@/components/credit-limit-bridge';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
    <I18nProvider>
      <CompanyProvider>
        <BrandProvider>
        <PermissionsProvider>
          <ConfirmProvider>
            <CreditLimitBridge />
            {children}
          </ConfirmProvider>
        </PermissionsProvider>
        </BrandProvider>
      </CompanyProvider>
    </I18nProvider>
    </ThemeProvider>
  );
}
