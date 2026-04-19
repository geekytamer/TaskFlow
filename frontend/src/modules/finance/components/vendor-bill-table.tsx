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
import {
  bulkUpdateVendorBillStatus,
  createVendorBillPayment,
  createVendorBill,
  getLedgerAccounts,
  getPurchaseOrderPayables,
  getVendorBillPayments,
  getVendorBills,
  updateVendorBillStatus,
} from '@/services/financeService';
import type {
  LedgerAccount,
  PurchaseOrderPayableSummary,
  VendorBill,
  VendorBillPayment,
  VendorBillStatus,
} from '@/modules/finance/types';
import { getPurchaseOrders, getSuppliers } from '@/services/operationsService';
import type { PurchaseOrder, Supplier } from '@/modules/operations/types';
import { CircleDollarSign, Download, FilePlus, ListChecks } from 'lucide-react';
import { downloadCsv } from '@/modules/finance/lib/csv';
import { RecordSupportPanel } from '@/modules/shared/components/record-support-panel';
import { SectionToolbar } from '@/modules/operations/components/section-toolbar';

const vendorPaymentMethods = ['Bank Transfer', 'Cash', 'Card', 'Cheque', 'Other'] as const;

const statusColor: Record<VendorBillStatus, string> = {
  Draft: 'bg-slate-200 text-slate-800',
  Approved: 'bg-blue-200 text-blue-800',
  Paid: 'bg-green-200 text-green-800',
  Overdue: 'bg-red-200 text-red-800',
};

const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value || 0);

