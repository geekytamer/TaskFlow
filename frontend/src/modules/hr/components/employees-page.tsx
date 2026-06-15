'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Plus, Trash2, Pencil, X } from 'lucide-react';
import {
  createDepartment,
  createEmployee,
  deleteDepartment,
  deleteEmployee,
  getDepartments,
  getEmployees,
  updateEmployee,
  type Department,
  type Employee,
  type EmployeeStatus,
  type EmploymentType,
} from '@/services/hrService';

const EMPLOYMENT_TYPES: EmploymentType[] = ['Full-time', 'Part-time', 'Contractor', 'Intern'];
const STATUSES: EmployeeStatus[] = ['Active', 'On Leave', 'Terminated'];
const STATUS_STYLES: Record<EmployeeStatus, string> = {
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'On Leave': 'bg-amber-50 text-amber-700 border-amber-200',
  Terminated: 'bg-rose-50 text-rose-700 border-rose-200',
};

type Form = {
  name: string; email: string; phone: string; jobTitle: string;
  departmentId: string; managerId: string; employmentType: EmploymentType;
  status: EmployeeStatus; hireDate: string; annualLeaveAllowance: string; notes: string;
};

const emptyForm = (): Form => ({
  name: '', email: '', phone: '', jobTitle: '', departmentId: '', managerId: '',
  employmentType: 'Full-time', status: 'Active', hireDate: '', annualLeaveAllowance: '21', notes: '',
});

