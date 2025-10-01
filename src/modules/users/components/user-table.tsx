
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
import { getUsers, deleteUser } from '@/services/userService';
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

const roleColors: Record<UserRole, string> = {
    Admin: 'bg-primary text-primary-foreground',
    Manager: 'bg-accent text-accent-foreground',
    Employee: 'bg-secondary text-secondary-foreground',
    Accountant: 'bg-emerald-500 text-white',
}

interface UserTableProps {
  onUserUpdated: () => void;
  currentUserRole?: UserRole;
}

export function UserTable({ onUserUpdated, currentUserRole }: UserTableProps) {
  const { selectedCompany, companies } = useCompany();
  const [users, setUsers] = React.useState<User[]>([]);
  const [positions, setPositions] = React.useState<Position[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editingUser, setEditingUser] = React.useState<User | null>(null);
  const [userToDelete, setUserToDelete] = React.useState<User | null>(null);
  const { toast } = useToast();

  const fetchData = React.useCallback(async () => {
      setLoading(true);
      try {
        // Fetch all users and all positions, then filter client-side
        const [allUsers, allPositions] = await Promise.all([
            getUsers(),
            getPositions(),
        ]);
        
        let displayUsers = allUsers;
        if (selectedCompany && currentUserRole !== 'Admin') {
             displayUsers = allUsers.filter(u => u.companyIds && u.companyIds.includes(selectedCompany.id));
        }

        setUsers(displayUsers);
        setPositions(allPositions);
      } catch (error) {
        console.error("Failed to fetch user table data:", error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Could not load user data.',
        });
      } finally {
        setLoading(false);
      }
  }, [selectedCompany, currentUserRole, toast]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);
  
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
        description: `User "${userToDelete.name}" has been deleted from Firestore. The Auth user must be deleted manually.`,
      });
      fetchData();
      setUserToDelete(null);
    } catch (error) {
       toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete user.',
      });
    }
  }

  const canManageUser = (targetUser: User) => {
    if (!currentUserRole) return false;
    if (currentUserRole === 'Admin') return true;
    if (currentUserRole === 'Manager' && targetUser.role === 'Employee') return true;
    return false;
  }

  const getUserCompanies = (companyIds: string[]) => {
      return companies.filter(c => companyIds.includes(c.id)).map(c => c.name).join(', ');
  }


  if (loading) {
      return (
          <div className="rounded-lg border">
              <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Companies</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
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
                             <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                             <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                             <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
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
              <TableHead>Companies</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const position = positions.find(p => p.id === user.positionId);
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
                  <TableCell className="max-w-xs truncate">{getUserCompanies(user.companyIds)}</TableCell>
                  <TableCell>{position?.title || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={roleColors[user.role]}>{user.role}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
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
