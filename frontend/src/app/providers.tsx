'use client';

import * as React from 'react';
import { CompanyProvider } from '@/context/company-context';
import { CompanyScopeProvider } from '@/context/company-scope-context';
import { PermissionsProvider } from '@/context/permissions-context';
import { I18nProvider } from '@/context/i18n-context';
import { ThemeProvider } from '@/context/theme-context';
import { BrandProvider } from '@/modules/branding/brand-context';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { CreditLimitBridge } from '@/components/credit-limit-bridge';
import { ForbiddenBridge } from '@/components/forbidden-bridge';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
    <I18nProvider>
      <CompanyProvider>
        <CompanyScopeProvider>
        <BrandProvider>
        <PermissionsProvider>
          <ConfirmProvider>
            <CreditLimitBridge />
            <ForbiddenBridge />
            {children}
          </ConfirmProvider>
        </PermissionsProvider>
        </BrandProvider>
        </CompanyScopeProvider>
      </CompanyProvider>
    </I18nProvider>
    </ThemeProvider>
  );
}
