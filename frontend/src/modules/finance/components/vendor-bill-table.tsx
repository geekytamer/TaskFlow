'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
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
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import {
  bulkUpdateVendorBillStatus,
  createVendorBillPayment,
  reverseVendorBillPayment,
  createVendorBill,
  getLedgerAccounts,
  getPurchaseOrderPayables,
  getVendorBillPayments,
  getVendorBills,
  updateVendorBillStatus,
} from '@/services/financeService';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type {
  LedgerAccount,
  PurchaseOrderPayableSummary,
  VendorBill,
  VendorBillPayment,
  VendorBillStatus,
} from '@/modules/finance/types';
import { getPurchaseOrders, getSuppliers } from '@/services/operationsService';
import type { PurchaseOrder, Supplier } from '@/modules/operations/types';
import { CircleDollarSign, Download, FilePlus, ListChecks, Undo2 } from 'lucide-react';
import { downloadCsv } from '@/modules/finance/lib/csv';
import { RecordSupportPanel } from '@/modules/shared/components/record-support-panel';
import { SectionToolbar } from '@/modules/operations/components/section-toolbar';
import { useI18n } from '@/context/i18n-context';

const vendorPaymentMethods = ['Bank Transfer', 'Cash', 'Card', 'Cheque', 'Other'] as const;

const statusColor: Record<VendorBillStatus, string> = {
  Draft: 'bg-slate-200 text-slate-800',
  Approved: 'bg-blue-200 text-blue-800',
  Paid: 'bg-green-200 text-green-800',
  Overdue: 'bg-red-200 text-red-800',
};

