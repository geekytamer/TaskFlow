'use client';

import * as React from 'react';
import { format, startOfMonth } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { PurchaseOrderPayableSummary } from '@/modules/finance/types';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { SectionToolbar } from '@/modules/operations/components/section-toolbar';
import { getPurchaseOrderPayables } from '@/services/financeService';
import {
  createPurchaseOrder,
  getInventoryItems,
  getPurchaseOrders,
  getPurchaseReceipts,
  receivePurchaseOrder,
  updatePurchaseOrderStatus,
} from '@/services/operationsService';
import { getContacts, type Contact } from '@/services/contactService';
import type {
  InventoryItem,
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseReceipt,
} from '@/modules/operations/types';
import { PackageCheck, ShoppingCart } from 'lucide-react';
import { RecordSupportPanel } from '@/modules/shared/components/record-support-panel';

const statusStyles: Record<PurchaseOrderStatus, string> = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  Ordered: 'bg-blue-100 text-blue-700 border-blue-200',
  'Partially Received': 'bg-amber-100 text-amber-700 border-amber-200',
  Received: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-red-100 text-red-700 border-red-200',
};

type PurchaseItemForm = {
  inventoryItemId: string;
  quantity: string;
  unitCost: string;
};

type PurchaseForm = {
  contactId: string;
  orderDate: string;
  expectedDate: string;
  status: PurchaseOrderStatus;
  notes: string;
  items: PurchaseItemForm[];
};

type ReceiptState = {
  open: boolean;
  order?: PurchaseOrder;
  notes: string;
  quantities: Record<number, string>;
};

const emptyPurchaseForm = (): PurchaseForm => ({
  contactId: '',
  orderDate: format(new Date(), 'yyyy-MM-dd'),
  expectedDate: format(new Date(Date.now() + 1000 * 60 * 60 * 24 * 14), 'yyyy-MM-dd'),
  status: 'Draft',
  notes: '',
  items: [{ inventoryItemId: '', quantity: '1', unitCost: '0' }],
});

