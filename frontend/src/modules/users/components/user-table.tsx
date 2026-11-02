
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
import { showPasswordLink } from './password-link-dialog';
import { MoreHorizontal } from 'lucide-react';
import { getUsers, getUsersByCompany, deleteUser, sendPasswordReset } from '@/services/userService';
import { getPositions } from '@/services/companyService';
import type { User } from '@/modules/users/types';
import type { Position } from '@/modules/companies/types';
import { useCompany } from '@/context/company-context';
import { usePermissions } from '@/context/permissions-context';
import { useRouter } from 'next/navigation';
import { listPeople, listRoles, type Person, type Role } from '@/services/authzService';
import { beyondMe, holderFromAccess } from '@/modules/authz/lib/beyond';
import { useI18n } from '@/context/i18n-context';
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

interface UserTableProps {
  onUserUpdated: () => void;
  refreshToken?: number;
}

export function UserTable({ onUserUpdated, refreshToken = 0 }: UserTableProps) {
  const { selectedCompany, companies, currentUser } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [users, setUsers] = React.useState<User[]>([]);
  const [positions, setPositions] = React.useState<Position[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editingUser, setEditingUser] = React.useState<User | null>(null);
  const [userToDelete, setUserToDelete] = React.useState<User | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const resetPassword = async (person: User) => {
    try {
      const result = await sendPasswordReset(person.id);
      if (result.sent) {
        toast({
          title: tr('Reset link sent', 'تم إرسال الرابط'),
          description: tr(`${person.name} got an email with a link to set a new password (valid 1 hour).`, `وصل ${person.name} بريد فيه رابط لتعيين كلمة مرور جديدة (صالح لمدة ساعة).`),
        });
      } else if (result.link) {
        showPasswordLink({ name: person.name, link: result.link, purpose: 'reset' });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not send the link', 'تعذّر إرسال الرابط'), description: error?.message });
    }
  };

  // In the selected company: managing users (profile, position, sign-in) is
  // people.manage. Roles are not changed here any more: they live in
  // Settings → People and roles (people.view_roles to open, manage_roles to change).
  const access = usePermissions();
  const { canAdmin, engine } = access;
  const canManageUsersHere = canAdmin('people.manage');
  const canSeeRolesHere = canAdmin('people.view_roles');
  const me = React.useMemo(() => holderFromAccess(access), [access]);
  // Main roles as the People API reports them (custom roles included), and the
  // company's roles, to tell who holds more than me.
  const [people, setPeople] = React.useState<Map<string, Person>>(new Map());
  const [roles, setRoles] = React.useState<Role[] | null>(null);
  React.useEffect(() => {
    if (!selectedCompany || !canSeeRolesHere) { setPeople(new Map()); setRoles(null); return; }
    let active = true;
    Promise.all([listPeople(selectedCompany.id), listRoles(selectedCompany.id)])
      .then(([list, r]) => { if (active) { setPeople(new Map(list.map((p) => [p.userId, p]))); setRoles(r); } })
      .catch(() => { if (active) { setPeople(new Map()); setRoles(null); } });
    return () => { active = false; };
  }, [selectedCompany, canSeeRolesHere, refreshToken]);

  /**
   * The roles that decide the person here: under legacy/shadow their company
   * role (as its standard role), under v2 their main role and add-ons.
   * Null when unknown (no roles read): the server decides then.
   */
  const decidingRoles = (targetUser: User): Role[] | null => {
    if (!roles) return null;
    if (engine && engine !== 'v2') {
      const key = String(getRoleForCompany(targetUser)).toLowerCase();
      const standard = roles.find((r) => r.kind === 'system' && r.key === key);
      return standard ? [standard] : null;
    }
    const person = people.get(targetUser.id);
    if (!person) return null;
    const ids = new Set([person.mainRole?.id, ...person.addOns.filter((a) => a.isActive).map((a) => a.id)]);
    return roles.filter((r) => ids.has(r.id));
  };

  /** Holds access I don't: the server refuses to let me edit or delete them. */
  const aboveMe = (targetUser: User) => {
    const deciding = decidingRoles(targetUser);
    if (!deciding) return false;
    return beyondMe(me, deciding.flatMap((r) => r.grants), deciding.flatMap((r) => r.fields)).length > 0;
  };

  const fetchData = React.useCallback(async () => {
      // Without a company only the platform administrator lists everyone.
      if (!selectedCompany && !currentUser?.isSuperAdmin) {
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
            : currentUser?.isSuperAdmin
            ? getUsers()
            : Promise.resolve([]);
        // Positions are platform-wide; the server decides who reads them.
        const positionsPromise = getPositions().catch((error) => {
          if (isApiError(error) && (error.status === 401 || error.status === 403)) {
            return [];
          }
          throw error;
        });

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
          title: tr('Error', 'خطأ'),
          description: error?.message || tr('Could not load user data.', 'تعذر تحميل بيانات المستخدمين.'),
        });
        setUsers([]);
        setPositions([]);
      } finally {
        setLoading(false);
      }
  }, [currentUser?.isSuperAdmin, selectedCompany, toast]);

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
        title: tr('User Deleted', 'تم حذف المستخدم'),
        description: tr(`User "${userToDelete.name}" has been deleted.`, `تم حذف المستخدم "${userToDelete.name}".`),
      });
      fetchData();
      setUserToDelete(null);
    } catch (error: any) {
       toast({
        variant: 'destructive',
        title: tr('Error', 'خطأ'),
        description: error?.message || tr('Failed to delete user.', 'فشل حذف المستخدم.'),
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

  /**
   * A member of the selected company who holds no more than me, for someone
   * who manages users here. The server has the last word; its refusals are
   * coded and shown as one translated sentence.
   */
  const canManageUser = (targetUser: User) => {
    if (!selectedCompany) return false;
    const assignmentCompanyIds =
      targetUser.companyRoles && targetUser.companyRoles.length > 0
        ? targetUser.companyRoles.map((assignment) => assignment.companyId)
        : targetUser.companyIds || [];
    if (!assignmentCompanyIds.includes(selectedCompany.id)) return false;
    return canManageUsersHere && !aboveMe(targetUser);
  }

  /** The main role's name from People (custom roles included), else the company role. */
  const roleNameFor = (targetUser: User) => {
    const main = people.get(targetUser.id)?.mainRole;
    if (main) return language === 'ar' && main.nameAr ? main.nameAr : main.name;
    return getRoleForCompany(targetUser);
  };

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
                <TableHead>{tr('User', 'المستخدم')}</TableHead>
                <TableHead>{tr('Assignments', 'التعيينات')}</TableHead>
                <TableHead>{tr('Primary Role', 'الدور الأساسي')}</TableHead>
                <TableHead className="text-end">{tr('Actions', 'الإجراءات')}</TableHead>
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
              <TableHead>{tr('User', 'المستخدم')}</TableHead>
              <TableHead>{tr('Assignments', 'التعيينات')}</TableHead>
              <TableHead>{tr('Primary Role', 'الدور الأساسي')}</TableHead>
              <TableHead className="text-end">{tr('Actions', 'الإجراءات')}</TableHead>
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
                        <span className="text-xs text-muted-foreground">{tr('Position', 'المنصب')}: {position.title}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{roleNameFor(user)}</Badge></TableCell>
                  <TableCell className="text-end">
                    {(isManageable || (canSeeRolesHere && selectedCompany)) && (
                        <AlertDialog>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">{tr('Open menu', 'فتح القائمة')}</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            <DropdownMenuLabel>{tr('Actions', 'الإجراءات')}</DropdownMenuLabel>
                            {isManageable && (
                              <DropdownMenuItem onClick={() => setEditingUser(user)}>{tr('Edit User', 'تعديل المستخدم')}</DropdownMenuItem>
                            )}
                            {canSeeRolesHere && selectedCompany && (
                              <DropdownMenuItem onClick={() => router.push(`/settings/people/${encodeURIComponent(user.id)}`)}>
                                {tr('Roles and access', 'الأدوار والوصول')}
                              </DropdownMenuItem>
                            )}
                            {isManageable && (
                              <DropdownMenuItem onClick={() => void resetPassword(user)}>
                                {tr('Send password reset link', 'إرسال رابط إعادة تعيين كلمة المرور')}
                              </DropdownMenuItem>
                            )}
                            {isManageable && (
                            <AlertDialogTrigger asChild>
                                <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onSelect={(e) => { e.preventDefault(); setUserToDelete(user); }}>
                                {tr('Delete User', 'حذف المستخدم')}
                                </DropdownMenuItem>
                            </AlertDialogTrigger>
                            )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {userToDelete?.id === user.id && (
                            <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>{tr('Are you absolutely sure?', 'هل أنت متأكد تمامًا؟')}</AlertDialogTitle>
                                <AlertDialogDescription>
                                {tr(
                                  `This action cannot be undone. This will permanently delete the user "${userToDelete.name}" and revoke their access.`,
                                  `لا يمكن التراجع عن هذا الإجراء. سيؤدي ذلك إلى حذف المستخدم "${userToDelete.name}" نهائيًا وإلغاء صلاحيات وصوله.`,
                                )}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setUserToDelete(null)}>{tr('Cancel', 'إلغاء')}</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDelete}>{tr('Continue', 'متابعة')}</AlertDialogAction>
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
        />
      )}
    </>
  );
}