export function EmployeesPage() {
  const { selectedCompany, currentRole } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const confirm = useConfirm();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const canManage = currentRole !== 'Employee';

  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [newDept, setNewDept] = React.useState('');
  const [deptDialogOpen, setDeptDialogOpen] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Employee | null>(null);
  const [form, setForm] = React.useState<Form>(emptyForm());
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const [emps, depts] = await Promise.all([
        getEmployees(selectedCompany.id),
        getDepartments(selectedCompany.id),
      ]);
      setEmployees(emps);
      setDepartments(depts);
    } finally {
      setLoading(false);
    }
  }, [selectedCompany]);

  React.useEffect(() => { void load(); }, [load]);

  const deptName = (id?: string) => departments.find((d) => d.id === id)?.name ?? '—';
  const managerName = (id?: string) => employees.find((e) => e.id === id)?.name ?? '—';

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setForm({
      name: e.name, email: e.email ?? '', phone: e.phone ?? '', jobTitle: e.jobTitle ?? '',
      departmentId: e.departmentId ?? '', managerId: e.managerId ?? '',
      employmentType: e.employmentType ?? 'Full-time', status: e.status,
      hireDate: e.hireDate ? new Date(e.hireDate).toISOString().slice(0, 10) : '',
      annualLeaveAllowance: String(e.annualLeaveAllowance ?? 0), notes: e.notes ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selectedCompany || !form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      jobTitle: form.jobTitle.trim() || undefined,
      departmentId: form.departmentId || undefined,
      managerId: form.managerId || undefined,
      employmentType: form.employmentType,
      status: form.status,
      hireDate: form.hireDate || undefined,
      annualLeaveAllowance: Number(form.annualLeaveAllowance || 0),
      notes: form.notes.trim() || undefined,
    } as Partial<Employee>;
    try {
      if (editing) {
        await updateEmployee(editing.id, payload);
        toast({ title: tr('Employee updated', 'تم تحديث الموظف') });
      } else {
        await createEmployee(selectedCompany.id, payload);
        toast({ title: tr('Employee added', 'تمت إضافة الموظف') });
      }
      setDialogOpen(false);
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not save employee', 'تعذر حفظ الموظف'), description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: Employee) => {
    if (!(await confirm({
      title: tr('Delete employee?', 'حذف الموظف؟'),
      description: tr(`Delete ${e.name}? Their leave records will be removed.`, `حذف ${e.name}؟ ستُحذف سجلات إجازاتهم.`),
      confirmText: tr('Delete', 'حذف'), cancelText: tr('Cancel', 'إلغاء'), destructive: true,
    }))) return;
    try {
      await deleteEmployee(e.id);
      await load();
      toast({ title: tr('Employee deleted', 'تم حذف الموظف') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not delete employee', 'تعذر حذف الموظف'), description: error?.message });
    }
  };

  const handleAddDept = async () => {
    if (!selectedCompany || !newDept.trim()) return;
    try {
      await createDepartment(selectedCompany.id, newDept.trim());
      setNewDept('');
      setDeptDialogOpen(false);
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not add department', 'تعذر إضافة القسم'), description: error?.message });
    }
  };

  const handleDeleteDept = async (d: Department) => {
    try {
      await deleteDepartment(d.id);
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not delete department', 'تعذر حذف القسم'), description: error?.message });
    }
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold font-headline">{tr('Employees', 'الموظفون')}</h1>
          <p className="text-muted-foreground">{tr('Your team directory and org structure.', 'دليل فريقك وهيكله التنظيمي.')}</p>
        </div>
        {canManage && (
          <Button onClick={openCreate}><Plus className="me-2 h-4 w-4" />{tr('New Employee', 'موظف جديد')}</Button>
        )}
      </div>

      {canManage && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{tr('Departments', 'الأقسام')}</CardTitle>
            <CardDescription>{tr('Group employees by department.', 'جمّع الموظفين حسب القسم.')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              {departments.map((d) => (
                <Badge key={d.id} variant="outline" className="gap-1 py-1">
                  {d.name}
                  <button onClick={() => handleDeleteDept(d)} className="ms-1 text-muted-foreground hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Button size="sm" variant="outline" onClick={() => { setNewDept(''); setDeptDialogOpen(true); }}>
                <Plus className="me-1.5 h-3.5 w-3.5" />{tr('Add department', 'أضف قسماً')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="flex-1">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('Name', 'الاسم')}</TableHead>
                <TableHead>{tr('Job Title', 'المسمى الوظيفي')}</TableHead>
                <TableHead>{tr('Department', 'القسم')}</TableHead>
                <TableHead>{tr('Manager', 'المدير')}</TableHead>
                <TableHead>{tr('Type', 'النوع')}</TableHead>
                <TableHead>{tr('Status', 'الحالة')}</TableHead>
                <TableHead className="text-end">{tr('Leave / yr', 'إجازة/سنة')}</TableHead>
                <TableHead className="text-end">{tr('Actions', 'إجراءات')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</TableCell></TableRow>
              ) : employees.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">{tr('No employees yet.', 'لا يوجد موظفون بعد.')}</TableCell></TableRow>
              ) : employees.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    {e.name}
                    {e.email && <div className="text-xs text-muted-foreground">{e.email}</div>}
                  </TableCell>
                  <TableCell>{e.jobTitle || '—'}</TableCell>
                  <TableCell>{deptName(e.departmentId)}</TableCell>
                  <TableCell>{managerName(e.managerId)}</TableCell>
                  <TableCell>{e.employmentType || '—'}</TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_STYLES[e.status]}>{e.status}</Badge></TableCell>
                  <TableCell className="text-end">{e.annualLeaveAllowance}</TableCell>
                  <TableCell className="text-end">
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(e)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? tr('Edit Employee', 'تعديل الموظف') : tr('New Employee', 'موظف جديد')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>{tr('Name', 'الاسم')} *</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{tr('Email', 'البريد')}</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{tr('Phone', 'الهاتف')}</Label>
              <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{tr('Job Title', 'المسمى الوظيفي')}</Label>
              <Input value={form.jobTitle} onChange={(e) => setForm((p) => ({ ...p, jobTitle: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{tr('Department', 'القسم')}</Label>
              <Select value={form.departmentId || 'none'} onValueChange={(v) => setForm((p) => ({ ...p, departmentId: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder={tr('None', 'بدون')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tr('None', 'بدون')}</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{tr('Manager', 'المدير')}</Label>
              <Select value={form.managerId || 'none'} onValueChange={(v) => setForm((p) => ({ ...p, managerId: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder={tr('None', 'بدون')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tr('None', 'بدون')}</SelectItem>
                  {employees.filter((e) => e.id !== editing?.id).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{tr('Employment Type', 'نوع التوظيف')}</Label>
              <Select value={form.employmentType} onValueChange={(v) => setForm((p) => ({ ...p, employmentType: v as EmploymentType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EMPLOYMENT_TYPES.map((tp) => <SelectItem key={tp} value={tp}>{tp}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{tr('Status', 'الحالة')}</Label>
              <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as EmployeeStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{tr('Hire Date', 'تاريخ التعيين')}</Label>
              <Input type="date" value={form.hireDate} onChange={(e) => setForm((p) => ({ ...p, hireDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{tr('Annual Leave (days)', 'الإجازة السنوية (أيام)')}</Label>
              <Input type="number" value={form.annualLeaveAllowance} onChange={(e) => setForm((p) => ({ ...p, annualLeaveAllowance: e.target.value }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>{tr('Notes', 'ملاحظات')}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>{tr('Save', 'حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{tr('Add Department', 'إضافة قسم')}</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label>{tr('Name', 'الاسم')}</Label>
            <Input
              autoFocus
              value={newDept}
              onChange={(e) => setNewDept(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddDept(); }}
              placeholder={tr('e.g. Engineering', 'مثال: الهندسة')}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeptDialogOpen(false)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button onClick={handleAddDept} disabled={!newDept.trim()}>{tr('Add', 'إضافة')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
