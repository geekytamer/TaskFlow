'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Plus, Trash2, Check, X } from 'lucide-react';
import {
  createLeaveRequest,
  createLeaveType,
  deleteLeaveRequest,
  deleteLeaveType,
  getEmployees,
  getLeaveBalance,
  getLeaveRequests,
  getLeaveTypes,
  setLeaveRequestStatus,
  type Employee,
  type LeaveBalance,
  type LeaveRequest,
  type LeaveRequestStatus,
  type LeaveType,
} from '@/services/hrService';

const STATUS_STYLES: Record<LeaveRequestStatus, string> = {
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  Cancelled: 'bg-slate-50 text-slate-700 border-slate-200',
};

export function LeavePage() {
  const { selectedCompany, currentRole } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const confirm = useConfirm();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const canManage = currentRole !== 'Employee';

  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [types, setTypes] = React.useState<LeaveType[]>([]);
  const [requests, setRequests] = React.useState<LeaveRequest[]>([]);
  const [balances, setBalances] = React.useState<Record<string, LeaveBalance>>({});
  const [loading, setLoading] = React.useState(true);

  const [newTypeName, setNewTypeName] = React.useState('');
  const [newTypePaid, setNewTypePaid] = React.useState(true);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState({ employeeId: '', leaveTypeId: '', startDate: '', endDate: '', reason: '' });
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const [emps, lts, reqs] = await Promise.all([
        getEmployees(selectedCompany.id),
        getLeaveTypes(selectedCompany.id),
        getLeaveRequests(selectedCompany.id),
      ]);
      setEmployees(emps);
      setTypes(lts);
      setRequests(reqs);
      const balancePairs = await Promise.all(emps.map(async (e) => [e.id, await getLeaveBalance(e.id)] as const));
      setBalances(Object.fromEntries(balancePairs));
    } finally {
      setLoading(false);
    }
  }, [selectedCompany]);

  React.useEffect(() => { void load(); }, [load]);

  const employeeName = (id: string) => employees.find((e) => e.id === id)?.name ?? '—';
  const typeName = (id?: string) => types.find((t) => t.id === id)?.name ?? '—';
  const fmt = (d: Date) => new Date(d).toLocaleDateString();

  const handleAddType = async () => {
    if (!selectedCompany || !newTypeName.trim()) return;
    try {
      await createLeaveType(selectedCompany.id, newTypeName.trim(), newTypePaid);
      setNewTypeName(''); setNewTypePaid(true);
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not add leave type', 'تعذر إضافة نوع الإجازة'), description: error?.message });
    }
  };

  const handleDeleteType = async (t: LeaveType) => {
    try {
      await deleteLeaveType(t.id);
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not delete leave type', 'تعذر حذف نوع الإجازة'), description: error?.message });
    }
  };

  const handleCreateRequest = async () => {
    if (!selectedCompany || !form.employeeId || !form.startDate || !form.endDate) return;
    setSaving(true);
    try {
      await createLeaveRequest(selectedCompany.id, {
        employeeId: form.employeeId,
        leaveTypeId: form.leaveTypeId || undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason.trim() || undefined,
      });
      setDialogOpen(false);
      setForm({ employeeId: '', leaveTypeId: '', startDate: '', endDate: '', reason: '' });
      await load();
      toast({ title: tr('Leave request submitted', 'تم تقديم طلب الإجازة') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not submit request', 'تعذر تقديم الطلب'), description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSetStatus = async (r: LeaveRequest, status: LeaveRequestStatus) => {
    try {
      await setLeaveRequestStatus(r.id, status);
      await load();
      toast({ title: status === 'Approved' ? tr('Leave approved', 'تمت الموافقة') : tr('Leave rejected', 'تم الرفض') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not update request', 'تعذر تحديث الطلب'), description: error?.message });
    }
  };

  const handleDeleteRequest = async (r: LeaveRequest) => {
    if (!(await confirm({
      title: tr('Delete request?', 'حذف الطلب؟'),
      description: tr('This leave request will be permanently removed.', 'سيُحذف طلب الإجازة نهائياً.'),
      confirmText: tr('Delete', 'حذف'), cancelText: tr('Cancel', 'إلغاء'), destructive: true,
    }))) return;
    try {
      await deleteLeaveRequest(r.id);
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not delete request', 'تعذر حذف الطلب'), description: error?.message });
    }
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold font-headline">{tr('Leave & Time Off', 'الإجازات')}</h1>
          <p className="text-muted-foreground">{tr('Track requests, approvals, and balances.', 'تتبّع الطلبات والموافقات والأرصدة.')}</p>
        </div>
        {canManage && (
          <Button onClick={() => setDialogOpen(true)} disabled={employees.length === 0}>
            <Plus className="me-2 h-4 w-4" />{tr('New Request', 'طلب جديد')}
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{tr('Requests', 'الطلبات')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr('Employee', 'الموظف')}</TableHead>
                  <TableHead>{tr('Type', 'النوع')}</TableHead>
                  <TableHead>{tr('Dates', 'التواريخ')}</TableHead>
                  <TableHead className="text-end">{tr('Days', 'الأيام')}</TableHead>
                  <TableHead>{tr('Status', 'الحالة')}</TableHead>
                  <TableHead className="text-end">{tr('Actions', 'إجراءات')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</TableCell></TableRow>
                ) : requests.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">{tr('No leave requests yet.', 'لا توجد طلبات إجازة بعد.')}</TableCell></TableRow>
                ) : requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{employeeName(r.employeeId)}</TableCell>
                    <TableCell>{typeName(r.leaveTypeId)}</TableCell>
                    <TableCell className="text-sm">{fmt(r.startDate)} – {fmt(r.endDate)}</TableCell>
                    <TableCell className="text-end">{r.days}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_STYLES[r.status]}>{r.status}</Badge>
                      {r.reviewedByName && r.status !== 'Pending' && (
                        <div className="text-xs text-muted-foreground mt-0.5">{r.reviewedByName}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      {canManage && (
                        <div className="flex justify-end gap-1">
                          {r.status === 'Pending' && (
                            <>
                              <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700" onClick={() => handleSetStatus(r, 'Approved')}><Check className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => handleSetStatus(r, 'Rejected')}><X className="h-4 w-4" /></Button>
                            </>
                          )}
                          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => handleDeleteRequest(r)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {canManage && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{tr('Leave Types', 'أنواع الإجازات')}</CardTitle>
                <CardDescription>{tr('Paid types draw down the annual allowance.', 'الأنواع المدفوعة تُخصم من الرصيد السنوي.')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  {types.length === 0 && <p className="text-sm text-muted-foreground">{tr('No leave types yet.', 'لا توجد أنواع بعد.')}</p>}
                  {types.map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded-md border px-3 py-1.5">
                      <span className="text-sm">{t.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={t.paid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}>
                          {t.paid ? tr('Paid', 'مدفوعة') : tr('Unpaid', 'غير مدفوعة')}
                        </Badge>
                        <button onClick={() => handleDeleteType(t)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 border-t pt-3">
                  <Input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder={tr('e.g. Sick', 'مثال: مرضية')} className="h-8" />
                  <div className="flex items-center gap-1" title={tr('Paid', 'مدفوعة')}>
                    <Switch checked={newTypePaid} onCheckedChange={setNewTypePaid} />
                  </div>
                  <Button size="sm" variant="outline" onClick={handleAddType}>{tr('Add', 'إضافة')}</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{tr('Balances', 'الأرصدة')}</CardTitle>
              <CardDescription>{tr('Paid leave remaining this year.', 'الإجازة المدفوعة المتبقية هذا العام.')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {employees.length === 0 && <p className="text-sm text-muted-foreground">{tr('No employees yet.', 'لا يوجد موظفون بعد.')}</p>}
              {employees.map((e) => {
                const b = balances[e.id];
                return (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <span>{e.name}</span>
                    <span className="text-muted-foreground">
                      {b ? `${b.remaining} / ${b.allowance}` : '—'}
                      {b && b.pending > 0 ? <span className="text-amber-600"> (+{b.pending} {tr('pending', 'معلّق')})</span> : null}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tr('New Leave Request', 'طلب إجازة جديد')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>{tr('Employee', 'الموظف')} *</Label>
              <Select value={form.employeeId} onValueChange={(v) => setForm((p) => ({ ...p, employeeId: v }))}>
                <SelectTrigger><SelectValue placeholder={tr('Select employee', 'اختر موظفاً')} /></SelectTrigger>
                <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{tr('Leave Type', 'نوع الإجازة')}</Label>
              <Select value={form.leaveTypeId || 'none'} onValueChange={(v) => setForm((p) => ({ ...p, leaveTypeId: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder={tr('None', 'بدون')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tr('None', 'بدون')}</SelectItem>
                  {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{tr('Start', 'البداية')} *</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{tr('End', 'النهاية')} *</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{tr('Reason', 'السبب')}</Label>
              <Textarea value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button onClick={handleCreateRequest} disabled={saving || !form.employeeId || !form.startDate || !form.endDate}>{tr('Submit', 'إرسال')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
