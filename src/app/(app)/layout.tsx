'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  SidebarProvider,
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
import { CompanyProvider } from '@/context/company-context';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    // Mock auth check
    const user = localStorage.getItem('taskflow_user');
    if (user) {
      setIsAuthenticated(true);
    } else {
      router.push('/login');
    }
    setIsLoading(false);
  }, [router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
         <div className="flex flex-col items-center gap-4">
          <Logo className="h-12 w-12 text-primary animate-pulse" />
          <p className="text-muted-foreground">Loading TaskFlow...</p>
        </div>
      </div>
    );
  }

  return (
    <CompanyProvider>
      <SidebarProvider>
        <Sidebar>
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
            <UserNav />
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm sm:px-6">
            <SidebarTrigger className="md:hidden" />
            <CompanySwitcher />
          </header>
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </CompanyProvider>
  );
}
