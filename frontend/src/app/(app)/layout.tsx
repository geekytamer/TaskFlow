
'use client';

import * as React from 'react';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { UserNav } from '@/modules/users/components/user-nav';
import { CompanySwitcher } from '@/modules/companies/components/company-switcher';
import { SidebarNav } from '@/modules/layout/components/sidebar-nav';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useCompany } from '@/context/company-context';
import { BrandMark } from '@/modules/branding/brand-mark';
import { useBrand } from '@/modules/branding/brand-context';
import { EnableNotificationsPrompt } from '@/modules/notifications/components/enable-notifications-prompt';
import { startLive } from '@/lib/live';
import { MobileTabBar } from '@/modules/layout/components/mobile-tab-bar';
import { DrawerPreferences } from '@/modules/layout/components/drawer-preferences';
import { LanguageSwitcher } from '@/modules/layout/components/language-switcher';
import { ThemeSwitcher } from '@/modules/layout/components/theme-switcher';
import { useI18n } from '@/context/i18n-context';
import { TourProvider } from '@/components/tutorial/tour-context';
import { AcademyProvider } from '@/modules/academy/academy-context';
import { AcademyDock } from '@/modules/academy/components/academy-dock';
import { AcademyGate, PracticeBanner } from '@/modules/academy/components/academy-gate';
import { TourOverlay } from '@/components/tutorial/tour-overlay';
import { TourHelpButton, WelcomeTourModal } from '@/components/tutorial/tour-launcher';
import { CommandPalette } from '@/modules/layout/components/command-palette';
import { NotificationBell } from '@/modules/layout/components/notification-bell';
import { ImpersonationBanner } from '@/modules/admin/components/impersonation-banner';
import { StagingBanner } from '@/modules/layout/components/staging-banner';
import { ModuleGate } from '@/modules/companies/components/module-gate';
import { PermissionsErrorNotice } from '@/components/permissions-error';
import { isImpersonating } from '@/services/adminService';
import { Search } from 'lucide-react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading: authLoading } = useAuthGuard();
  const { currentUser, loading: companyLoading } = useCompany();
  const { t, isRtl } = useI18n();
  const { brandText } = useBrand();

  // One live-update stream for the whole app (lib/live.ts).
  React.useEffect(() => {
    if (currentUser) startLive();
  }, [currentUser]);

  // The main loading condition. We wait for auth to resolve AND the company context to load.
  // We also explicitly check if currentUser exists before showing the app.
  const isLoading = authLoading || companyLoading || !currentUser;

  // Super-admins never use the company-scoped app directly. They must
  // impersonate a user to see this UI. Detect this case so we can both
  // (a) redirect, and (b) AVOID mounting any company-scoped components,
  // which would otherwise fire 403s and re-render in a loop while the
  // browser navigates away.
  const isSuperAdminOutsideAdmin =
    !isLoading &&
    !!currentUser?.isSuperAdmin &&
    !isImpersonating() &&
    typeof window !== 'undefined' &&
    !window.location.pathname.startsWith('/admin');

  // Perform the navigation as a side effect (not during render) so it runs
  // exactly once and never participates in the render cycle.
  React.useEffect(() => {
    if (isSuperAdminOutsideAdmin) {
      window.location.replace('/admin');
    }
  }, [isSuperAdminOutsideAdmin]);

  // While we are a super-admin being redirected, render ONLY a static
  // loading screen. Never mount the sidebar, dashboard, or `children`.
  if (isSuperAdminOutsideAdmin) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
         <div className="flex flex-col items-center gap-4">
          <BrandMark className="animate-pulse" logoClassName="h-12 w-12" nameClassName="sr-only" />
          <p className="text-muted-foreground">{brandText(t('app.loadingTaskflow'))}</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
    <TourProvider>
    <AcademyProvider>
      <Sidebar side={isRtl ? 'right' : 'left'}>
        <SidebarHeader className="p-4">
          <BrandMark
            className="px-2 group-data-[collapsible=icon]:hidden"
            logoClassName="h-8 w-8"
            nameClassName="font-headline text-2xl font-bold text-sidebar-primary"
          />
        </SidebarHeader>
        <SidebarContent>
          <SidebarNav />
        </SidebarContent>
        <SidebarFooter>
          <DrawerPreferences />
          <div className="px-2 pb-1">
            <TourHelpButton />
          </div>
          <UserNav />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <StagingBanner />
        <ImpersonationBanner />
        <PracticeBanner />
        <PermissionsErrorNotice />
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b bg-background/80 px-3 backdrop-blur-sm sm:px-6 md:h-16">
          {/* Phones: the brand here, the menu in the bottom bar's "More". */}
          <BrandMark className="md:hidden" logoClassName="h-7 w-7" nameClassName="font-headline text-base font-bold text-primary" />
          <button
            type="button"
            onClick={() => {
              const evt = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
              window.dispatchEvent(evt);
            }}
            className="ms-2 hidden items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted md:flex"
          >
            <Search className="h-3.5 w-3.5" />
            <span>{t('cmdk.button')}</span>
            <kbd className="ms-2 hidden rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:inline">
              ⌘K
            </kbd>
          </button>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-4">
            <button
              type="button"
              aria-label={t('cmdk.button')}
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background/60 text-muted-foreground transition hover:bg-muted md:hidden"
            >
              <Search className="h-4 w-4" />
            </button>
            <NotificationBell />
            <div className="hidden items-center gap-4 md:flex">
              <ThemeSwitcher />
              <LanguageSwitcher />
            </div>
            <CompanySwitcher />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6"><EnableNotificationsPrompt /><ModuleGate><AcademyGate>{children}</AcademyGate></ModuleGate></main>
      </SidebarInset>
      <MobileTabBar />
      <TourOverlay />
      <WelcomeTourModal />
      <CommandPalette />
      <AcademyDock />
    </AcademyProvider>
    </TourProvider>
    </SidebarProvider>
  );
}
