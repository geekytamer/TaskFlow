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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, PlusCircle } from 'lucide-react';
import { useCompany } from '@/context/company-context';
import type { Company } from '@/modules/companies/types';
import { getCompanies } from '@/services/companyService';

export function CompanyTable() {
  const { companies } = useCompany();

  return (
    <div>
        <div className="flex justify-end mb-4">
            <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Company
            </Button>
        </div>
        <div className="rounded-lg border">
        <Table>
            <TableHeader>
            <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>Address</TableHead>
                <TableHead className="text-right">Actions</TableHead>
            </TableRow>
            </TableHeader>
            <TableBody>
            {companies.map((company) => (
                <TableRow key={company.id}>
                <TableCell className="font-medium">{company.name}</TableCell>
                <TableCell>
                    <a href={`http://${company.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {company.website}
                    </a>
                </TableCell>
                <TableCell>{company.address}</TableCell>
                <TableCell className="text-right">
                    <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem>Edit Company</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10">
                        Delete Company
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                    </DropdownMenu>
                </TableCell>
                </TableRow>
            ))}
            </TableBody>
        </Table>
        </div>
    </div>
  );
}
