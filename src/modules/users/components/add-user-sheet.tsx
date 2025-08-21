'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from '@/components/ui/sheet';
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
import { useCompany } from '@/context/company-context';
import { getPositions } from '@/services/companyService';
import { createUser, updateUser } from '@/services/userService';
import type { Position, User, UserRole } from '@/lib/types';

const allUserRoles: UserRole[] = ['Admin', 'Manager', 'Employee'];

const addUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  email: z.string().email('Please enter a valid email.'),
  companyId: z.string({ required_error: 'Please select a company.' }),
  positionId: z.string().optional(),
  role: z.enum(allUserRoles),
});

type AddUserFormValues = z.infer<typeof addUserSchema>;

interface AddUserSheetProps {
  children?: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserAdded: () => void;
  userToEdit?: User | null;
  currentUserRole?: UserRole;
}

export function AddUserSheet({
  children,
  open,
  onOpenChange,
  onUserAdded,
  userToEdit,
  currentUserRole,
}: AddUserSheetProps) {
  const { toast } = useToast();
  const { companies } = useCompany();
  const [positions, setPositions] = React.useState<Position[]>([]);
  const isEditMode = !!userToEdit;

  const form = useForm<AddUserFormValues>({
    resolver: zodResolver(addUserSchema),
    defaultValues: {
      name: '',
      email: '',
      role: 'Employee',
    },
  });

  const selectedCompanyId = form.watch('companyId');

  const availableRoles = React.useMemo(() => {
    if (currentUserRole === 'Admin') {
      return allUserRoles;
    }
    if (currentUserRole === 'Manager') {
      // Managers can only create/edit Employees
      return ['Employee'];
    }
    return [];
  }, [currentUserRole]);


  React.useEffect(() => {
    async function loadPositions() {
      if (selectedCompanyId) {
        const allPositions = await getPositions();
        setPositions(allPositions.filter(p => p.companyId === selectedCompanyId));
      } else {
        setPositions([]);
      }
    }
    loadPositions();
  }, [selectedCompanyId]);

  React.useEffect(() => {
    if (userToEdit) {
      form.reset({
        name: userToEdit.name,
        email: userToEdit.email,
        companyId: userToEdit.companyId,
        positionId: userToEdit.positionId,
        role: userToEdit.role,
      });
    } else {
      form.reset({
        name: '',
        email: '',
        role: 'Employee',
        companyId: '',
        positionId: ''
      });
    }
  }, [userToEdit, form]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset();
    }
    onOpenChange(isOpen);
  };

  const onSubmit = async (data: AddUserFormValues) => {
    try {
      if (isEditMode) {
        await updateUser(userToEdit.id, data);
        toast({
          title: 'User Updated',
          description: `User "${data.name}" has been successfully updated.`,
        });
      } else {
        await createUser({ ...data, avatar: `https://i.pravatar.cc/150?u=${data.email}` });
        toast({
          title: 'User Created',
          description: `User "${data.name}" has been successfully created.`,
        });
      }
      onUserAdded();
      handleOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save user.',
      });
    }
  };
  
  const sheetTitle = isEditMode ? 'Edit User' : 'Add New User';
  const sheetDescription = isEditMode ? "Update the user's details below." : "Fill in the details for the new user.";

  const content = (
    <SheetContent className="sm:max-w-lg">
      <SheetHeader>
        <SheetTitle>{sheetTitle}</SheetTitle>
        <SheetDescription>{sheetDescription}</SheetDescription>
      </SheetHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
           <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Alex Johnson" {...field} />
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
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. alex.j@innovatecorp.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="companyId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a company" />
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
           <FormField
            control={form.control}
            name="positionId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Position</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!selectedCompanyId}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a position" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {positions.map((position) => (
                        <SelectItem key={position.id} value={position.id}>
                          {position.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                <FormMessage />
              </FormItem>
            )}
          />
           <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                <FormMessage />
              </FormItem>
            )}
          />
           <SheetFooter className="pt-6">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
              </Button>
              <Button type="submit">Save User</Button>
          </SheetFooter>
        </form>
      </Form>
    </SheetContent>
  );

  return (
     <Sheet open={open} onOpenChange={handleOpenChange}>
        {children && <SheetTrigger asChild>{children}</SheetTrigger>}
        {content}
    </Sheet>
  );
}
