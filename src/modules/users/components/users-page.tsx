'use client';

import * as React from 'react';
import { UserTable } from '@/modules/users/components/user-table';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { AddUserSheet } from './add-user-sheet';
import { getUsers } from '@/services/userService';
import type { User } from '../types';

export function UsersPage() {
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  // We need to re-fetch users here to pass to the table for potential refresh
  const [users, setUsers] = React.useState<User[]>([]);

  const refreshUsers = async () => {
    // In a real app with better state management, this might not be needed,
    // but for now it ensures the table is up-to-date.
    const freshUsers = await getUsers();
    setUsers(freshUsers);
  };

  React.useEffect(() => {
    refreshUsers();
  }, []);


  const handleUserAdded = () => {
    refreshUsers();
    setIsSheetOpen(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="text-3xl font-bold font-headline">User Management</h1>
          <p className="text-muted-foreground">
            Add, edit, and manage users for your company.
          </p>
        </div>
        <AddUserSheet
          open={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          onUserAdded={handleUserAdded}
        >
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </AddUserSheet>
      </div>
      <UserTable onUserUpdated={refreshUsers} />
    </div>
  );
}
