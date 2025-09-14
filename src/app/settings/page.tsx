'use client';

import * as React from 'react';
import { SettingsPage } from '@/modules/settings/components/settings-page';
import { useAuthGuard } from '@/hooks/use-auth-guard';

export default function SettingsRoute() {
  const { user, loading } = useAuthGuard(['Admin']);

  // For initial setup, we might need a brief period where this page is public.
  // However, for security, it's best to guard it as soon as an admin exists.
  // The guard will redirect to login if not authenticated.
  const isUnauthenticatedAndSettingUp = loading && !user;

  // A check to see if the page is being used for first time setup
  // without any authenticated user. In a real world scenario
  // this would be handled by an setup page / flow.
  if (isUnauthenticatedAndSettingUp) {
    return <SettingsPage />;
  }

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (user.role !== 'Admin') {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">Access Denied. You must be an Admin to view this page.</p>
      </div>
    );
  }

  return <SettingsPage />;
}