export function PurchasesPage() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const { money, amount } = useCompanyCurrency();
  const [orders, setOrders] = React.useState<PurchaseOrder[]>([]);
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = React.useState<Contact[]>([]);
  const [receipts, setReceipts] = React.useState<PurchaseReceipt[]>([]);
  const [payables, setPayables] = React.useState<PurchaseOrderPayableSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [openCreate, setOpenCreate] = React.useState(false);
  const [selectedOrderForDocs, setSelectedOrderForDocs] = React.useState<PurchaseOrder | null>(null);
  const [form, setForm] = React.useState<PurchaseForm>(emptyPurchaseForm);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | PurchaseOrderStatus>('all');
  const [receiptState, setReceiptState] = React.useState<ReceiptState>({
    open: false,
    notes: '',
    quantities: {},
  });

  const load = React.useCallback(async () => {
    if (!selectedCompany) {
      setOrders([]);
      setItems([]);
      setSuppliers([]);
      setReceipts([]);
      setPayables([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [orderData, itemData, supplierData, receiptData, payableData] = await Promise.all([
        getPurchaseOrders(selectedCompany.id),
        getInventoryItems(selectedCompany.id),
        getContacts(selectedCompany.id, 'Vendor'),
        getPurchaseReceipts(selectedCompany.id),
        getPurchaseOrderPayables(selectedCompany.id),
      ]);
      setOrders(orderData);
      setItems(itemData);
      setSuppliers(supplierData);
      setReceipts(receiptData);
      setPayables(payableData);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Purchases unavailable',
        description: error?.message || 'Could not load purchase orders.',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const inventoryMap = React.useMemo(() => {
    const map = new Map<string, InventoryItem>();
    items.forEach((item) => map.set(item.id, item));
    return map;
  }, [items]);

  const supplierMap = React.useMemo(() => {
    const map = new Map<string, Contact>();
    suppliers.forEach((c: Contact) => {
      map.set(c.id, c);
      if (c.supplierId) map.set(c.supplierId, c);
    });
    return map;
  }, [suppliers]);

  const receiptTotalsByOrder = React.useMemo(() => {
    const map = new Map<string, Map<number, number>>();
    receipts.forEach((receipt) => {
      const orderMap = map.get(receipt.purchaseOrderId) || new Map<number, number>();
      receipt.items.forEach((item) => {
        orderMap.set(
          item.lineIndex,
          Number(((orderMap.get(item.lineIndex) || 0) + item.quantity).toFixed(4)),
        );
      });
      map.set(receipt.purchaseOrderId, orderMap);
    });
    return map;
  }, [receipts]);

  const payableMap = React.useMemo(() => {
    const map = new Map<string, PurchaseOrderPayableSummary>();
    payables.forEach((summary) => map.set(summary.purchaseOrderId, summary));
    return map;
  }, [payables]);

  const stats = React.useMemo(() => {
    const openOrders = orders.filter(
      (order) =>
        order.status === 'Draft'
        || order.status === 'Ordered'
        || order.status === 'Partially Received',
    );
    const orderedSpend = openOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    const awaitingReceiptUnits = orders.reduce((sum, order) => {
      if (order.status === 'Received' || order.status === 'Cancelled') {
        return sum;
      }
      const lineTotals = receiptTotalsByOrder.get(order.id) || new Map<number, number>();
      const remainingUnits = order.items.reduce(
        (itemSum, item, lineIndex) =>
          itemSum + Math.max(0, item.quantity - (lineTotals.get(lineIndex) || 0)),
        0,
      );
      return sum + remainingUnits;
    }, 0);
    const monthStart = startOfMonth(new Date());
    const receivedThisMonth = receipts.filter((receipt) => receipt.receivedAt >= monthStart).length;
    const unbilledValue = payables.reduce((sum, summary) => sum + summary.remainingToBill, 0);

    return {
      openOrders: openOrders.length,
      orderedSpend,
      awaitingReceiptUnits,
      receivedThisMonth,
      unbilledValue,
    };
  }, [orders, payables, receiptTotalsByOrder, receipts]);

  const orderReceiptProgress = React.useMemo(() => {
    const map = new Map<string, { receivedUnits: number; totalUnits: number; remainingUnits: number }>();
    orders.forEach((order) => {
      const lineTotals = receiptTotalsByOrder.get(order.id) || new Map<number, number>();
      const totalUnits = order.items.reduce((sum, item) => sum + item.quantity, 0);
      const receivedUnits = order.items.reduce(
        (sum, _item, lineIndex) => sum + (lineTotals.get(lineIndex) || 0),
        0,
      );
      map.set(order.id, {
        totalUnits,
        receivedUnits,
        remainingUnits: Number((totalUnits - receivedUnits).toFixed(4)),
      });
    });
    return map;
  }, [orders, receiptTotalsByOrder]);

  const resetForm = () => setForm(emptyPurchaseForm());

  const updateItemRow = (index: number, updates: Partial<PurchaseItemForm>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...updates } : item)),
    }));
  };

  const addItemRow = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { inventoryItemId: '', quantity: '1', unitCost: '0' }],
    }));
  };

  const removeItemRow = (index: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const estimatedTotal = React.useMemo(
    () =>
      form.items.reduce(
        (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0),
        0,
      ),
    [form.items],
  );

  const filteredOrders = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesQuery =
        !query ||
        [order.orderNumber, order.supplierName, order.notes || ''].some((value) =>
          value.toLowerCase().includes(query),
        ) ||
        order.items.some((item) =>
          [item.description, item.sku || ''].some((value) => value.toLowerCase().includes(query)),
        );
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  const handleCreate = async () => {
    if (!selectedCompany) return;
    if (!form.contactId || !form.orderDate) {
      toast({
        variant: 'destructive',
        title: 'Missing required fields',
        description: 'Supplier and order date are required.',
      });
      return;
    }
    const selectedContact = supplierMap.get(form.contactId);
    const supplierId = selectedContact?.supplierId || form.contactId;

    const preparedItems = form.items
      .map((item) => {
        const inventoryItem = inventoryMap.get(item.inventoryItemId);
        if (!inventoryItem) return null;
        const quantity = Number(item.quantity || 0);
        const unitCost = Number(item.unitCost || inventoryItem.unitCost || 0);

        return {
          inventoryItemId: inventoryItem.id,
          sku: inventoryItem.sku,
          description: inventoryItem.name,
          quantity,
          unitCost,
          lineTotal: quantity * unitCost,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (!preparedItems.length) {
      toast({
        variant: 'destructive',
        title: 'Line items required',
        description: 'Select at least one inventory item for this purchase order.',
      });
      return;
    }

    try {
      await createPurchaseOrder(selectedCompany.id, {
        supplierId,
        contactId: form.contactId,
        orderDate: new Date(form.orderDate),
        expectedDate: form.expectedDate ? new Date(form.expectedDate) : undefined,
        status: form.status,
        notes: form.notes || undefined,
        items: preparedItems,
      });
      setOpenCreate(false);
      resetForm();
      await load();
      toast({ title: 'Purchase order created' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Create failed',
        description: error?.message || 'Could not create purchase order.',
      });
    }
  };

  const handleStatusUpdate = async (orderId: string, status: PurchaseOrderStatus) => {
    try {
      await updatePurchaseOrderStatus(orderId, status);
      await load();
      toast({
        title: 'Purchase order updated',
        description: `Order moved to ${status}.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error?.message || 'Could not update purchase order status.',
      });
    }
  };

  const openReceiveDialog = (order: PurchaseOrder) => {
    const lineTotals = receiptTotalsByOrder.get(order.id) || new Map<number, number>();
    const quantities: Record<number, string> = {};
    order.items.forEach((item, lineIndex) => {
      const remaining = Number((item.quantity - (lineTotals.get(lineIndex) || 0)).toFixed(4));
      if (remaining > 0.0001) {
        quantities[lineIndex] = String(remaining);
      }
    });
    setReceiptState({
      open: true,
      order,
      notes: '',
      quantities,
    });
  };

  const handleReceive = async () => {
    const order = receiptState.order;
    if (!order) return;
    const receiptItems = Object.entries(receiptState.quantities)
      .map(([lineIndex, quantity]) => ({
        lineIndex: Number(lineIndex),
        quantity: Number(quantity || 0),
      }))
      .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0);

    if (!receiptItems.length) {
      toast({
        variant: 'destructive',
        title: 'Receipt quantities required',
        description: 'Enter at least one positive quantity to receive.',
      });
      return;
    }

    try {
      await receivePurchaseOrder(order.id, {
        notes: receiptState.notes || undefined,
        items: receiptItems,
      });
      setReceiptState({ open: false, notes: '', quantities: {} });
      await load();
      toast({ title: 'Receipt recorded' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Receipt failed',
        description: error?.message || 'Could not receive this purchase order.',
      });
    }
  };

  if (!selectedCompany) {
    return (
      <SectionPageShell
        title="Purchases"
        description="Manage procurement orders, receiving, and supplier-linked billable exposure."
      >
        <SectionEmptyState
          title="Choose a company to continue"
          description="Purchase orders are company-specific. Switch into a company first to create orders, receive stock, and track unbilled PO value."
        />
      </SectionPageShell>
    );
  }

  return (
    <SectionPageShell
      title="Purchases"
      description="Manage procurement orders and receive stock directly into inventory."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5" data-tutorial="purchases-metrics">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.openOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ordered Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{amount(stats.orderedSpend)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Awaiting Receipt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.awaitingReceiptUnits}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Received This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{stats.receivedThisMonth}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Unbilled PO Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{amount(stats.unbilledValue)}</div>
          </CardContent>
        </Card>
      </div>

      <SectionToolbar
        search={(
          <Input
            data-tutorial="purchases-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by order number, supplier, note, or item"
            className="max-w-md"
          />
        )}
        filters={(
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as 'all' | PurchaseOrderStatus)}
          >
            <SelectTrigger className="w-[180px]" data-tutorial="purchases-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Ordered">Ordered</SelectItem>
              <SelectItem value="Partially Received">Partially Received</SelectItem>
              <SelectItem value="Received">Received</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        )}
        summary={`Showing ${filteredOrders.length} of ${orders.length} orders`}
        actions={(
          <Dialog
          open={openCreate}
          onOpenChange={(open) => {
            setOpenCreate(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button disabled={!items.length} data-tutorial="purchases-create-btn">
              <ShoppingCart className="me-2 h-4 w-4" />
              New Purchase Order
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Create Purchase Order</DialogTitle>
              <DialogDescription>
                Build a purchase order from inventory items and receive stock when the shipment arrives.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Order Number</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                  Auto-generated when saved
                </div>
              </div>
                <div className="space-y-1">
                  <Label>Supplier</Label>
                  <Select
                    value={form.contactId}
                    onValueChange={(value) => {
                      setForm((prev) => ({
                        ...prev,
                        contactId: value,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((c: Contact) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              <div className="space-y-1">
                <Label>Order Date</Label>
                <Input
                  type="date"
                  value={form.orderDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, orderDate: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Expected Date</Label>
                <Input
                  type="date"
                  value={form.expectedDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, expectedDate: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Initial Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, status: value as PurchaseOrderStatus }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Ordered">Ordered</SelectItem>
                    <SelectItem value="Received">Received</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Estimated Total</Label>
                <div className="flex h-10 items-center rounded-md border px-3 text-sm">
                  {amount(estimatedTotal)}
                </div>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Optional purchasing notes"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItemRow}>
                  Add Line
                </Button>
              </div>
              {form.items.map((item, index) => (
                <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                  <div className="space-y-1">
                    <Label>Inventory Item</Label>
                    <Select
                      value={item.inventoryItemId}
                      onValueChange={(value) => {
                        const selectedItem = inventoryMap.get(value);
                        updateItemRow(index, {
                          inventoryItemId: value,
                          unitCost: String(selectedItem?.unitCost ?? 0),
                        });
                        if (!form.contactId && selectedItem?.preferredSupplierId) {
                          const preferredContact = supplierMap.get(selectedItem.preferredSupplierId);
                          if (preferredContact) {
                            setForm((prev) => ({ ...prev, contactId: preferredContact.id }));
                          }
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select item" />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((inventoryItem) => (
                          <SelectItem key={inventoryItem.id} value={inventoryItem.id}>
                            {inventoryItem.sku}-{inventoryItem.name}-{inventoryItem.barcode || 'No Barcode'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(event) => updateItemRow(index, { quantity: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Unit Cost</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.unitCost}
                      onChange={(event) => updateItemRow(index, { unitCost: event.target.value })}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="min-w-20 text-sm text-muted-foreground">
                      {amount(Number(item.quantity || 0) * Number(item.unitCost || 0))}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItemRow(index)}
                      disabled={form.items.length === 1}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCreate(false)}>
                Cancel
              </Button>
            <Button onClick={handleCreate}>Create Order</Button>
          </DialogFooter>
        </DialogContent>
          </Dialog>
        )}
      />

      <Dialog
        open={receiptState.open}
        onOpenChange={(open) =>
          setReceiptState((prev) => (open ? prev : { open: false, notes: '', quantities: {} }))
        }
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receive Purchase Order</DialogTitle>
            <DialogDescription>
              Record a full or partial receipt. Only remaining quantities are shown.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {receiptState.order?.items.map((item, lineIndex) => {
              const progress =
                receiptTotalsByOrder.get(receiptState.order?.id || '') || new Map<number, number>();
              const received = progress.get(lineIndex) || 0;
              const remaining = Number((item.quantity - received).toFixed(4));
              if (remaining <= 0.0001) return null;
              return (
                <div
                  key={lineIndex}
                  className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[2fr_1fr_1fr]"
                >
                  <div>
                    <div className="font-medium">{item.description}</div>
                    <div className="text-xs text-muted-foreground">
                      Ordered {item.quantity} • Received {received} • Remaining {remaining}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Receive Qty</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={receiptState.quantities[lineIndex] ?? ''}
                      onChange={(event) =>
                        setReceiptState((prev) => ({
                          ...prev,
                          quantities: {
                            ...prev.quantities,
                            [lineIndex]: event.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Unit Cost</Label>
                    <div className="flex h-10 items-center rounded-md border px-3 text-sm">
                      {amount(item.unitCost)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={receiptState.notes}
                onChange={(event) =>
                  setReceiptState((prev) => ({ ...prev, notes: event.target.value }))
                }
                placeholder="Packing slip, partial shipment, damaged carton..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReceiptState({ open: false, notes: '', quantities: {} })}
            >
              Cancel
            </Button>
            <Button onClick={handleReceive}>
              <PackageCheck className="me-2 h-4 w-4" />
              Record Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!items.length && !loading && (
        <SectionEmptyState
          title="Inventory items are required first"
          description="Purchase orders are linked to tracked stock items so receipts can update inventory automatically. Create inventory items before opening new POs."
        />
      )}

      <div className="overflow-x-auto rounded-lg border" data-tutorial="purchases-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-end">Total</TableHead>
              <TableHead>Payables</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-end">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-36" /></TableCell>
                  <TableCell><Skeleton className="ms-auto h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="ms-auto h-9 w-24" /></TableCell>
                </TableRow>
              ))}
            {!loading &&
              filteredOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.orderNumber}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div>{order.supplierName}</div>
                      {order.supplierId && (
                        <div className="text-xs text-muted-foreground">
                          Linked supplier record
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{format(order.orderDate, 'MMM d, yyyy')}</div>
                    <div className="text-xs text-muted-foreground">
                      {order.expectedDate
                        ? `Expected ${format(order.expectedDate, 'MMM d, yyyy')}`
                        : 'No ETA'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {order.items.map((item, index) => (
                        <div key={index} className="text-sm">
                          {item.description} x {item.quantity}
                        </div>
                      ))}
                      <div className="text-xs text-muted-foreground">
                        Received {orderReceiptProgress.get(order.id)?.receivedUnits || 0} /{' '}
                        {orderReceiptProgress.get(order.id)?.totalUnits || 0}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-end">{amount(order.totalAmount)}</TableCell>
                  <TableCell>
                    <div className="space-y-1 text-sm">
                      <div>Billed {amount(payableMap.get(order.id)?.billedAmount || 0)}</div>
                      <div className="text-muted-foreground">
                        Remaining {amount(payableMap.get(order.id)?.remainingToBill || order.totalAmount)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusStyles[order.status]}>
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedOrderForDocs(order)}
                    >
                      Docs
                    </Button>
                    {order.status === 'Draft' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusUpdate(order.id, 'Ordered')}
                      >
                        Place Order
                      </Button>
                    )}
                    {(order.status === 'Ordered' || order.status === 'Partially Received') && (
                      <Button size="sm" onClick={() => openReceiveDialog(order)}>
                        <PackageCheck className="me-2 h-4 w-4" />
                        Receive
                      </Button>
                    )}
                    {order.status !== 'Draft' &&
                      order.status !== 'Ordered' &&
                      order.status !== 'Partially Received' && (
                      <span className="text-sm text-muted-foreground">
                        {order.receivedAt
                          ? `Received ${format(order.receivedAt, 'MMM d')}`
                          : 'No action'}
                      </span>
                    )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            {!loading && filteredOrders.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  {orders.length === 0
                    ? 'No purchase orders yet. Create one to link procurement with inventory receipts.'
                    : 'No purchase orders match the current search or filter.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Receipt History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.slice(0, 8).map((receipt) => {
                  const order = orders.find((entry) => entry.id === receipt.purchaseOrderId);
                  return (
                    <TableRow key={receipt.id}>
                      <TableCell>{format(receipt.receivedAt, 'MMM d, yyyy')}</TableCell>
                      <TableCell>{order?.orderNumber || receipt.purchaseOrderId}</TableCell>
                      <TableCell>{order?.supplierName || '—'}</TableCell>
                      <TableCell>
                        {receipt.items
                          .map((item) => `${item.description} x ${item.quantity}`)
                          .join(', ')}
                      </TableCell>
                      <TableCell>{receipt.notes || '—'}</TableCell>
                    </TableRow>
                  );
                })}
                {receipts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No receipts have been recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedOrderForDocs} onOpenChange={(open) => !open && setSelectedOrderForDocs(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedOrderForDocs?.orderNumber}</DialogTitle>
            <DialogDescription>Purchase order documents and audit timeline.</DialogDescription>
          </DialogHeader>
          {selectedOrderForDocs && selectedCompany && (
            <RecordSupportPanel
              companyId={selectedCompany.id}
              entityType="purchase_order"
              entityId={selectedOrderForDocs.id}
              title="Purchase Order Attachments & Timeline"
            />
          )}
        </DialogContent>
      </Dialog>
    </SectionPageShell>
  );
}
