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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { createClient } from '@/services/financeService';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';

const addClientSchema = z.object({
  name: z.string().min(2, 'Client name must be at least 2 characters.'),
  email: z.string().email('Please enter a valid email.'),
  address: z.string().min(5, 'Address is required.'),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  vatNumber: z.string().optional(),
  creditLimit: z.string().optional(),
  creditNumber: z.string().optional(),
  paymentMethod: z.enum(['Bank Transfer', 'Cash', 'Card', 'Credit']),
  status: z.enum(['Lead', 'Active', 'At Risk', 'Inactive']),
  notes: z.string().optional(),
});

type AddClientFormValues = z.infer<typeof addClientSchema>;

interface AddClientDialogProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientAdded: () => void;
}

export function AddClientDialog({
  children,
  open,
  onOpenChange,
  onClientAdded,
}: AddClientDialogProps) {
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const form = useForm<AddClientFormValues>({
    resolver: zodResolver(addClientSchema),
    defaultValues: {
      name: '',
      email: '',
      address: '',
      contactName: '',
      phone: '',
      vatNumber: '',
      creditLimit: '',
      creditNumber: '',
      paymentMethod: 'Bank Transfer',
      status: 'Active',
      notes: '',
    },
  });

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset();
    }
    onOpenChange(isOpen);
  };

  const onSubmit = async (data: AddClientFormValues) => {
    if (!selectedCompany) {
        toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: tr('No company selected.', 'لم يتم اختيار شركة.') });
        return;
    }
    try {
      await createClient({
        ...data,
        companyId: selectedCompany.id,
        contactName: data.contactName || undefined,
        phone: data.phone || undefined,
        vatNumber: data.vatNumber || undefined,
        creditLimit: data.creditLimit ? Number(data.creditLimit) : undefined,
        creditNumber: data.creditNumber || undefined,
        paymentMethod: data.paymentMethod,
        notes: data.notes || undefined,
      });
      toast({
        title: tr('Client Created', 'تم إنشاء العميل'),
        description: tr(`Client "${data.name}" has been successfully created.`, `تم إنشاء العميل "${data.name}" بنجاح.`),
      });
      onClientAdded();
      handleOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Error', 'خطأ'),
        description: error?.message || tr('Failed to create client.', 'تعذّر إنشاء العميل.'),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tr('Add New Client', 'إضافة عميل جديد')}</DialogTitle>
          <DialogDescription>
            {tr('Fill in the details for the new client.', 'أدخل تفاصيل العميل الجديد.')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {tr('Client reference is generated automatically when the record is saved.', 'يتم إنشاء مرجع العميل تلقائيًا عند حفظ السجل.')}
            </div>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tr('Client Name', 'اسم العميل')}</FormLabel>
                  <FormControl>
                    <Input placeholder={tr('e.g. Globex Corporation', 'مثال: شركة جلوبكس')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tr('Contact Email', 'البريد الإلكتروني')}</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder={tr('e.g. contact@globex.com', 'مثال: contact@globex.com')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="contactName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tr('Contact Name', 'اسم جهة الاتصال')}</FormLabel>
                  <FormControl>
                    <Input placeholder={tr('e.g. Sarah Johnson', 'مثال: سارة جونسون')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tr('Phone', 'الهاتف')}</FormLabel>
                  <FormControl>
                    <Input placeholder={tr('e.g. +1 415 555 0199', 'مثال: 0199 555 415 1+')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="vatNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tr('VAT Number', 'الرقم الضريبي')}</FormLabel>
                  <FormControl>
                    <Input placeholder={tr('e.g. VAT-2041', 'مثال: VAT-2041')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="creditLimit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tr('Credit Limit', 'حد الائتمان')}</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder={tr('e.g. 5000', 'مثال: 5000')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="creditNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tr('Credit Number', 'رقم الائتمان')}</FormLabel>
                  <FormControl>
                    <Input placeholder={tr('e.g. CL-1001', 'مثال: CL-1001')} {...field} />
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
                  <FormLabel>{tr('Billing Address', 'عنوان الفوترة')}</FormLabel>
                  <FormControl>
                    <Input placeholder={tr('e.g. 123 Main St, Anytown USA', 'مثال: شارع الرئيسي 123، المدينة')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tr('Payment Method', 'طريقة الدفع')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Bank Transfer">{tr('Bank Transfer', 'تحويل بنكي')}</SelectItem>
                      <SelectItem value="Cash">{tr('Cash', 'نقدًا')}</SelectItem>
                      <SelectItem value="Card">{tr('Card', 'بطاقة')}</SelectItem>
                      <SelectItem value="Credit">{tr('Credit', 'آجل')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tr('Client Status', 'حالة العميل')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Lead">{tr('Lead', 'عميل محتمل')}</SelectItem>
                      <SelectItem value="Active">{tr('Active', 'نشط')}</SelectItem>
                      <SelectItem value="At Risk">{tr('At Risk', 'معرّض للخطر')}</SelectItem>
                      <SelectItem value="Inactive">{tr('Inactive', 'غير نشط')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tr('Notes', 'ملاحظات')}</FormLabel>
                  <FormControl>
                    <Textarea placeholder={tr('Relationship notes, billing preferences, or context', 'ملاحظات عن العلاقة، تفضيلات الفوترة، أو سياق إضافي')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                    {tr('Cancel', 'إلغاء')}
                </Button>
                <Button type="submit">{tr('Create Client', 'إنشاء العميل')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
