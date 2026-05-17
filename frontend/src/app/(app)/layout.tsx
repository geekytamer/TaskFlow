
'use client';

import * as React from 'react';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { UserNav } from '@/modules/users/components/user-nav';
import { CompanySwitcher } from '@/modules/companies/components/company-switcher';
import { SidebarNav } from '@/modules/layout/components/sidebar-nav';
import { Logo } from '@/components/icons/logo';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useCompany } from '@/context/company-context';
import { LanguageSwitcher } from '@/modules/layout/components/language-switcher';
import { useI18n } from '@/context/i18n-context';
import { TourProvider } from '@/components/tutorial/tour-context';
import { TourOverlay } from '@/components/tutorial/tour-overlay';
import { TourHelpButton, WelcomeTourModal } from '@/components/tutorial/tour-launcher';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading: authLoading } = useAuthGuard();
  const { currentUser, loading: companyLoading } = useCompany();
  const { t, isRtl } = useI18n();

  // The main loading condition. We wait for auth to resolve AND the company context to load.
  // We also explicitly check if currentUser exists before showing the app.
  const isLoading = authLoading || companyLoading || !currentUser;

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
         <div className="flex flex-col items-center gap-4">
          <Logo className="h-12 w-12 text-primary animate-pulse" />
          <p className="text-muted-foreground">{t('app.loadingTaskflow')}</p>
        </div>
      </div>
    );
  }

  return (
    <TourProvider>
      <Sidebar side={isRtl ? 'right' : 'left'}>
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="group-data-[collapsible=icon]:hidden">
              <Logo className="h-6 w-6 text-primary" />
            </Button>
            <h2 className="font-headline text-2xl font-bold text-primary group-data-[collapsible=icon]:hidden">
              TaskFlow
            </h2>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarNav />
        </SidebarContent>
        <SidebarFooter>
          <div className="px-2 pb-1">
            <TourHelpButton />
          </div>
          <UserNav />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm sm:px-6">
          <SidebarTrigger className="md:hidden" />
          <div className="flex items-center gap-2 sm:gap-4">
            <LanguageSwitcher />
            <CompanySwitcher />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </SidebarInset>
      <TourOverlay />
      <WelcomeTourModal />
    </TourProvider>
  );
}
