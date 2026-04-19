'use client';

import * as React from 'react';
import { CompanyProvider } from '@/context/company-context';
import { SidebarProvider } from '@/components/ui/sidebar';
import { I18nProvider } from '@/context/i18n-context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <CompanyProvider>
        <SidebarProvider>
          {children}
        </SidebarProvider>
      </CompanyProvider>
    </I18nProvider>
  );
}
