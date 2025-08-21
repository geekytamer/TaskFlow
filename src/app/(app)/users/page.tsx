'use client';

import * as React from 'react';
import { UsersPage } from '@/modules/users/components/users-page';
import { useAuthGuard } from '@/hooks/use-auth-guard';

export default function UsersRoute() {
  const { user, loading } = useAuthGuard(['Admin', 'Manager']);

  if (loading || !user) {
    return (
       <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

   if (!['Admin', 'Manager'].includes(user.role)) {
     return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">Access Denied. You must be an Admin or Manager to view this page.</p>
      </div>
    );
  }

  return <UsersPage />;
}
