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
import { getPositions, getCompanies } from '@/services/companyService';
import type { Position, Company } from '@/modules/companies/types';
import { Skeleton } from '@/components/ui/skeleton';

export function PositionTable() {
  const [positions, setPositions] = React.useState<Position[]>([]);
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchData() {
        setLoading(true);
        const [positionsData, companiesData] = await Promise.all([
            getPositions(),
            getCompanies(),
        ]);
        setPositions(positionsData);
        setCompanies(companiesData);
        setLoading(false);
    }
    fetchData();
  }, []);

  if (loading) {
      return (
          <div className="rounded-lg border">
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>Position Title</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {[...Array(5)].map((_, i) => (
                          <TableRow key={i}>
                              <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                              <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                              <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
              </Table>
          </div>
      )
  }


  return (
    <div>
        <div className="flex justify-end mb-4">
            <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Position
            </Button>
        </div>
        <div className="rounded-lg border">
        <Table>
            <TableHeader>
            <TableRow>
                <TableHead>Position Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Actions</TableHead>
            </TableRow>
            </TableHeader>
            <TableBody>
            {positions.map((position) => {
              const company = companies.find(c => c.id === position.companyId);
              return (
                <TableRow key={position.id}>
                  <TableCell className="font-medium">{position.title}</TableCell>
                  <TableCell>{company?.name || 'N/A'}</TableCell>
                  <TableCell className="text-right">
                      <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                          </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                          <DropdownMenuItem>Edit Position</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10">
                          Delete Position
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
    </div>
  );
}
