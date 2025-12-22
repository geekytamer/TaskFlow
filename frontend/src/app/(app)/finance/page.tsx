'use client';

import * as React from 'react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { FinancePage } from '@/modules/finance/components/finance-page';

export default function FinanceRoute() {
  const { user, loading } = useAuthGuard(['Admin', 'Accountant']);

  if (loading || !user) {
    return (
       <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!['Admin', 'Accountant'].includes(user.role)) {
     return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">Access Denied. You must be an Admin or Accountant to view this page.</p>
      </div>
    );
  }

  return <FinancePage />;
}
