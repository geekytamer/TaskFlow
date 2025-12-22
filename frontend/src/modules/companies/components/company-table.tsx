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
import { AddCompanyDialog } from './add-company-dialog';
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
import { deleteCompany } from '@/services/companyService';
import { useToast } from '@/hooks/use-toast';
import type { Company } from '../types';

export function CompanyTable() {
  const { companies, refreshCompanies } = useCompany();
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [companyToDelete, setCompanyToDelete] = React.useState<Company | null>(null);
  const { toast } = useToast();

  const onCompanyAdded = () => {
    refreshCompanies();
  }

  const handleDelete = async () => {
    if (!companyToDelete) return;
    try {
      await deleteCompany(companyToDelete.id);
      toast({
        title: 'Company Deleted',
        description: `Company "${companyToDelete.name}" has been deleted.`,
      });
      refreshCompanies();
      setCompanyToDelete(null);
    } catch (error) {
       toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete company.',
      });
    }
  }

  return (
    <div>
        <div className="flex justify-end mb-4">
            <AddCompanyDialog 
              open={isAddDialogOpen}
              onOpenChange={setIsAddDialogOpen}
              onCompanyAdded={onCompanyAdded}
            >
              <Button>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Company
              </Button>
            </AddCompanyDialog>
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
                  <AlertDialog>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                          </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                          <DropdownMenuItem>Edit Company</DropdownMenuItem>
                           <AlertDialogTrigger asChild>
                            <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onSelect={(e) => {e.preventDefault(); setCompanyToDelete(company)}}>
                              Delete Company
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {companyToDelete?.id === company.id && (
                       <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the
                            company "{companyToDelete.name}".
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => setCompanyToDelete(null)}>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete}>Continue</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    )}
                   </AlertDialog>
                </TableCell>
                </TableRow>
            ))}
            </TableBody>
        </Table>
        </div>
    </div>
  );
}
