'use client';

import * as React from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useCompanyCurrency } from '@/lib/currency';
import {
  actOnPurchaseRequisition, createPurchaseRequisition, deletePurchaseRequisition, getPurchaseRequisitions, getSuppliers,
  type PurchaseRequisition, type PurchaseRequisitionStatus,
} from '@/services/operationsService';
import type { Supplier } from '@/modules/operations/types';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, ClipboardList, Plus, Send, ShoppingCart, Trash2, XCircle } from 'lucide-react';

type Tr = (en: string, ar: string) => string;
type LineForm = { description: string; quantity: string; cost: string };
const emptyLine = (): LineForm => ({ description: '', quantity: '1', cost: '' });

const statusVariant: Record<PurchaseRequisitionStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  Draft: 'outline', Submitted: 'secondary', Approved: 'default', Rejected: 'destructive', Converted: 'secondary',
};
const statusLabel = (tr: Tr, s: PurchaseRequisitionStatus) => ({
  Draft: tr('Draft', 'مسودة'), Submitted: tr('Submitted', 'مُقدَّم'), Approved: tr('Approved', 'معتمد'),
  Rejected: tr('Rejected', 'مرفوض'), Converted: tr('Ordered', 'تم الطلب'),
})[s];

const estimate = (r: PurchaseRequisition) => r.items.reduce((sum, i) => sum + i.quantity * i.estimatedUnitCost, 0);

