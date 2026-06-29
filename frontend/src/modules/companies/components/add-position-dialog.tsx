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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { createPosition } from '@/services/companyService';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';

const addPositionSchema = z.object({
  title: z.string().min(2, 'Position title must be at least 2 characters.'),
  companyId: z.string({ required_error: 'Please select a company.' }),
});

type AddPositionFormValues = z.infer<typeof addPositionSchema>;

interface AddPositionDialogProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPositionAdded: () => void;
  /** When set, the position is locked to this company (company select hidden). */
  companyId?: string;
}

export function AddPositionDialog({
  children,
  open,
  onOpenChange,
  onPositionAdded,
  companyId,
}: AddPositionDialogProps) {
  const { toast } = useToast();
  const { t, language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { companies } = useCompany();

  const form = useForm<AddPositionFormValues>({
    resolver: zodResolver(addPositionSchema),
    defaultValues: {
      title: '',
      companyId: companyId,
    },
  });

  React.useEffect(() => {
    if (companyId) form.setValue('companyId', companyId);
  }, [companyId, form, open]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset();
    }
    onOpenChange(isOpen);
  };

  const onSubmit = async (data: AddPositionFormValues) => {
    try {
      await createPosition(data);
      toast({
        title: tr('Position Created', 'تم إنشاء المنصب'),
        description: tr(`Position "${data.title}" has been successfully created.`, `تم إنشاء المنصب "${data.title}" بنجاح.`),
      });
      onPositionAdded();
      handleOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: tr('Error', 'خطأ'),
        description: tr('Failed to create position.', 'تعذّر إنشاء المنصب.'),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('companiesPage.addNewPosition')}</DialogTitle>
          <DialogDescription>
            {t('companiesPage.addPositionDesc')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('companiesPage.positionTitleLabel')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('companiesPage.positionTitlePH')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!companyId && (
              <FormField
                control={form.control}
                name="companyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('companiesPage.companyLabel')}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('companiesPage.selectCompanyPH')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {companies.map((company) => (
                            <SelectItem key={company.id} value={company.id}>
                              {company.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
             <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                    {t('common.cancel')}
                </Button>
                <Button type="submit">{t('companiesPage.createPosition')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
