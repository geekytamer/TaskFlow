'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/icons/logo';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { LanguageSwitcher } from '@/modules/layout/components/language-switcher';
import { logout } from '@/services/authService';
import { useCurrentUser } from '@/hooks/use-current-user';
import { ShieldCheck, LogOut, ArrowRightToLine } from 'lucide-react';

/**
 * Minimal chrome for the super-admin surface. No company switcher, no
 * sidebar, no CRM nav — just a thin header with the logo, language
 * switcher, "Switch to app" button, and a sign-out menu. Gated to
 * users whose global role is "Admin".
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthGuard(['Admin']);
  const { user: liveUser } = useCurrentUser();
  const { t } = useI18n();
  const router = useRouter();

  if (loading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (!user.isSuperAdmin) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <p className="text-muted-foreground">{t('common.accessDenied')}</p>
      </div>
    );
  }

  const handleLogout = async () => {
    try { await logout(); } catch { /* no-op */ }
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card/95 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <Logo className="h-6 w-6 text-primary" />
          <div className="flex items-baseline gap-2">
            <span className="font-headline text-lg font-bold tracking-tight text-primary">
              TaskFlow
            </span>
            <span className="hidden items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900 sm:inline-flex">
              <ShieldCheck className="h-3 w-3" />
              {t('admin.chrome.tag')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/">
            <Button variant="outline" size="sm">
              <ArrowRightToLine className="me-1.5 h-3.5 w-3.5" />
              {t('admin.chrome.switchToApp')}
            </Button>
          </Link>
          <LanguageSwitcher />
          <div className="hidden items-center gap-2 sm:flex">
            <Avatar className="h-8 w-8">
              <AvatarImage src={liveUser?.avatar} alt={liveUser?.name} />
              <AvatarFallback>{liveUser?.name?.charAt(0) ?? 'A'}</AvatarFallback>
            </Avatar>
            <div className="text-end">
              <div className="text-xs font-medium leading-tight">{liveUser?.name}</div>
              <div className="text-[10px] leading-tight text-muted-foreground">{liveUser?.email}</div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} title={t('admin.chrome.signOut')}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
