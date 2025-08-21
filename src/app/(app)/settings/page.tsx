'use client';

import * as React from 'react';
import { SettingsPage } from '@/modules/settings/components/settings-page';
import { useAuthGuard } from '@/hooks/use-auth-guard';

export default function SettingsRoute() {
  const { user, loading } = useAuthGuard(['Admin']);

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
