
'use client';

import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoreHorizontal } from 'lucide-react';
import { getUsers, getUsersByCompany, deleteUser } from '@/services/userService';
import { getPositions } from '@/services/companyService';
import type { User, UserRole } from '@/modules/users/types';
import type { Position } from '@/modules/companies/types';
import { useCompany } from '@/context/company-context';
import { Skeleton } from '@/components/ui/skeleton';
import { AddUserSheet } from './add-user-sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { isApiError } from '@/lib/api-client';

const roleColors: Record<UserRole, string> = {
    Admin: 'bg-primary text-primary-foreground',
    Manager: 'bg-accent text-accent-foreground',
    Employee: 'bg-secondary text-secondary-foreground',
    Accountant: 'bg-emerald-500 text-white',
}

interface UserTableProps {
  onUserUpdated: () => void;
  currentUserRole?: UserRole;
  refreshToken?: number;
}

export function UserTable({ onUserUpdated, currentUserRole, refreshToken = 0 }: UserTableProps) {
  const { selectedCompany, companies, currentUser } = useCompany();
  const [users, setUsers] = React.useState<User[]>([]);
  const [positions, setPositions] = React.useState<Position[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editingUser, setEditingUser] = React.useState<User | null>(null);
  const [userToDelete, setUserToDelete] = React.useState<User | null>(null);
  const { toast } = useToast();

  const managedCompanyIds = React.useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'Admin') {
      return companies.map((company) => company.id);
    }
    return (currentUser.companyRoles || [])
      .filter((assignment) => ['Admin', 'Manager'].includes(assignment.role))
      .map((assignment) => assignment.companyId);
  }, [companies, currentUser]);

  const fetchData = React.useCallback(async () => {
      if (!selectedCompany && currentUser?.role !== 'Admin') {
        setUsers([]);
        setPositions([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const usersPromise =
          selectedCompany
            ? getUsersByCompany(selectedCompany.id)
            : currentUser?.role === 'Admin'
            ? getUsers()
            : Promise.resolve([]);
        const positionsPromise =
          currentUser?.role === 'Admin'
            ? getPositions().catch((error) => {
                if (isApiError(error) && (error.status === 401 || error.status === 403)) {
                  return [];
                }
                throw error;
              })
            : Promise.resolve([]);

        const [scopedUsers, allPositions] = await Promise.all([
            usersPromise,
            positionsPromise,
        ]);

        setUsers(scopedUsers);
        setPositions(allPositions);
      } catch (error: any) {
        console.error("Failed to fetch user table data:", error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: error?.message || 'Could not load user data.',
        });
        setUsers([]);
        setPositions([]);
      } finally {
        setLoading(false);
      }
  }, [currentUser?.role, selectedCompany, toast]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData, refreshToken]);
  
  const handleUserUpdated = () => {
    fetchData(); // Re-fetch data for the table
    onUserUpdated(); // Notify parent page
    setEditingUser(null);
  }

  const handleDelete = async () => {
    if (!userToDelete) return;
    try {
      await deleteUser(userToDelete.id);
      toast({
        title: 'User Deleted',
        description: `User "${userToDelete.name}" has been deleted.`,
      });
      fetchData();
      setUserToDelete(null);
    } catch (error: any) {
       toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'Failed to delete user.',
      });
    }
  }

  const getRoleForCompany = (user: User) => {
    if (selectedCompany && user.companyRoles && user.companyRoles.length > 0) {
      const match = user.companyRoles.find((cr) => cr.companyId === selectedCompany.id);
      if (match) return match.role;
    }
    return user.role;
  };

  const canManageUser = (targetUser: User) => {
    if (!currentUserRole) return false;
    if (!selectedCompany) return false;
    const assignmentCompanyIds =
      targetUser.companyRoles && targetUser.companyRoles.length > 0
        ? targetUser.companyRoles.map((assignment) => assignment.companyId)
        : targetUser.companyIds || [];
    const isWithinManagedScope = assignmentCompanyIds.every((companyId) =>
      managedCompanyIds.includes(companyId),
    );
    if (!isWithinManagedScope) return false;
    const targetRole = getRoleForCompany(targetUser);
    if (currentUser?.role === 'Admin') return true;
    if (currentUserRole === 'Admin') return true;
    if (currentUserRole === 'Manager' && targetRole === 'Employee') return true;
    return false;
  }

  const getUserCompanies = (companyIds: string[]) => {
      if (!companyIds) return '';
      return companies.filter(c => companyIds.includes(c.id)).map(c => c.name).join(', ');
  }


  if (loading) {
      return (
          <div className="rounded-lg border">
              <Table>
        <TableHeader>
            <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Assignments</TableHead>
                <TableHead>Primary Role</TableHead>
                <TableHead className="text-end">Actions</TableHead>
            </TableRow>
        </TableHeader>
                <TableBody>
                     {[...Array(5)].map((_, i) => (
                         <TableRow key={i}>
                             <TableCell>
                                <div className="flex items-center gap-3">
                                    <Skeleton className="h-10 w-10 rounded-full" />
                                    <div>
                                        <Skeleton className="h-5 w-24 mb-1" />
                                        <Skeleton className="h-4 w-32" />
                                    </div>
                         </div>
                         </TableCell>
                         <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                         <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                         <TableCell className="text-end"><Skeleton className="h-8 w-8 ms-auto" /></TableCell>
                     </TableRow>
                 ))}
                </TableBody>
              </Table>
          </div>
      )
  }

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Assignments</TableHead>
              <TableHead>Primary Role</TableHead>
              <TableHead className="text-end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const primaryAssignment = user.companyRoles?.[0];
              const primaryPositionId = primaryAssignment?.positionId || user.positionId;
              const position = positions.find(p => p.id === primaryPositionId);
              const assignmentsLabel =
                user.companyRoles && user.companyRoles.length > 0
                  ? user.companyRoles
                      .map((cr) => {
                        const companyName = companies.find((c) => c.id === cr.companyId)?.name || cr.companyId;
                        return `${companyName}: ${cr.role}`;
                      })
                      .join(' • ')
                  : getUserCompanies(user.companyIds);
              const isManageable = canManageUser(user);
              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm">{assignmentsLabel}</span>
                      {position?.title && (
                        <span className="text-xs text-muted-foreground">Position: {position.title}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className={roleColors[getRoleForCompany(user)]}>{getRoleForCompany(user)}</Badge></TableCell>
                  <TableCell className="text-end">
                    {isManageable && (
                        <AlertDialog>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setEditingUser(user)}>Edit User</DropdownMenuItem>
                            <AlertDialogTrigger asChild>
                                <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onSelect={(e) => { e.preventDefault(); setUserToDelete(user); }}>
                                Delete User
                                </DropdownMenuItem>
                            </AlertDialogTrigger>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {userToDelete?.id === user.id && (
                            <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the
                                user "{userToDelete.name}" from Firestore. Note: this does not delete the user from Firebase Authentication.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setUserToDelete(null)}>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDelete}>Continue</AlertDialogAction>
                            </AlertDialogFooter>
                            </AlertDialogContent>
                        )}
                        </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
       {editingUser && (
        <AddUserSheet
          open={!!editingUser}
          onOpenChange={(isOpen) => !isOpen && setEditingUser(null)}
          onUserAdded={handleUserUpdated}
          userToEdit={editingUser}
          currentUserRole={currentUserRole}
        />
      )}
    </>
  );
}
