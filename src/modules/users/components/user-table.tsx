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
import { getUsersByCompany } from '@/services/userService';
import { getCompanies, getPositions } from '@/services/companyService';
import type { User, UserRole } from '@/modules/users/types';
import type { Company, Position } from '@/modules/companies/types';
import { useCompany } from '@/context/company-context';
import { Skeleton } from '@/components/ui/skeleton';

const roleColors: Record<UserRole, string> = {
    Admin: 'bg-primary text-primary-foreground',
    Manager: 'bg-accent text-accent-foreground',
    Employee: 'bg-secondary text-secondary-foreground',
}

export function UserTable() {
  const { selectedCompany } = useCompany();
  const [users, setUsers] = React.useState<User[]>([]);
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [positions, setPositions] = React.useState<Position[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function loadData() {
        if (!selectedCompany) return;
        setLoading(true);
        const [usersData, companiesData, positionsData] = await Promise.all([
            getUsersByCompany(selectedCompany.id),
            getCompanies(),
            getPositions(),
        ]);
        setUsers(usersData);
        setCompanies(companiesData);
        setPositions(positionsData);
        setLoading(false);
    }
    loadData();
  }, [selectedCompany]);

  if (loading) {
      return (
          <div className="rounded-lg border">
              <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Company</TableHead>
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
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Position</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const company = companies.find(c => c.id === user.companyId);
            const position = positions.find(p => p.id === user.positionId);
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
                <TableCell>{company?.name || 'N/A'}</TableCell>
                <TableCell>{position?.title || 'N/A'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={roleColors[user.role]}>{user.role}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem>Edit User</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10">
                        Delete User
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  );
}