function NewRequisitionSheet({ suppliers, onCreated, tr }: { suppliers: Supplier[]; onCreated: () => void; tr: Tr }) {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const { amount } = useCompanyCurrency();
  const [open, setOpen] = React.useState(false);
  const [department, setDepartment] = React.useState('');
  const [neededBy, setNeededBy] = React.useState('');
  const [supplierId, setSupplierId] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [lines, setLines] = React.useState<LineForm[]>([emptyLine()]);
  const [saving, setSaving] = React.useState(false);
  const setLine = (i: number, patch: Partial<LineForm>) => setLines((p) => p.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const clean = lines
    .filter((l) => l.description.trim() && Number(l.quantity) > 0)
    .map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), estimatedUnitCost: Number(l.cost || 0) }));
  const total = clean.reduce((s, l) => s + l.quantity * l.estimatedUnitCost, 0);

  const reset = () => { setDepartment(''); setNeededBy(''); setSupplierId(''); setNotes(''); setLines([emptyLine()]); };
  const submit = async () => {
    if (!selectedCompany || clean.length === 0) return;
    setSaving(true);
    try {
      await createPurchaseRequisition(selectedCompany.id, {
        department: department.trim() || undefined, items: clean, neededBy: neededBy || undefined,
        notes: notes.trim() || undefined, preferredSupplierId: supplierId || undefined,
      });
      toast({ title: tr('Requisition saved as a draft', 'حُفظ الطلب كمسودة') });
      setOpen(false); reset(); onCreated();
    } catch (e: any) {
      toast({ variant: 'destructive', title: tr('Could not save the requisition', 'تعذر حفظ الطلب'), description: e?.message });
    } finally { setSaving(false); }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild><Button><Plus className="me-2 h-4 w-4" />{tr('New requisition', 'طلب شراء جديد')}</Button></SheetTrigger>
      <SheetContent className="flex w-full flex-col sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{tr('New purchase requisition', 'طلب شراء داخلي جديد')}</SheetTitle>
          <p className="text-sm text-muted-foreground">{tr('Ask for what you need; a manager approves it before it becomes a purchase order.', 'اطلب ما تحتاجه؛ يعتمده مدير قبل أن يصبح أمر شراء.')}</p>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pr-dept">{tr('Department', 'القسم')}</Label>
              <Input id="pr-dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder={tr('e.g. Kitchen', 'مثال: المطبخ')} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pr-needed">{tr('Needed by', 'مطلوب بحلول')}</Label>
              <Input id="pr-needed" type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>{tr('Preferred supplier (optional)', 'المورّد المفضل (اختياري)')}</Label>
              <Select value={supplierId || 'none'} onValueChange={(v) => setSupplierId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tr('No preference', 'بلا تفضيل')}</SelectItem>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{tr('Items', 'الأصناف')}</Label>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_72px_96px_36px] items-center gap-2">
                <Input aria-label={tr('Description', 'الوصف')} placeholder={tr('What is needed', 'المطلوب')} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                <Input aria-label={tr('Quantity', 'الكمية')} type="number" min={0} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <Input aria-label={tr('Estimated unit cost', 'التكلفة التقديرية للوحدة')} type="number" min={0} placeholder={tr('Est. cost', 'تكلفة تقديرية')} value={l.cost} onChange={(e) => setLine(i, { cost: e.target.value })} />
                <Button variant="ghost" size="icon" disabled={lines.length === 1} aria-label={tr('Remove line', 'إزالة السطر')} onClick={() => setLines((p) => p.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => setLines((p) => [...p, emptyLine()])}><Plus className="me-1.5 h-3.5 w-3.5" />{tr('Add item', 'إضافة صنف')}</Button>
              {total > 0 && <span className="text-sm tabular-nums text-muted-foreground">{tr('Estimate', 'التقدير')} {amount(total)}</span>}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pr-notes">{tr('Why it is needed', 'سبب الحاجة')}</Label>
            <Textarea id="pr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={submit} disabled={saving || clean.length === 0}>{tr('Save draft', 'حفظ كمسودة')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Purchase requisitions: Draft → Submitted → Approved (or Rejected) → Ordered.
 * Approving and rejecting are for Admins and Managers; anyone in finance or
 * purchasing can raise, submit and turn an approved request into a PO.
 */
export function RequisitionsPage() {
  const { selectedCompany, currentRole } = useCompany();
  const { language } = useI18n();
  const tr: Tr = React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]);
  const { toast } = useToast();
  const confirm = useConfirm();
  const { amount } = useCompanyCurrency();
  const canApprove = currentRole === 'Admin' || currentRole === 'Manager';
  const [rows, setRows] = React.useState<PurchaseRequisition[] | null>(null);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [rejecting, setRejecting] = React.useState<PurchaseRequisition | null>(null);
  const [reason, setReason] = React.useState('');
  const [converting, setConverting] = React.useState<PurchaseRequisition | null>(null);
  const [convertSupplier, setConvertSupplier] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!selectedCompany) return;
    try {
      const [r, s] = await Promise.all([getPurchaseRequisitions(selectedCompany.id), getSuppliers(selectedCompany.id)]);
      setRows([...r].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setSuppliers(s);
    } catch (e: any) {
      setRows([]);
      toast({ variant: 'destructive', title: tr('Requisitions unavailable', 'طلبات الشراء غير متاحة'), description: e?.message });
    }
  }, [selectedCompany, toast, tr]);
  React.useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); toast({ title: done }); await load(); return true; }
    catch (e: any) { toast({ variant: 'destructive', title: tr('That did not work', 'لم ينجح ذلك'), description: e?.message }); return false; }
    finally { setBusy(false); }
  };
  const supplierName = (id?: string) => suppliers.find((s) => s.id === id)?.name;

  return (
    <SectionPageShell
      title={tr('Purchase requisitions', 'طلبات الشراء الداخلية')}
      description={tr('Internal requests to buy, approved before they become purchase orders.', 'طلبات شراء داخلية تُعتمد قبل أن تصبح أوامر شراء.')}
      actions={<NewRequisitionSheet suppliers={suppliers} onCreated={load} tr={tr} />}
    >
      {rows === null ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{tr('No requisitions yet. Raise one when someone needs something bought.', 'لا توجد طلبات بعد. أنشئ طلباً حين يحتاج أحد شراء شيء.')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('Number', 'الرقم')}</TableHead>
                <TableHead>{tr('Items', 'الأصناف')}</TableHead>
                <TableHead>{tr('Department', 'القسم')}</TableHead>
                <TableHead>{tr('Needed by', 'مطلوب بحلول')}</TableHead>
                <TableHead className="text-end">{tr('Estimate', 'التقدير')}</TableHead>
                <TableHead>{tr('Status', 'الحالة')}</TableHead>
                <TableHead className="text-end">{tr('Actions', 'إجراءات')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium" dir="ltr">{r.requisitionNumber}</TableCell>
                  <TableCell className="max-w-[280px]">
                    <span className="line-clamp-2 text-sm" dir="auto">{r.items.map((i) => `${i.quantity} × ${i.description}`).join(' · ')}</span>
                    {r.status === 'Rejected' && r.rejectionReason && <span className="mt-0.5 block text-xs text-destructive" dir="auto">{r.rejectionReason}</span>}
                  </TableCell>
                  <TableCell dir="auto">{r.department || '—'}</TableCell>
                  <TableCell>{r.neededBy ? format(new Date(r.neededBy), 'MMM d, yyyy') : '—'}</TableCell>
                  <TableCell className="text-end tabular-nums">{amount(estimate(r))}</TableCell>
                  <TableCell><Badge variant={statusVariant[r.status]}>{statusLabel(tr, r.status)}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap text-end">
                    {r.status === 'Draft' && (
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(() => actOnPurchaseRequisition(r.id, 'submit'), tr('Submitted for approval', 'قُدِّم للاعتماد'))}>
                        <Send className="me-1 h-4 w-4" />{tr('Submit', 'تقديم')}
                      </Button>
                    )}
                    {r.status === 'Submitted' && canApprove && (
                      <>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(() => actOnPurchaseRequisition(r.id, 'approve'), tr('Approved', 'تم الاعتماد'))}>
                          <CheckCircle2 className="me-1 h-4 w-4" />{tr('Approve', 'اعتماد')}
                        </Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setRejecting(r); setReason(''); }}>
                          <XCircle className="me-1 h-4 w-4" />{tr('Reject', 'رفض')}
                        </Button>
                      </>
                    )}
                    {r.status === 'Approved' && (
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setConverting(r); setConvertSupplier(r.preferredSupplierId ?? ''); }}>
                        <ShoppingCart className="me-1 h-4 w-4" />{tr('Create PO', 'إنشاء أمر شراء')}
                      </Button>
                    )}
                    {r.status === 'Converted' && r.purchaseOrderId && (
                      <Button variant="link" size="sm" asChild><Link href="/purchases">{tr('View PO', 'عرض أمر الشراء')}</Link></Button>
                    )}
                    {(r.status === 'Draft' || r.status === 'Rejected') && (
                      <Button variant="ghost" size="icon" disabled={busy} aria-label={tr('Delete', 'حذف')}
                        onClick={async () => {
                          if (!(await confirm({ title: tr(`Delete ${r.requisitionNumber}?`, `حذف ${r.requisitionNumber}؟`), confirmText: tr('Delete', 'حذف'), cancelText: tr('Cancel', 'إلغاء'), destructive: true }))) return;
                          await act(() => deletePurchaseRequisition(r.id), tr('Requisition deleted', 'تم حذف الطلب'));
                        }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={Boolean(rejecting)} onOpenChange={(v) => { if (!v) setRejecting(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tr(`Reject ${rejecting?.requisitionNumber ?? ''}`, `رفض ${rejecting?.requisitionNumber ?? ''}`)}</DialogTitle>
            <DialogDescription>{tr('The requester sees the reason on the list.', 'يرى مقدّم الطلب السبب في القائمة.')}</DialogDescription>
          </DialogHeader>
          <Textarea aria-label={tr('Reason', 'السبب')} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr('e.g. Over budget this month', 'مثال: يتجاوز ميزانية الشهر')} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button variant="destructive" disabled={busy || !reason.trim()} onClick={async () => {
              if (rejecting && await act(() => actOnPurchaseRequisition(rejecting.id, 'reject', { reason: reason.trim() }), tr('Rejected', 'تم الرفض'))) setRejecting(null);
            }}>{tr('Reject', 'رفض')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(converting)} onOpenChange={(v) => { if (!v) setConverting(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tr('Create a purchase order', 'إنشاء أمر شراء')}</DialogTitle>
            <DialogDescription>{tr('The order starts as a draft with these items and estimated costs; adjust prices there.', 'يبدأ الأمر كمسودة بهذه الأصناف والتكاليف التقديرية؛ عدّل الأسعار هناك.')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label>{tr('Supplier', 'المورّد')}</Label>
            <Select value={convertSupplier} onValueChange={setConvertSupplier}>
              <SelectTrigger><SelectValue placeholder={tr('Choose a supplier', 'اختر مورّداً')} /></SelectTrigger>
              <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
            {converting?.preferredSupplierId && supplierName(converting.preferredSupplierId) && (
              <p className="text-xs text-muted-foreground">{tr('Requested supplier: ', 'المورّد المطلوب: ')}{supplierName(converting.preferredSupplierId)}</p>
            )}
            {suppliers.length === 0 && <p className="text-xs text-destructive">{tr('Add a supplier first.', 'أضف مورّداً أولاً.')}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConverting(null)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button disabled={busy || !convertSupplier} onClick={async () => {
              if (converting && await act(() => actOnPurchaseRequisition(converting.id, 'convert', { supplierId: convertSupplier }), tr('Purchase order created', 'تم إنشاء أمر الشراء'))) setConverting(null);
            }}>{tr('Create PO', 'إنشاء أمر شراء')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionPageShell>
  );
}
