
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
import { Building, BadgeDollarSign, ShieldCheck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { CommissionBasis } from '@/modules/users/types';
import { isApiError } from '@/lib/api-client';
import { useI18n } from '@/context/i18n-context';

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
  const { t } = useI18n();
  const { companies, currentUser, selectedCompany } = useCompany();
  const [positions, setPositions] = React.useState<Position[]>([]);
  const [companyAssignments, setCompanyAssignments] = React.useState<
    Record<string, { role: UserRole; positionId?: string }>
  >({});
  // Platform super-admin flag (granting / revoking gated to existing SuperAdmins)
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false);
  // Commission profile (set at creation time by managers)
  const [commission, setCommission] = React.useState<{
    eligible: boolean;
    rate: string;
    basis: CommissionBasis;
    costRatePerHour: string;
  }>({ eligible: false, rate: '', basis: 'Revenue', costRatePerHour: '' });
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

  const manageableCompanies = React.useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'Admin') return companies;
    const managedIds = new Set(
      (currentUser.companyRoles || [])
        .filter((assignment) => ['Admin', 'Manager'].includes(assignment.role))
        .map((assignment) => assignment.companyId),
    );
    return companies.filter((company) => managedIds.has(company.id));
  }, [companies, currentUser]);

  const companyItems: MultiSelectItem[] = React.useMemo(() => 
    manageableCompanies.map(c => ({ value: c.id, label: c.name, icon: Building })),
  [manageableCompanies]);

  const manageableCompanyIds = React.useMemo(
    () => new Set(manageableCompanies.map((company) => company.id)),
    [manageableCompanies],
  );

  React.useEffect(() => {
    async function loadPositions() {
      if (currentUser?.role !== 'Admin') {
        setPositions([]);
        return;
      }
      try {
        const allPositions = await getPositions();
        setPositions(allPositions);
      } catch (error) {
        if (isApiError(error) && (error.status === 401 || error.status === 403)) {
          setPositions([]);
          return;
        }
        console.error('Failed to load positions', error);
      }
    }
    loadPositions();
  }, [currentUser?.role]);

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
      const editableCompanyIds = Object.keys(existingAssignments).filter((companyId) =>
        manageableCompanyIds.has(companyId),
      );
      form.reset({
        name: userToEdit.name,
        email: userToEdit.email,
        companyIds: editableCompanyIds,
      });
      setCompanyAssignments(existingAssignments);
      setCommission({
        eligible: Boolean(userToEdit.commissionEligible),
        rate: userToEdit.defaultCommissionRate != null ? String(userToEdit.defaultCommissionRate) : '',
        basis: userToEdit.defaultCommissionBasis || 'Revenue',
        costRatePerHour: userToEdit.costRatePerHour != null ? String(userToEdit.costRatePerHour) : '',
      });
      setIsSuperAdmin(Boolean(userToEdit.isSuperAdmin));
    } else {
      form.reset({
        name: '',
        email: '',
        companyIds:
          selectedCompany && companyItems.some((company) => company.value === selectedCompany.id)
            ? [selectedCompany.id]
            : companyItems.length === 1
              ? [companyItems[0].value]
              : [],
      });
      setCompanyAssignments({});
      setCommission({ eligible: false, rate: '', basis: 'Revenue', costRatePerHour: '' });
      setIsSuperAdmin(false);
    }
  }, [companyItems, form, manageableCompanyIds, selectedCompany, userToEdit]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset();
    }
    onOpenChange(isOpen);
  };

  const onSubmit = async (data: AddUserFormValues) => {
    try {
      const editableCompanyRoles = (data.companyIds || []).map((cid) => ({
        companyId: cid,
        role: companyAssignments[cid]?.role || 'Employee',
        positionId: companyAssignments[cid]?.positionId || undefined,
      }));
      const preservedCompanyRoles =
        isEditMode && userToEdit
          ? (userToEdit.companyRoles && userToEdit.companyRoles.length > 0
              ? userToEdit.companyRoles
              : (userToEdit.companyIds || []).map((companyId) => ({
                  companyId,
                  role: userToEdit.role,
                  positionId: userToEdit.positionId,
                }))
            ).filter((assignment) => !manageableCompanyIds.has(assignment.companyId))
          : [];
      const companyRoles = [...preservedCompanyRoles, ...editableCompanyRoles];

      const commissionPayload = {
        commissionEligible: commission.eligible,
        defaultCommissionRate:
          commission.rate.trim() === '' ? undefined : Number(commission.rate),
        defaultCommissionBasis: commission.eligible ? commission.basis : undefined,
        costRatePerHour:
          commission.costRatePerHour.trim() === '' ? undefined : Number(commission.costRatePerHour),
      };
      // Only send isSuperAdmin field when the current user is themselves
      // a SuperAdmin (the backend will ignore it otherwise).
      const superAdminPayload = currentUser?.isSuperAdmin
        ? { isSuperAdmin }
        : {};

      if (isEditMode && userToEdit) {
        await updateUser(userToEdit.id, {
          ...data,
          companyRoles,
          role: companyRoles[0]?.role || 'Employee',
          positionId: undefined,
          ...commissionPayload,
          ...superAdminPayload,
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
          ...commissionPayload,
          ...superAdminPayload,
        } as any);
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
  
  const sheetTitle = isEditMode ? t('userForm.sheetTitleEdit') : t('userForm.sheetTitleAdd');
  const sheetDescription = isEditMode
    ? t('userForm.descriptionEdit')
    : t('userForm.descriptionAdd');

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
                  <FormLabel>{t('userForm.fullNameLabel')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('userForm.fullNamePlaceholder')} {...field} />
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
                  <FormLabel>{t('userForm.emailLabel')}</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder={t('userForm.emailPlaceholder')} {...field} disabled={isEditMode} />
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
                  <FormLabel>{t('userForm.companiesLabel')}</FormLabel>
                  <FormControl>
                    <MultiSelect
                        items={companyItems}
                        selected={field.value}
                        onChange={field.onChange}
                        placeholder={t('userForm.companiesPlaceholder')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {selectedCompanyIds && selectedCompanyIds.length > 0 && (
              <div className="space-y-3">
                <FormLabel>{t('userForm.rolePositionLabel')}</FormLabel>
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
                              <SelectValue placeholder={t('userForm.selectRolePlaceholder')} />
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
                        <p className="text-sm font-medium">{t('userForm.positionOptional')}</p>
                        <Select
                          value={assignment.positionId}
                          disabled={positions.length === 0}
                          onValueChange={(value) =>
                            setCompanyAssignments((prev) => ({
                              ...prev,
                              [cid]: { ...assignment, positionId: value },
                            }))
                          }
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  positions.length === 0
                                    ? t('userForm.noPositionsAvailable')
                                    : t('userForm.selectPositionPlaceholder')
                                }
                              />
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
            {currentUser?.isSuperAdmin && (
              <div className="rounded-lg border bg-amber-50/40 border-amber-200 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-700" />
                  <h4 className="text-sm font-semibold text-amber-900">
                    {t('userForm.superAdminTitle')}
                  </h4>
                </div>
                <p className="text-xs text-amber-900/80">
                  {t('userForm.superAdminDescription')}
                </p>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={isSuperAdmin}
                    onCheckedChange={(v) => setIsSuperAdmin(v)}
                  />
                  <Label className="cursor-pointer" onClick={() => setIsSuperAdmin((v) => !v)}>
                    {t('userForm.superAdminToggle')}
                  </Label>
                </div>
              </div>
            )}
            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <BadgeDollarSign className="h-4 w-4 text-emerald-600" />
                <h4 className="text-sm font-semibold">{t('userForm.commissionTitle')}</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('userForm.commissionDescription')}
              </p>
              <div className="flex items-center gap-2">
                <Switch
                  checked={commission.eligible}
                  onCheckedChange={(v) => setCommission((c) => ({ ...c, eligible: v }))}
                />
                <Label className="cursor-pointer" onClick={() => setCommission((c) => ({ ...c, eligible: !c.eligible }))}>
                  {t('userForm.eligible')}
                </Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('userForm.defaultRateLabel')}</Label>
                  <Input
                    type="number" step="0.1" min="0" max="100"
                    placeholder={t('userForm.defaultRatePlaceholder')}
                    value={commission.rate}
                    onChange={(e) => setCommission((c) => ({ ...c, rate: e.target.value }))}
                    disabled={!commission.eligible}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('userForm.defaultBasisLabel')}</Label>
                  <Select
                    value={commission.basis}
                    onValueChange={(v) => setCommission((c) => ({ ...c, basis: v as CommissionBasis }))}
                    disabled={!commission.eligible}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Revenue">Revenue</SelectItem>
                      <SelectItem value="Paid Amount">Paid Amount</SelectItem>
                      <SelectItem value="Profit">Profit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('userForm.costRateLabel')}</Label>
                <Input
                  type="number" step="0.01" min="0"
                  placeholder={t('userForm.costRatePlaceholder')}
                  value={commission.costRatePerHour}
                  onChange={(e) => setCommission((c) => ({ ...c, costRatePerHour: e.target.value }))}
                />
              </div>
            </div>

            <SheetFooter className="pt-6">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                    {t('userForm.cancelButton')}
                </Button>
                <Button type="submit">{t('userForm.saveButton')}</Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