export function VendorBillTable() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { t } = useI18n();
  const { money, amount } = useCompanyCurrency();
  const { effectiveRole } = useAuthGuard();
  const canManageFinance = effectiveRole !== 'Employee';

  const vendorStatusLabel = (status: VendorBillStatus) => t(`vendorBills.status${status}`);
  const vendorMethodLabel = (method: string) => {
    switch (method) {
      case 'Bank Transfer': return t('vendorBills.payMethodBankTransfer');
      case 'Cash': return t('vendorBills.payMethodCash');
      case 'Card': return t('vendorBills.payMethodCard');
      case 'Cheque': return t('vendorBills.payMethodCheque');
      case 'Other': return t('vendorBills.payMethodOther');
      default: return method;
    }
  };

  const [bills, setBills] = React.useState<VendorBill[]>([]);
  const [accounts, setAccounts] = React.useState<LedgerAccount[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = React.useState<PurchaseOrder[]>([]);
  const [purchasePayables, setPurchasePayables] = React.useState<PurchaseOrderPayableSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | VendorBillStatus>('all');
  const [openCreate, setOpenCreate] = React.useState(false);
  const [openPayment, setOpenPayment] = React.useState(false);
  const [selectedBill, setSelectedBill] = React.useState<VendorBill | null>(null);
  const [billPayments, setBillPayments] = React.useState<VendorBillPayment[]>([]);
  const [paymentLoading, setPaymentLoading] = React.useState(false);
  const [paymentMode, setPaymentMode] = React.useState<'full' | 'partial'>('full');
  const [reversingPaymentId, setReversingPaymentId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    vendorName: '',
    supplierId: '',
    purchaseOrderId: '',
    referenceInvoiceNumber: '',
    issueDate: format(new Date(), 'yyyy-MM-dd'),
    dueDate: format(new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), 'yyyy-MM-dd'),
    amount: '',
    status: 'Draft' as VendorBillStatus,
    expenseAccountId: '',
    notes: '',
  });
  const [paymentForm, setPaymentForm] = React.useState({
    amount: '',
    method: '',
    note: '',
    paidAt: format(new Date(), 'yyyy-MM-dd'),
  });

  const load = React.useCallback(async () => {
    if (!selectedCompany) {
      setBills([]);
      setAccounts([]);
      setSuppliers([]);
      setPurchaseOrders([]);
      setPurchasePayables([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [billData, accountData, supplierData, purchaseOrderData, purchasePayableData] = await Promise.all([
        getVendorBills(selectedCompany.id),
        getLedgerAccounts(selectedCompany.id),
        getSuppliers(selectedCompany.id),
        getPurchaseOrders(selectedCompany.id),
        getPurchaseOrderPayables(selectedCompany.id),
      ]);
      setBills(billData);
      setAccounts(accountData);
      setSuppliers(supplierData);
      setPurchaseOrders(purchaseOrderData);
      setPurchasePayables(purchasePayableData);
    } catch (error: any) {
      setBills([]);
      setAccounts([]);
      setSuppliers([]);
      setPurchaseOrders([]);
      setPurchasePayables([]);
      toast({
        variant: 'destructive',
        title: t('vendorBills.toastUnavailableTitle'),
        description: error?.message || t('vendorBills.toastUnavailableDesc'),
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const accountNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((account) => map.set(account.id, `${account.code} - ${account.name}`));
    return map;
  }, [accounts]);

  const supplierMap = React.useMemo(() => {
    const map = new Map<string, Supplier>();
    suppliers.forEach((supplier) => map.set(supplier.id, supplier));
    return map;
  }, [suppliers]);

  const purchaseOrderMap = React.useMemo(() => {
    const map = new Map<string, PurchaseOrder>();
    purchaseOrders.forEach((order) => map.set(order.id, order));
    return map;
  }, [purchaseOrders]);

  const purchasePayablesMap = React.useMemo(() => {
    const map = new Map<string, PurchaseOrderPayableSummary>();
    purchasePayables.forEach((summary) => map.set(summary.purchaseOrderId, summary));
    return map;
  }, [purchasePayables]);

  const filteredBills = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    return bills.filter((bill) => {
      if (statusFilter !== 'all' && bill.status !== statusFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const purchaseOrderNumber = purchaseOrderMap.get(bill.purchaseOrderId || '')?.orderNumber || '';
      return [
        bill.billNumber,
        bill.vendorName,
        bill.status,
        purchaseOrderNumber,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [bills, purchaseOrderMap, search, statusFilter]);

  const supplierPurchaseOrders = React.useMemo(() => {
    if (!form.supplierId) return purchaseOrders;
    return purchaseOrders.filter(
      (order) =>
        (!order.supplierId || order.supplierId === form.supplierId)
        && (purchasePayablesMap.get(order.id)?.remainingToBill || order.totalAmount) > 0,
    );
  }, [form.supplierId, purchaseOrders, purchasePayablesMap]);

  const resetForm = () =>
    setForm({
      vendorName: '',
      supplierId: '',
      purchaseOrderId: '',
      referenceInvoiceNumber: '',
      issueDate: format(new Date(), 'yyyy-MM-dd'),
      dueDate: format(new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), 'yyyy-MM-dd'),
      amount: '',
      status: 'Draft',
      expenseAccountId: '',
      notes: '',
    });

  const handleCreate = async () => {
    if (!selectedCompany) return;
    const vendorName = form.vendorName || supplierMap.get(form.supplierId)?.name || purchaseOrderMap.get(form.purchaseOrderId)?.supplierName || '';
    const amount = form.amount ? Number(form.amount) : purchaseOrderMap.get(form.purchaseOrderId)?.totalAmount;
    if (!vendorName || !form.issueDate) {
      toast({
        variant: 'destructive',
        title: t('vendorBills.toastMissingFieldsTitle'),
        description: t('vendorBills.toastMissingFieldsDesc'),
      });
      return;
    }
    if (!amount || amount <= 0) {
      toast({
        variant: 'destructive',
        title: t('vendorBills.toastInvalidAmountTitle'),
        description: t('vendorBills.toastInvalidAmountDesc'),
      });
      return;
    }
    try {
      await createVendorBill(selectedCompany.id, {
        vendorName,
        supplierId: form.supplierId || undefined,
        purchaseOrderId: form.purchaseOrderId || undefined,
        referenceInvoiceNumber: form.referenceInvoiceNumber || undefined,
        issueDate: new Date(form.issueDate),
        dueDate: form.dueDate ? new Date(form.dueDate) : undefined,
        amount,
        status: form.status,
        notes: form.notes || undefined,
        expenseAccountId: form.expenseAccountId || undefined,
      });
      setOpenCreate(false);
      resetForm();
      await load();
      toast({ title: t('vendorBills.toastCreated') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('vendorBills.toastCreateFailedTitle'),
        description: error?.message || t('vendorBills.toastCreateFailedDesc'),
      });
    }
  };

  const openPaymentDialog = async (bill: VendorBill) => {
    setSelectedBill(bill);
    setOpenPayment(true);
    setPaymentMode('full');
    setReversingPaymentId(null);
    setPaymentForm({
      amount: String(bill.outstandingAmount || 0),
      method: 'Bank Transfer',
      note: '',
      paidAt: format(new Date(), 'yyyy-MM-dd'),
    });
    setPaymentLoading(true);
    try {
      const payments = await getVendorBillPayments(bill.id);
      setBillPayments(payments);
    } catch (error: any) {
      setBillPayments([]);
      toast({
        variant: 'destructive',
        title: t('vendorBills.toastPaymentsUnavailableTitle'),
        description: error?.message || t('vendorBills.toastPaymentsUnavailableDesc'),
      });
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleCreatePayment = async () => {
    if (!selectedBill) return;
    const paymentAmount = Number(paymentForm.amount || 0);
    const outstandingAmount = selectedBill.outstandingAmount || 0;
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      toast({
        variant: 'destructive',
        title: t('vendorBills.toastInvalidPaymentTitle'),
        description: t('vendorBills.toastInvalidPaymentDesc'),
      });
      return;
    }
    if (paymentAmount > outstandingAmount + 0.0001) {
      toast({
        variant: 'destructive',
        title: t('vendorBills.toastInvalidPaymentTitle'),
        description: t('vendorBills.toastPaymentExceedsOutstanding')
          .replace('{amount}', money(outstandingAmount)),
      });
      return;
    }
    const remainingAmount = Math.max(0, outstandingAmount - paymentAmount);
    if (!(await confirm({
      title: t('vendorBills.confirmPaymentTitle'),
      description: t('vendorBills.confirmPaymentDesc')
        .replace('{amount}', money(paymentAmount))
        .replace('{number}', selectedBill.billNumber)
        .replace('{type}', remainingAmount > 0 ? t('vendorBills.partialPayment') : t('vendorBills.fullPayment'))
        .replace('{method}', vendorMethodLabel(paymentForm.method))
        .replace('{date}', paymentForm.paidAt)
        .replace('{remaining}', money(remainingAmount)),
      confirmText: t('vendorBills.confirmRecordPayment'),
      cancelText: t('common.cancel'),
    }))) return;
    try {
      await createVendorBillPayment(selectedBill.id, {
        amount: paymentAmount,
        method: paymentForm.method || undefined,
        note: paymentForm.note || undefined,
        paidAt: new Date(paymentForm.paidAt),
      });
      setOpenPayment(false);
      setSelectedBill(null);
      setBillPayments([]);
      await load();
      toast({ title: t('vendorBills.toastPaymentRecorded') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('vendorBills.toastPaymentFailedTitle'),
        description: error?.message || t('vendorBills.toastPaymentFailedDesc'),
      });
    }
  };

  const bulkUpdate = async (targetStatus: VendorBillStatus, currentStatus: VendorBillStatus) => {
    if (!selectedCompany) return;
    try {
      const result = await bulkUpdateVendorBillStatus(selectedCompany.id, targetStatus, {
        currentStatus,
      });
      await load();
      toast({
        title: t('vendorBills.toastBulkCompleteTitle'),
        description: t('vendorBills.toastBulkCompleteDesc')
          .replace('{count}', String(result.updatedCount))
          .replace('{status}', targetStatus),
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('vendorBills.toastBulkFailedTitle'),
        description: error?.message || t('vendorBills.toastBulkFailedDesc'),
      });
    }
  };

  if (loading) {
    return (
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('vendorBills.colBillNumber')}</TableHead>
              <TableHead>{t('vendorBills.colVendor')}</TableHead>
              <TableHead>{t('vendorBills.colDueDate')}</TableHead>
              <TableHead>{t('vendorBills.colAmount')}</TableHead>
              <TableHead>{t('vendorBills.colStatus')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 4 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (!selectedCompany) {
    return (
      <div className="rounded-lg border">
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          {t('vendorBills.selectCompany')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionToolbar
        search={(
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('vendorBills.searchPlaceholder')}
            className="max-w-md"
          />
        )}
        filters={(
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as 'all' | VendorBillStatus)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('vendorBills.allStatuses')}</SelectItem>
              <SelectItem value="Draft">{t('vendorBills.statusDraft')}</SelectItem>
              <SelectItem value="Approved">{t('vendorBills.statusApproved')}</SelectItem>
              <SelectItem value="Paid">{t('vendorBills.statusPaid')}</SelectItem>
              <SelectItem value="Overdue">{t('vendorBills.statusOverdue')}</SelectItem>
            </SelectContent>
          </Select>
        )}
        summary={t('vendorBills.summary')
          .replace('{count}', String(filteredBills.length))
          .replace('{amount}', money(filteredBills.reduce((sum, bill) => sum + (bill.outstandingAmount || 0), 0)))}
        actions={(
          <>
          {canManageFinance && (
          <Button variant="outline" size="sm" onClick={() => bulkUpdate('Approved', 'Draft')}>
            <ListChecks className="me-2 h-4 w-4" />
            {t('vendorBills.approveAllDraft')}
          </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                `vendor-bills-${format(new Date(), 'yyyy-MM-dd')}.csv`,
                [
                  'invoiceNumber',
                  'referenceInvoiceNumber',
                  'vendorName',
                  'issueDate',
                  'dueDate',
                  'amount',
                  'status',
                  'expenseAccount',
                ],
                filteredBills.map((bill) => [
                  bill.billNumber,
                  bill.referenceInvoiceNumber || '',
                  bill.vendorName,
                  bill.issueDate.toISOString(),
                  bill.dueDate.toISOString(),
                  bill.amount,
                  bill.status,
                  accountNameMap.get(bill.expenseAccountId || '') || '',
                ]),
              )
            }
          >
            <Download className="me-2 h-4 w-4" />
            {t('vendorBills.exportCsv')}
          </Button>
          {canManageFinance && (
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button>
                <FilePlus className="me-2 h-4 w-4" />
                {t('vendorBills.newBill')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t('vendorBills.createTitle')}</DialogTitle>
                <DialogDescription>
                  {t('vendorBills.createDescription')}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t('vendorBills.supplierLabel')}</Label>
                  <Select
                    value={form.supplierId || 'manual'}
                    onValueChange={(value) => {
                      const nextSupplierId = value === 'manual' ? '' : value;
                      const supplier = nextSupplierId ? supplierMap.get(nextSupplierId) : undefined;
                      setForm((prev) => ({
                        ...prev,
                        supplierId: nextSupplierId,
                        vendorName: supplier?.name || prev.vendorName,
                        purchaseOrderId:
                          prev.purchaseOrderId &&
                          purchaseOrderMap.get(prev.purchaseOrderId)?.supplierId !== nextSupplierId
                            ? ''
                            : prev.purchaseOrderId,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('vendorBills.supplierPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">{t('vendorBills.manualEntry')}</SelectItem>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t('vendorBills.purchaseOrderLabel')}</Label>
                  <Select
                    value={form.purchaseOrderId || 'none'}
                    onValueChange={(value) => {
                      const nextOrderId = value === 'none' ? '' : value;
                      const order = nextOrderId ? purchaseOrderMap.get(nextOrderId) : undefined;
                      setForm((prev) => ({
                        ...prev,
                        purchaseOrderId: nextOrderId,
                        supplierId: order?.supplierId || prev.supplierId,
                        vendorName: order?.supplierName || prev.vendorName,
                        amount: order ? String(order.totalAmount) : prev.amount,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('vendorBills.purchaseOrderPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('vendorBills.noLinkedPo')}</SelectItem>
                      {supplierPurchaseOrders.map((order) => (
                        <SelectItem key={order.id} value={order.id}>
                          {order.orderNumber} - {order.supplierName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.purchaseOrderId && (
                    <p className="text-xs text-muted-foreground">
                      {t('vendorBills.remainingToBill').replace('{amount}', money(
                        purchasePayablesMap.get(form.purchaseOrderId)?.remainingToBill
                        || purchaseOrderMap.get(form.purchaseOrderId)?.totalAmount
                        || 0,
                      ))}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>{t('vendorBills.vendorNameLabel')}</Label>
                  <Input
                    value={form.vendorName}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, vendorName: event.target.value }))
                    }
                    placeholder={t('vendorBills.vendorNamePlaceholder')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('vendorBills.billNumberLabel')}</Label>
                  <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                    {t('vendorBills.autoGenerated')}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>{t('vendorBills.referenceLabel')}</Label>
                  <Input
                    value={form.referenceInvoiceNumber}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, referenceInvoiceNumber: event.target.value }))
                    }
                    placeholder={t('vendorBills.referencePlaceholder')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('vendorBills.issueDateLabel')}</Label>
                  <Input
                    type="date"
                    value={form.issueDate}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, issueDate: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('vendorBills.dueDateLabel')}</Label>
                  <Input
                    type="date"
                    value={form.dueDate}
                    onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('vendorBills.amountLabel')}</Label>
                  <Input
                    type="number"
                    value={form.amount}
                    onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('vendorBills.statusLabel')}</Label>
                  <Select
                    value={form.status}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, status: value as VendorBillStatus }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Draft">{t('vendorBills.statusDraft')}</SelectItem>
                      <SelectItem value="Approved">{t('vendorBills.statusApproved')}</SelectItem>
                      <SelectItem value="Overdue">{t('vendorBills.statusOverdue')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>{t('vendorBills.expenseAccountLabel')}</Label>
                  <Select
                    value={form.expenseAccountId || 'default'}
                    onValueChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        expenseAccountId: value === 'default' ? '' : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">{t('vendorBills.defaultExpenseAccount')}</SelectItem>
                      {accounts
                        .filter((account) => account.type === 'Expense')
                        .map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.code} - {account.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>{t('vendorBills.notesLabel')}</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder={t('vendorBills.notesPlaceholder')}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenCreate(false)}>
                  {t('vendorBills.cancel')}
                </Button>
            <Button onClick={handleCreate}>{t('vendorBills.createBill')}</Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
          )}
          </>
        )}
      />

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        {t('vendorBills.helperText')} <span className="font-medium">{t('vendorBills.helperRecordPayment')}</span>{t('vendorBills.helperTextSuffix')}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('vendorBills.colBillNumber')}</TableHead>
              <TableHead>{t('vendorBills.colVendor')}</TableHead>
              <TableHead>{t('vendorBills.colIssueDate')}</TableHead>
              <TableHead>{t('vendorBills.colDueDate')}</TableHead>
              <TableHead className="text-end">{t('vendorBills.colAmount')}</TableHead>
              <TableHead className="text-end">{t('vendorBills.colPaid')}</TableHead>
              <TableHead className="text-end">{t('vendorBills.colOutstanding')}</TableHead>
              <TableHead>{t('vendorBills.colPurchaseOrder')}</TableHead>
              <TableHead>{t('vendorBills.colExpenseAccount')}</TableHead>
              <TableHead>{t('vendorBills.colStatus')}</TableHead>
              <TableHead className="text-end">{t('vendorBills.colPayment')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBills.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="h-20 text-center text-muted-foreground">
                  {bills.length === 0
                    ? t('vendorBills.noBillsYet')
                    : t('vendorBills.noBillsMatch')}
                </TableCell>
              </TableRow>
            ) : (
              filteredBills.map((bill) => (
                <TableRow key={bill.id}>
                  <TableCell className="font-medium">{bill.billNumber}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div>{bill.vendorName}</div>
                      {(bill.referenceInvoiceNumber || bill.supplierId) && (
                        <div className="text-xs text-muted-foreground">
                          {bill.referenceInvoiceNumber
                            ? t('vendorBills.supplierRef').replace('{ref}', bill.referenceInvoiceNumber)
                            : t('vendorBills.linkedSupplier')}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{format(bill.issueDate, 'MMM d, yyyy')}</TableCell>
                  <TableCell>{format(bill.dueDate, 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-end">{amount(bill.amount)}</TableCell>
                  <TableCell className="text-end">{amount(bill.paidAmount || 0)}</TableCell>
                  <TableCell className="text-end">{amount(bill.outstandingAmount || 0)}</TableCell>
                  <TableCell>{purchaseOrderMap.get(bill.purchaseOrderId || '')?.orderNumber || '—'}</TableCell>
                  <TableCell>{accountNameMap.get(bill.expenseAccountId || '') || t('vendorBills.defaultAccountShort')}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {canManageFinance ? (
                      <Select
                        value={bill.status}
                        disabled={bill.status === 'Paid'}
                        onValueChange={async (value) => {
                          try {
                            await updateVendorBillStatus(bill.id, value as VendorBillStatus);
                            await load();
                          } catch (error: any) {
                            toast({
                              variant: 'destructive',
                              title: t('vendorBills.toastStatusFailedTitle'),
                              description: error?.message || t('vendorBills.toastStatusFailedDesc'),
                            });
                          }
                        }}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Draft">{t('vendorBills.statusDraft')}</SelectItem>
                          <SelectItem value="Approved">{t('vendorBills.statusApproved')}</SelectItem>
                          {bill.status === 'Paid' && <SelectItem value="Paid">{t('vendorBills.statusPaid')}</SelectItem>}
                          <SelectItem value="Overdue">{t('vendorBills.statusOverdue')}</SelectItem>
                        </SelectContent>
                      </Select>
                      ) : null}
                      <Badge className={statusColor[bill.status]}>{vendorStatusLabel(bill.status)}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-end">
                    {!canManageFinance ? null : bill.status === 'Draft' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            await updateVendorBillStatus(bill.id, 'Approved');
                            await load();
                            toast({ title: t('vendorBills.toastApproved') });
                          } catch (error: any) {
                            toast({
                              variant: 'destructive',
                              title: t('vendorBills.toastApprovalFailedTitle'),
                              description: error?.message || t('vendorBills.toastApprovalFailedDesc'),
                            });
                          }
                        }}
                      >
                        <ListChecks className="me-2 h-4 w-4" />
                        {t('vendorBills.approveBtn')}
                      </Button>
                    ) : (bill.outstandingAmount || 0) > 0 || (bill.paidAmount || 0) > 0 ? (
                      <Button variant="outline" size="sm" onClick={() => openPaymentDialog(bill)}>
                        <CircleDollarSign className="me-2 h-4 w-4" />
                        {(bill.paidAmount || 0) > 0
                          ? t('vendorBills.managePaymentsBtn')
                          : t('vendorBills.recordPaymentBtn')}
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {(bill.paidAmount || 0) > 0 ? t('vendorBills.settled') : t('vendorBills.noAction')}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={openPayment}
        onOpenChange={(open) => {
          setOpenPayment(open);
          if (!open) {
            setSelectedBill(null);
            setBillPayments([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {(selectedBill?.paidAmount || 0) > 0
                ? t('vendorBills.managePaymentsTitle')
                : t('vendorBills.recordPaymentTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('vendorBills.recordPaymentDesc')}
            </DialogDescription>
          </DialogHeader>
          {selectedBill && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3 text-sm">
                  <div className="text-muted-foreground">{t('vendorBills.billAmount')}</div>
                  <div className="text-lg font-semibold">{amount(selectedBill.amount)}</div>
                </div>
                <div className="rounded-md border p-3 text-sm">
                  <div className="text-muted-foreground">{t('vendorBills.colPaid')}</div>
                  <div className="text-lg font-semibold">{amount(selectedBill.paidAmount || 0)}</div>
                </div>
                <div className="rounded-md border p-3 text-sm">
                  <div className="text-muted-foreground">{t('vendorBills.colOutstanding')}</div>
                  <div className="text-lg font-semibold">{amount(selectedBill.outstandingAmount || 0)}</div>
                </div>
              </div>

              {(selectedBill.outstandingAmount || 0) > 0 && (
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label>{t('vendorBills.paymentType')}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={paymentMode === 'full' ? 'default' : 'outline'}
                      onClick={() => {
                        setPaymentMode('full');
                        setPaymentForm((prev) => ({
                          ...prev,
                          amount: String(selectedBill.outstandingAmount || 0),
                        }));
                      }}
                    >
                      {t('vendorBills.fullPayment')}
                    </Button>
                    <Button
                      type="button"
                      variant={paymentMode === 'partial' ? 'default' : 'outline'}
                      onClick={() => {
                        setPaymentMode('partial');
                        setPaymentForm((prev) => ({ ...prev, amount: '' }));
                      }}
                    >
                      {t('vendorBills.partialPayment')}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t('vendorBills.paymentAmountLabel')}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    max={selectedBill.outstandingAmount || 0}
                    value={paymentForm.amount}
                    onChange={(event) => {
                      setPaymentMode('partial');
                      setPaymentForm((prev) => ({ ...prev, amount: event.target.value }));
                    }}
                    placeholder={t('vendorBills.paymentAmountPlaceholder')}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('vendorBills.paymentAmountHelp')
                      .replace('{amount}', money(selectedBill.outstandingAmount || 0))}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>{t('vendorBills.paidDate')}</Label>
                  <Input
                    type="date"
                    value={paymentForm.paidAt}
                    onChange={(event) =>
                      setPaymentForm((prev) => ({ ...prev, paidAt: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('vendorBills.paymentMethod')}</Label>
                  <Select
                    value={paymentForm.method || 'Bank Transfer'}
                    onValueChange={(value) =>
                      setPaymentForm((prev) => ({ ...prev, method: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {vendorPaymentMethods.map((method) => (
                        <SelectItem key={method} value={method}>
                          {vendorMethodLabel(method)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>{t('vendorBills.paymentNote')}</Label>
                  <Textarea
                    value={paymentForm.note}
                    onChange={(event) =>
                      setPaymentForm((prev) => ({ ...prev, note: event.target.value }))
                    }
                    placeholder={t('vendorBills.paymentNotePlaceholder')}
                  />
                </div>
                </div>
              </div>
              )}

              {(selectedBill.outstandingAmount || 0) <= 0 && billPayments.length > 0 && (
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  {t('vendorBills.fullyPaidManageHelp')}
                </p>
              )}

              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('vendorBills.colHistDate')}</TableHead>
                      <TableHead>{t('vendorBills.colHistMethod')}</TableHead>
                      <TableHead>{t('vendorBills.colHistNote')}</TableHead>
                      <TableHead className="text-end">{t('vendorBills.colHistAmount')}</TableHead>
                      <TableHead className="text-end" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentLoading &&
                      Array.from({ length: 2 }).map((_, index) => (
                        <TableRow key={index}>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                          <TableCell><Skeleton className="ms-auto h-5 w-16" /></TableCell>
                          <TableCell />
                        </TableRow>
                      ))}
                    {!paymentLoading && billPayments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                          {t('vendorBills.noPaymentsYet')}
                        </TableCell>
                      </TableRow>
                    )}
                    {!paymentLoading &&
                      billPayments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{format(payment.paidAt, 'MMM d, yyyy')}</TableCell>
                          <TableCell>{payment.method || '—'}</TableCell>
                          <TableCell>{payment.note || '—'}</TableCell>
                          <TableCell className="text-end">{amount(payment.amount)}</TableCell>
                          <TableCell className="text-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
                              disabled={reversingPaymentId === payment.id}
                              onClick={async () => {
                                if (!selectedBill) return;
                                if (!(await confirm({
                                  title: t('vendorBills.reversePaymentTitle'),
                                  description: t('vendorBills.reversePaymentDesc')
                                    .replace('{amount}', String(payment.amount))
                                    .replace('{number}', selectedBill.billNumber),
                                  confirmText: t('vendorBills.reversePaymentConfirm'),
                                  cancelText: t('common.cancel'),
                                  destructive: true,
                                }))) return;
                                setReversingPaymentId(payment.id);
                                try {
                                  const updatedBill = await reverseVendorBillPayment(selectedBill.id, payment.id);
                                  const refreshed = await getVendorBillPayments(selectedBill.id);
                                  setBillPayments(refreshed);
                                  setSelectedBill(updatedBill);
                                  setPaymentMode('full');
                                  setPaymentForm((prev) => ({
                                    ...prev,
                                    amount: String(updatedBill.outstandingAmount || 0),
                                  }));
                                  await load();
                                  toast({ title: t('vendorBills.toastPaymentReversed') });
                                } catch (error: any) {
                                  toast({
                                    variant: 'destructive',
                                    title: t('vendorBills.toastPaymentReverseFailed'),
                                    description: error?.message,
                                  });
                                } finally {
                                  setReversingPaymentId(null);
                                }
                              }}
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              {t('vendorBills.reversePaymentBtn')}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
              {selectedCompany && (
                <RecordSupportPanel
                  companyId={selectedCompany.id}
                  entityType="vendor_bill"
                  entityId={selectedBill.id}
                  title={t('vendorBills.attachmentsTitle')}
                  compact
                />
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenPayment(false)}>
              {t('vendorBills.cancel')}
            </Button>
            {(selectedBill?.outstandingAmount || 0) > 0 && (
            <Button onClick={handleCreatePayment}>{t('vendorBills.recordPaymentBtn')}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
