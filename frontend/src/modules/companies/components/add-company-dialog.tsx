'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { createCompany } from '@/services/companyService';
import { useI18n } from '@/context/i18n-context';

const addCompanySchema = z.object({
  name: z.string().min(2, 'Company name must be at least 2 characters.'),
  website: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
  address: z.string().optional(),
});

type AddCompanyFormValues = z.infer<typeof addCompanySchema>;

interface AddCompanyDialogProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompanyAdded: () => void;
}

export function AddCompanyDialog({
  children,
  open,
  onOpenChange,
  onCompanyAdded,
}: AddCompanyDialogProps) {
  const { toast } = useToast();
  const { t } = useI18n();
  const form = useForm<AddCompanyFormValues>({
    resolver: zodResolver(addCompanySchema),
    defaultValues: {
      name: '',
      website: '',
      address: '',
    },
  });

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset();
    }
    onOpenChange(isOpen);
  };

  const onSubmit = async (data: AddCompanyFormValues) => {
    try {
      await createCompany(data);
      toast({
        title: 'Company Created',
        description: `Company "${data.name}" has been successfully created.`,
      });
      onCompanyAdded();
      handleOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create company.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('companiesPage.addNewCompany')}</DialogTitle>
          <DialogDescription>
            {t('companiesPage.addCompanyDesc')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('companiesPage.companyNameLabel')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('companiesPage.companyNamePH')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('companiesPage.websiteLabel')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('companiesPage.websitePH')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('companiesPage.addressLabel')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('companiesPage.addressPH')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                    {t('common.cancel')}
                </Button>
                <Button type="submit">{t('companiesPage.createCompany')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