export function VendorBillTable() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();

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
        title: 'Vendor bills unavailable',
        description: error?.message || 'Could not load vendor bills.',
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
        title: 'Missing required fields',
        description: 'Vendor and issue date are required.',
      });
      return;
    }
    if (!amount || amount <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid amount',
        description: 'Vendor bill amount must be greater than zero.',
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
      toast({ title: 'Vendor invoice created' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Create failed',
        description: error?.message || 'Could not create vendor bill.',
      });
    }
  };

  const openPaymentDialog = async (bill: VendorBill) => {
    setSelectedBill(bill);
    setOpenPayment(true);
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
        title: 'Payments unavailable',
        description: error?.message || 'Could not load vendor bill payments.',
      });
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleCreatePayment = async () => {
    if (!selectedBill) return;
    const amount = Number(paymentForm.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid payment',
        description: 'Payment amount must be greater than zero.',
      });
      return;
    }
    try {
      await createVendorBillPayment(selectedBill.id, {
        amount,
        method: paymentForm.method || undefined,
        note: paymentForm.note || undefined,
        paidAt: new Date(paymentForm.paidAt),
      });
      setOpenPayment(false);
      setSelectedBill(null);
      setBillPayments([]);
      await load();
      toast({ title: 'Vendor payment recorded' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Payment failed',
        description: error?.message || 'Could not record vendor bill payment.',
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
        title: 'Bulk update complete',
        description: `${result.updatedCount} bills moved to ${targetStatus}.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Bulk update failed',
        description: error?.message || 'Could not apply bulk status update.',
      });
    }
  };

  if (loading) {
    return (
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
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
          Select a company to view vendor invoices.
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
            placeholder="Search by invoice number, vendor, or PO"
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
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Approved">Approved</SelectItem>
              <SelectItem value="Paid">Paid</SelectItem>
              <SelectItem value="Overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        )}
        summary={`${filteredBills.length} invoices shown • outstanding ${money(filteredBills.reduce((sum, bill) => sum + (bill.outstandingAmount || 0), 0))}`}
        actions={(
          <>
          <Button variant="outline" size="sm" onClick={() => bulkUpdate('Approved', 'Draft')}>
            <ListChecks className="me-2 h-4 w-4" />
            Approve All Draft
          </Button>
          <Button variant="outline" size="sm" onClick={() => bulkUpdate('Paid', 'Approved')}>
            <ListChecks className="me-2 h-4 w-4" />
            Mark All Approved Paid
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                `vendor-invoices-${format(new Date(), 'yyyy-MM-dd')}.csv`,
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
            Export CSV
          </Button>
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button>
                <FilePlus className="me-2 h-4 w-4" />
                New Vendor Invoice
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Vendor Invoice</DialogTitle>
                <DialogDescription>
                  Internal invoice number is generated automatically. Use the optional reference field for the supplier-side invoice number.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Supplier</Label>
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
                      <SelectValue placeholder="Select supplier or enter manually" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual vendor entry</SelectItem>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Purchase Order</Label>
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
                      <SelectValue placeholder="Optional linked purchase order" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No linked purchase order</SelectItem>
                      {supplierPurchaseOrders.map((order) => (
                        <SelectItem key={order.id} value={order.id}>
                          {order.orderNumber} - {order.supplierName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.purchaseOrderId && (
                    <p className="text-xs text-muted-foreground">
                      Remaining to bill{' '}
                      {money(
                        purchasePayablesMap.get(form.purchaseOrderId)?.remainingToBill
                        || purchaseOrderMap.get(form.purchaseOrderId)?.totalAmount
                        || 0,
                      )}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Vendor Name</Label>
                  <Input
                    value={form.vendorName}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, vendorName: event.target.value }))
                    }
                    placeholder="Vendor name"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Invoice Number</Label>
                  <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                    Auto-generated when saved
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Reference Supplier Invoice #</Label>
                  <Input
                    value={form.referenceInvoiceNumber}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, referenceInvoiceNumber: event.target.value }))
                    }
                    placeholder="Optional supplier invoice number"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Issue Date</Label>
                  <Input
                    type="date"
                    value={form.issueDate}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, issueDate: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    value={form.dueDate}
                    onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    value={form.amount}
                    onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
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
                      <SelectItem value="Draft">Draft</SelectItem>
                      <SelectItem value="Approved">Approved</SelectItem>
                      <SelectItem value="Paid">Paid</SelectItem>
                      <SelectItem value="Overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Expense Account</Label>
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
                      <SelectItem value="default">Default (5000 Operating Expense)</SelectItem>
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
                  <Label>Notes</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Optional notes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenCreate(false)}>
                  Cancel
                </Button>
            <Button onClick={handleCreate}>Create Invoice</Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
          </>
        )}
      />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Issue Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className="text-end">Amount</TableHead>
              <TableHead className="text-end">Paid</TableHead>
              <TableHead className="text-end">Outstanding</TableHead>
              <TableHead>Purchase Order</TableHead>
              <TableHead>Expense Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-end">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBills.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="h-20 text-center text-muted-foreground">
                  {bills.length === 0
                    ? 'No vendor invoices yet. Create one from purchasing or manual AP entry to start payable tracking.'
                    : 'No vendor invoices match the current search or status filter.'}
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
                            ? `Supplier ref ${bill.referenceInvoiceNumber}`
                            : 'Linked supplier record'}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{format(bill.issueDate, 'MMM d, yyyy')}</TableCell>
                  <TableCell>{format(bill.dueDate, 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-end">{money(bill.amount)}</TableCell>
                  <TableCell className="text-end">{money(bill.paidAmount || 0)}</TableCell>
                  <TableCell className="text-end">{money(bill.outstandingAmount || 0)}</TableCell>
                  <TableCell>{purchaseOrderMap.get(bill.purchaseOrderId || '')?.orderNumber || '—'}</TableCell>
                  <TableCell>{accountNameMap.get(bill.expenseAccountId || '') || 'Default'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Select
                        value={bill.status}
                        onValueChange={async (value) => {
                          try {
                            await updateVendorBillStatus(bill.id, value as VendorBillStatus);
                            await load();
                          } catch (error: any) {
                            toast({
                              variant: 'destructive',
                              title: 'Status update failed',
                              description: error?.message || 'Could not update vendor bill status.',
                            });
                          }
                        }}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Draft">Draft</SelectItem>
                          <SelectItem value="Approved">Approved</SelectItem>
                          <SelectItem value="Paid">Paid</SelectItem>
                          <SelectItem value="Overdue">Overdue</SelectItem>
                        </SelectContent>
                      </Select>
                      <Badge className={statusColor[bill.status]}>{bill.status}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-end">
                    {(bill.outstandingAmount || 0) > 0 && bill.status !== 'Draft' ? (
                      <Button variant="outline" size="sm" onClick={() => openPaymentDialog(bill)}>
                        <CircleDollarSign className="me-2 h-4 w-4" />
                        Pay
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {(bill.paidAmount || 0) > 0 ? 'Settled' : 'No action'}
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
            <DialogTitle>Record Vendor Payment</DialogTitle>
            <DialogDescription>
              Apply a partial or full payment against the selected vendor invoice.
            </DialogDescription>
          </DialogHeader>
          {selectedBill && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3 text-sm">
                  <div className="text-muted-foreground">Bill Amount</div>
                  <div className="text-lg font-semibold">{money(selectedBill.amount)}</div>
                </div>
                <div className="rounded-md border p-3 text-sm">
                  <div className="text-muted-foreground">Paid</div>
                  <div className="text-lg font-semibold">{money(selectedBill.paidAmount || 0)}</div>
                </div>
                <div className="rounded-md border p-3 text-sm">
                  <div className="text-muted-foreground">Outstanding</div>
                  <div className="text-lg font-semibold">{money(selectedBill.outstandingAmount || 0)}</div>
                </div>
              </div>

              <div className="grid gap-3 py-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(event) =>
                      setPaymentForm((prev) => ({ ...prev, amount: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Paid Date</Label>
                  <Input
                    type="date"
                    value={paymentForm.paidAt}
                    onChange={(event) =>
                      setPaymentForm((prev) => ({ ...prev, paidAt: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Payment Method</Label>
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
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Note</Label>
                  <Textarea
                    value={paymentForm.note}
                    onChange={(event) =>
                      setPaymentForm((prev) => ({ ...prev, note: event.target.value }))
                    }
                    placeholder="Reference number or settlement note"
                  />
                </div>
              </div>

              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="text-end">Amount</TableHead>
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
                        </TableRow>
                      ))}
                    {!paymentLoading && billPayments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                          No payments recorded yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {!paymentLoading &&
                      billPayments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{format(payment.paidAt, 'MMM d, yyyy')}</TableCell>
                          <TableCell>{payment.method || '—'}</TableCell>
                          <TableCell>{payment.note || '—'}</TableCell>
                          <TableCell className="text-end">{money(payment.amount)}</TableCell>
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
                  title="Vendor Invoice Attachments & Timeline"
                  compact
                />
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenPayment(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePayment}>Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
