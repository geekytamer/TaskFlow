'use client';

import * as React from 'react';
import { CompanyProvider } from '@/context/company-context';
import { SidebarProvider } from '@/components/ui/sidebar';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <SidebarProvider>
        {children}
      </SidebarProvider>
    </CompanyProvider>
  );
}
