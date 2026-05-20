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
import { useI18n } from '@/context/i18n-context';

export function CompanyTable() {
  const { companies, refreshCompanies } = useCompany();
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [companyToDelete, setCompanyToDelete] = React.useState<Company | null>(null);
  const { toast } = useToast();
  const { t } = useI18n();

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
                  <PlusCircle className="me-2 h-4 w-4" />
                  {t('companiesPage.addCompany')}
              </Button>
            </AddCompanyDialog>
        </div>
        <div className="rounded-lg border">
        <Table>
            <TableHeader>
            <TableRow>
                <TableHead>{t('companiesPage.tableCompany')}</TableHead>
                <TableHead>{t('companiesPage.websiteLabel')}</TableHead>
                <TableHead>{t('companiesPage.addressLabel')}</TableHead>
                <TableHead className="text-end">{t('common.actions')}</TableHead>
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
                <TableCell className="text-end">
                  <AlertDialog>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">{t('companiesPage.openMenu')}</span>
                          <MoreHorizontal className="h-4 w-4" />
                          </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                          <DropdownMenuItem>{t('companiesPage.editCompany')}</DropdownMenuItem>
                           <AlertDialogTrigger asChild>
                            <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onSelect={(e) => {e.preventDefault(); setCompanyToDelete(company)}}>
                              {t('companiesPage.deleteCompany')}
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {companyToDelete?.id === company.id && (
                       <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('companiesPage.areYouSure')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('companiesPage.deleteCompanyConfirm').replace('{name}', companyToDelete.name)}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => setCompanyToDelete(null)}>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete}>{t('common.continue')}</AlertDialogAction>
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
