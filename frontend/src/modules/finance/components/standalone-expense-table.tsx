'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { createExpense, deleteExpense, getExpenses } from '@/services/financeService';
import type { Expense } from '@/modules/finance/types';
import { Plus, Trash2, Receipt } from 'lucide-react';

const emptyForm = () => ({
  category: '',
  amount: '',
  expenseDate: format(new Date(), 'yyyy-MM-dd'),
  vendor: '',
  description: '',
  paymentMethod: '',
  projectId: '',
});

export function StandaloneExpenseTable() {
  const { selectedCompany, projects, currentRole } = useCompany();
  const { language } = useI18n();
  const { amount } = useCompanyCurrency();
  const { toast } = useToast();
  const confirm = useConfirm();
  const tr = React.useCallback(
    (en: string, ar: string) => (language === 'ar' ? ar : en),
    [language],
  );
  const canManage = currentRole !== 'Employee';

  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);

  const companyProjects = React.useMemo(
    () => projects.filter((p) => p.companyId === selectedCompany?.id),
    [projects, selectedCompany],
  );

  const load = React.useCallback(async () => {
    if (!selectedCompany) {
      setExpenses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setExpenses(await getExpenses(selectedCompany.id));
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Expenses unavailable', 'المصروفات غير متاحة'),
        description: error?.message,
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast, tr]);

  React.useEffect(() => {
    load();
  }, [load]);

  const total = React.useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);

  const handleCreate = async () => {
    if (!selectedCompany) return;
    if (!form.category.trim() || !form.amount || Number(form.amount) <= 0) {
      toast({
        variant: 'destructive',
        title: tr('Missing required fields', 'حقول مطلوبة مفقودة'),
        description: tr('Category and a positive amount are required.', 'الفئة ومبلغ موجب مطلوبان.'),
      });
      return;
    }
    setSaving(true);
    try {
      await createExpense(selectedCompany.id, {
        category: form.category.trim(),
        amount: Number(form.amount),
        expenseDate: form.expenseDate || undefined,
        vendor: form.vendor.trim() || undefined,
        description: form.description.trim() || undefined,
        paymentMethod: form.paymentMethod.trim() || undefined,
        projectId: form.projectId || undefined,
      });
      setForm(emptyForm());
      setDialogOpen(false);
      await load();
      toast({ title: tr('Expense recorded', 'تم تسجيل المصروف') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Could not record expense', 'تعذر تسجيل المصروف'),
        description: error?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (expense: Expense) => {
    if (
      !(await confirm({
        title: tr('Delete expense?', 'حذف المصروف؟'),
        description: tr('This cannot be undone.', 'لا يمكن التراجع عن هذا.'),
        confirmText: tr('Delete', 'حذف'),
        cancelText: tr('Cancel', 'إلغاء'),
        destructive: true,
      }))
    )
      return;
    try {
      await deleteExpense(expense.id);
      await load();
      toast({ title: tr('Expense deleted', 'تم حذف المصروف') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not delete', 'تعذر الحذف'), description: error?.message });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            {tr('Recorded Expenses', 'المصروفات المسجلة')}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {tr(
              'Record business expenses directly — no task required.',
              'سجّل مصروفات العمل مباشرة — دون الحاجة إلى مهمة.',
            )}
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {tr('Record Expense', 'تسجيل مصروف')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="mb-3 text-sm text-muted-foreground">
          {tr('Total', 'الإجمالي')}: <span className="font-semibold text-foreground">{amount(total)}</span>
        </div>
        <div className="max-h-[55vh] overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead>{tr('Date', 'التاريخ')}</TableHead>
                <TableHead>{tr('Category', 'الفئة')}</TableHead>
                <TableHead>{tr('Vendor', 'المورد')}</TableHead>
                <TableHead>{tr('Description', 'الوصف')}</TableHead>
                <TableHead className="text-end">{tr('Amount', 'المبلغ')}</TableHead>
                {canManage && <TableHead className="text-end">{tr('Actions', 'إجراءات')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: canManage ? 6 : 5 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!loading &&
                expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{format(e.expenseDate, 'MMM d, yyyy')}</TableCell>
                    <TableCell className="font-medium">{e.category}</TableCell>
                    <TableCell>{e.vendor || '—'}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-muted-foreground">{e.description || '—'}</TableCell>
                    <TableCell className="text-end">{amount(e.amount)}</TableCell>
                    {canManage && (
                      <TableCell className="text-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(e)}
                          aria-label={tr('Delete', 'حذف')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              {!loading && expenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 6 : 5} className="h-24 text-center text-muted-foreground">
                    {tr('No expenses recorded yet.', 'لا توجد مصروفات مسجلة بعد.')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) setForm(emptyForm()); setDialogOpen(v); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{tr('Record Expense', 'تسجيل مصروف')}</DialogTitle>
            <DialogDescription>
              {tr('Capture a business expense. Only category and amount are required.', 'سجّل مصروف عمل. الفئة والمبلغ فقط مطلوبان.')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{tr('Category', 'الفئة')} *</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                placeholder={tr('e.g. Utilities, Fuel, Office', 'مثال: مرافق، وقود، مكتب')}
              />
            </div>
            <div className="space-y-1">
              <Label>{tr('Amount', 'المبلغ')} *</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{tr('Date', 'التاريخ')}</Label>
              <Input
                type="date"
                value={form.expenseDate}
                onChange={(e) => setForm((p) => ({ ...p, expenseDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{tr('Vendor', 'المورد')}</Label>
              <Input
                value={form.vendor}
                onChange={(e) => setForm((p) => ({ ...p, vendor: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{tr('Payment Method', 'طريقة الدفع')}</Label>
              <Input
                value={form.paymentMethod}
                onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}
                placeholder={tr('Cash, card, transfer…', 'نقدًا، بطاقة، تحويل…')}
              />
            </div>
            <div className="space-y-1">
              <Label>{tr('Project (optional)', 'المشروع (اختياري)')}</Label>
              <Select
                value={form.projectId || '__none__'}
                onValueChange={(v) => setForm((p) => ({ ...p, projectId: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tr('No project', 'بدون مشروع')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{tr('No project', 'بدون مشروع')}</SelectItem>
                  {companyProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>{tr('Description', 'الوصف')}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setForm(emptyForm()); setDialogOpen(false); }}>
              {tr('Cancel', 'إلغاء')}
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {tr('Save Expense', 'حفظ المصروف')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
