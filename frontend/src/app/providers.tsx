'use client';

import * as React from 'react';
import { CompanyProvider } from '@/context/company-context';
import { I18nProvider } from '@/context/i18n-context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <CompanyProvider>
        {children}
      </CompanyProvider>
    </I18nProvider>
  );
}
