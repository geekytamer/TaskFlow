'use client';

import * as React from 'react';
import { UserTable } from '@/modules/users/components/user-table';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { AddUserSheet } from './add-user-sheet';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';

export function UsersPage() {
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [refreshToken, setRefreshToken] = React.useState(0);
  const { user, effectiveRole } = useAuthGuard(['Admin', 'Manager']);
  const { t } = useI18n();

  const handleUsersChanged = () => {
    setRefreshToken((current) => current + 1);
    setIsSheetOpen(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="text-3xl font-bold font-headline">{t('users.title')}</h1>
          <p className="text-muted-foreground">
            {t('users.subtitle')}
          </p>
        </div>
        {user && effectiveRole && ['Admin', 'Manager'].includes(effectiveRole) && (
          <AddUserSheet
            open={isSheetOpen}
            onOpenChange={setIsSheetOpen}
            onUserAdded={handleUsersChanged}
            currentUserRole={effectiveRole}
          >
            <Button>
              <PlusCircle className="me-2 h-4 w-4" />
              {t('users.addUser')}
            </Button>
          </AddUserSheet>
        )}
      </div>
      <UserTable
        onUserUpdated={handleUsersChanged}
        currentUserRole={effectiveRole}
        refreshToken={refreshToken}
      />
    </div>
  );
}
