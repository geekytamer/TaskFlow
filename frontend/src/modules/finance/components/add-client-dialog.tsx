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
import { createClient } from '@/services/financeService';
import { useCompany } from '@/context/company-context';

const addClientSchema = z.object({
  name: z.string().min(2, 'Client name must be at least 2 characters.'),
  email: z.string().email('Please enter a valid email.'),
  address: z.string().min(5, 'Address is required.'),
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
  const form = useForm<AddClientFormValues>({
    resolver: zodResolver(addClientSchema),
    defaultValues: {
      name: '',
      email: '',
      address: '',
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
        toast({ variant: 'destructive', title: 'Error', description: 'No company selected.' });
        return;
    }
    try {
      await createClient({ ...data, companyId: selectedCompany.id });
      toast({
        title: 'Client Created',
        description: `Client "${data.name}" has been successfully created.`,
      });
      onClientAdded();
      handleOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create client.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
          <DialogDescription>
            Fill in the details for the new client.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Globex Corporation" {...field} />
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
                  <FormLabel>Contact Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="e.g. contact@globex.com" {...field} />
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
                  <FormLabel>Billing Address</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 123 Main St, Anytown USA" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                    Cancel
                </Button>
                <Button type="submit">Create Client</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
