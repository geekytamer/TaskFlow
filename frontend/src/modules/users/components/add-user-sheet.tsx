
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
import { MultiSelect, type MultiSelectItem } from '@/components/ui/multi-select';
import { Building } from 'lucide-react';

const allUserRoles: UserRole[] = ['Admin', 'Manager', 'Employee', 'Accountant'];

const addUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  email: z.string().email('Please enter a valid email.'),
  companyIds: z.array(z.string()).min(1, 'Please select at least one company.'),
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
  const [companyAssignments, setCompanyAssignments] = React.useState<
    Record<string, { role: UserRole; positionId?: string }>
  >({});
  const isEditMode = !!userToEdit;

  const form = useForm<AddUserFormValues>({
    resolver: zodResolver(addUserSchema),
    defaultValues: {
      name: '',
      email: '',
      companyIds: [],
    },
  });

  const selectedCompanyIds = form.watch('companyIds');

  const availableRoles = React.useMemo(() => {
    if (!currentUserRole || currentUserRole === 'Admin') {
      return allUserRoles;
    }
    if (currentUserRole === 'Manager') {
      // Managers can only create/edit Employees
      return ['Employee'];
    }
    return [];
  }, [currentUserRole]);

  const companyItems: MultiSelectItem[] = React.useMemo(() => 
    companies.map(c => ({ value: c.id, label: c.name, icon: Building })),
  [companies]);

  React.useEffect(() => {
    async function loadPositions() {
      const allPositions = await getPositions();
      setPositions(allPositions);
    }
    loadPositions();
  }, []);

  // Ensure every selected company has an assignment entry
  React.useEffect(() => {
    setCompanyAssignments((prev) => {
      const next = { ...prev };
      (selectedCompanyIds || []).forEach((cid) => {
        if (!next[cid]) {
          next[cid] = { role: 'Employee', positionId: undefined };
        }
      });
      // Remove entries for deselected companies
      Object.keys(next).forEach((cid) => {
        if (!selectedCompanyIds?.includes(cid)) {
          delete next[cid];
        }
      });
      return next;
    });
  }, [selectedCompanyIds]);

  React.useEffect(() => {
    if (userToEdit) {
      const existingAssignments: Record<string, { role: UserRole; positionId?: string }> = {};
      if (userToEdit.companyRoles && userToEdit.companyRoles.length > 0) {
        userToEdit.companyRoles.forEach((c) => {
          existingAssignments[c.companyId] = { role: c.role, positionId: c.positionId };
        });
      } else {
        (userToEdit.companyIds || []).forEach((cid) => {
          existingAssignments[cid] = { role: userToEdit.role, positionId: userToEdit.positionId };
        });
      }
      form.reset({
        name: userToEdit.name,
        email: userToEdit.email,
        companyIds: userToEdit.companyIds,
      });
      setCompanyAssignments(existingAssignments);
    } else {
      form.reset({
        name: '',
        email: '',
        companyIds: [],
      });
      setCompanyAssignments({});
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
      const companyRoles = (data.companyIds || []).map((cid) => ({
        companyId: cid,
        role: companyAssignments[cid]?.role || 'Employee',
        positionId: companyAssignments[cid]?.positionId || undefined,
      }));

      if (isEditMode && userToEdit) {
        await updateUser(userToEdit.id, {
          ...data,
          companyRoles,
          role: companyRoles[0]?.role || 'Employee',
          positionId: undefined,
        });
        toast({
          title: 'User Updated',
          description: `User "${data.name}" has been successfully updated.`,
        });
      } else {
        const result = await createUser({
          ...data,
          companyRoles,
          role: companyRoles[0]?.role || 'Employee',
          positionId: undefined,
          avatar: `https://i.pravatar.cc/150?u=${data.email}`,
        });
        toast({
          title: 'User Created',
          description: `User "${data.name}" has been created. Temporary password: ${result.password}`,
        });
      }
      onUserAdded();
      handleOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to save user.',
      });
    }
  };
  
  const sheetTitle = isEditMode ? 'Edit User' : 'Add New User';
  const sheetDescription = isEditMode
    ? "Update the user's details below."
    : "Fill in the details for the new user. A temporary password will be generated for them.";

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {children && <SheetTrigger asChild>{children}</SheetTrigger>}
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
                    <Input type="email" placeholder="e.g. alex.j@innovatecorp.com" {...field} disabled={isEditMode} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="companyIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Companies</FormLabel>
                  <FormControl>
                    <MultiSelect
                        items={companyItems}
                        selected={field.value}
                        onChange={field.onChange}
                        placeholder="Select companies..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {selectedCompanyIds && selectedCompanyIds.length > 0 && (
              <div className="space-y-3">
                <FormLabel>Role & Position per company</FormLabel>
                {selectedCompanyIds.map((cid) => {
                  const company = companies.find((c) => c.id === cid);
                  const assignment = companyAssignments[cid] || { role: 'Employee', positionId: undefined };
                  return (
                    <div
                      key={cid}
                      className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr]"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{company?.name || cid}</p>
                        <Select
                          value={assignment.role}
                          onValueChange={(value: UserRole) =>
                            setCompanyAssignments((prev) => ({
                              ...prev,
                              [cid]: { ...assignment, role: value },
                            }))
                          }
                        >
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
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Position (optional)</p>
                        <Select
                          value={assignment.positionId}
                          onValueChange={(value) =>
                            setCompanyAssignments((prev) => ({
                              ...prev,
                              [cid]: { ...assignment, positionId: value },
                            }))
                          }
                        >
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
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <SheetFooter className="pt-6">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                    Cancel
                </Button>
                <Button type="submit">Save User</Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
