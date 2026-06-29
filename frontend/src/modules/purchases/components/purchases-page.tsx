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
import { Combobox } from '@/components/ui/combobox';
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
  approvePurchaseOrder,
  createPurchaseOrder,
  getInventoryItems,
  getPurchaseOrders,
  getPurchaseReceipts,
  receivePurchaseOrder,
  rejectPurchaseOrder,
  updatePurchaseOrderStatus,
  deletePurchaseOrder,
} from '@/services/operationsService';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { getContacts, type Contact } from '@/services/contactService';
import type {
  InventoryItem,
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseReceipt,
} from '@/modules/operations/types';
import { PackageCheck, ShoppingCart, Trash2 } from 'lucide-react';
import { RecordSupportPanel } from '@/modules/shared/components/record-support-panel';
import { useI18n } from '@/context/i18n-context';

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
  /** Optional batch capture per line — records an InventoryLot on receipt. */
  lots: Record<number, { lotNumber: string; expiryDate: string }>;
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
  const { selectedCompany, currentRole } = useCompany();
  const canApprove = currentRole === 'Admin' || currentRole === 'Manager';
  const { toast } = useToast();
  const confirm = useConfirm();
  const { money, amount } = useCompanyCurrency();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
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
    lots: {},
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
        title: tr('Purchases unavailable', 'المشتريات غير متاحة'),
        description: error?.message || tr('Could not load purchase orders.', 'تعذّر تحميل أوامر الشراء.'),
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

  const statusLabel = (status: PurchaseOrderStatus) =>
    tr(status, ({
      'Draft': 'مسودة',
      'Ordered': 'تم الطلب',
      'Partially Received': 'مستلَم جزئيًا',
      'Received': 'مستلَم',
      'Cancelled': 'ملغى',
    } as Record<PurchaseOrderStatus, string>)[status]);

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
        title: tr('Missing required fields', 'حقول مطلوبة ناقصة'),
        description: tr('Supplier and order date are required.', 'المورّد وتاريخ الطلب مطلوبان.'),
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
        title: tr('Line items required', 'بنود مطلوبة'),
        description: tr('Select at least one inventory item for this purchase order.', 'اختر صنف مخزون واحدًا على الأقل لأمر الشراء هذا.'),
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
      toast({ title: tr('Purchase order created', 'تم إنشاء أمر الشراء') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Create failed', 'فشل الإنشاء'),
        description: error?.message || tr('Could not create purchase order.', 'تعذّر إنشاء أمر الشراء.'),
      });
    }
  };

  const handleStatusUpdate = async (orderId: string, status: PurchaseOrderStatus) => {
    try {
      await updatePurchaseOrderStatus(orderId, status);
      await load();
      toast({
        title: tr('Purchase order updated', 'تم تحديث أمر الشراء'),
        description: tr(`Order moved to ${status}.`, `تم نقل الطلب إلى ${statusLabel(status)}.`),
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Update failed', 'فشل التحديث'),
        description: error?.message || tr('Could not update purchase order status.', 'تعذّر تحديث حالة أمر الشراء.'),
      });
    }
  };

  const handleApprove = async (orderId: string) => {
    try {
      await approvePurchaseOrder(orderId);
      await load();
      toast({ title: tr('Purchase order approved', 'تمت الموافقة على أمر الشراء') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Approval failed', 'فشلت الموافقة'),
        description: error?.message || tr('Could not approve purchase order.', 'تعذّرت الموافقة على أمر الشراء.'),
      });
    }
  };

  const handleReject = async (orderId: string) => {
    const reason = window.prompt(tr('Reason for rejecting this purchase order (optional):', 'سبب رفض أمر الشراء هذا (اختياري):')) ?? undefined;
    try {
      await rejectPurchaseOrder(orderId, reason);
      await load();
      toast({ title: tr('Purchase order rejected', 'تم رفض أمر الشراء') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Rejection failed', 'فشل الرفض'),
        description: error?.message || tr('Could not reject purchase order.', 'تعذّر رفض أمر الشراء.'),
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
      lots: {},
    });
  };

  const handleReceive = async () => {
    const order = receiptState.order;
    if (!order) return;
    const receiptItems = Object.entries(receiptState.quantities)
      .map(([lineIndex, quantity]) => {
        const idx = Number(lineIndex);
        const lot = receiptState.lots[idx];
        return {
          lineIndex: idx,
          quantity: Number(quantity || 0),
          lotNumber: lot?.lotNumber?.trim() || undefined,
          expiryDate: lot?.expiryDate || undefined,
        };
      })
      .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0);

    if (!receiptItems.length) {
      toast({
        variant: 'destructive',
        title: tr('Receipt quantities required', 'كميات الاستلام مطلوبة'),
        description: tr('Enter at least one positive quantity to receive.', 'أدخل كمية موجبة واحدة على الأقل للاستلام.'),
      });
      return;
    }

    try {
      await receivePurchaseOrder(order.id, {
        notes: receiptState.notes || undefined,
        items: receiptItems,
      });
      setReceiptState({ open: false, notes: '', quantities: {}, lots: {} });
      await load();
      toast({ title: tr('Receipt recorded', 'تم تسجيل الاستلام') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Receipt failed', 'فشل الاستلام'),
        description: error?.message || tr('Could not receive this purchase order.', 'تعذّر استلام أمر الشراء هذا.'),
      });
    }
  };

  if (!selectedCompany) {
    return (
      <SectionPageShell
        title={tr('Purchases', 'المشتريات')}
        description={tr('Manage procurement orders, receiving, and supplier-linked billable exposure.', 'إدارة أوامر التوريد والاستلام والمبالغ القابلة للفوترة المرتبطة بالموردين.')}
      >
        <SectionEmptyState
          title={tr('Choose a company to continue', 'اختر شركة للمتابعة')}
          description={tr('Purchase orders are company-specific. Switch into a company first to create orders, receive stock, and track unbilled PO value.', 'أوامر الشراء خاصة بكل شركة. انتقل إلى شركة أولًا لإنشاء الأوامر واستلام المخزون وتتبّع قيمة أوامر الشراء غير المفوترة.')}
        />
      </SectionPageShell>
    );
  }

  return (
    <SectionPageShell
      title={tr('Purchases', 'المشتريات')}
      description={tr('Manage procurement orders and receive stock directly into inventory.', 'إدارة أوامر التوريد واستلام المخزون مباشرةً في المستودع.')}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5" data-tutorial="purchases-metrics">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{tr('Open Orders', 'الأوامر المفتوحة')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.openOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{tr('Ordered Spend', 'قيمة الطلبات')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{amount(stats.orderedSpend)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{tr('Awaiting Receipt', 'بانتظار الاستلام')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.awaitingReceiptUnits}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{tr('Received This Month', 'المستلَم هذا الشهر')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{stats.receivedThisMonth}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{tr('Unbilled PO Value', 'قيمة أوامر الشراء غير المفوترة')}</CardTitle>
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
            placeholder={tr('Search by order number, supplier, note, or item', 'البحث برقم الأمر أو المورّد أو الملاحظة أو الصنف')}
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
              <SelectItem value="all">{tr('All statuses', 'جميع الحالات')}</SelectItem>
              <SelectItem value="Draft">{tr('Draft', 'مسودة')}</SelectItem>
              <SelectItem value="Ordered">{tr('Ordered', 'تم الطلب')}</SelectItem>
              <SelectItem value="Partially Received">{tr('Partially Received', 'مستلَم جزئيًا')}</SelectItem>
              <SelectItem value="Received">{tr('Received', 'مستلَم')}</SelectItem>
              <SelectItem value="Cancelled">{tr('Cancelled', 'ملغى')}</SelectItem>
            </SelectContent>
          </Select>
        )}
        summary={tr(`Showing ${filteredOrders.length} of ${orders.length} orders`, `عرض ${filteredOrders.length} من ${orders.length} أمرًا`)}
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
              {tr('New Purchase Order', 'أمر شراء جديد')}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{tr('Create Purchase Order', 'إنشاء أمر شراء')}</DialogTitle>
              <DialogDescription>
                {tr('Build a purchase order from inventory items and receive stock when the shipment arrives.', 'أنشئ أمر شراء من أصناف المخزون واستلم البضاعة عند وصول الشحنة.')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{tr('Order Number', 'رقم الأمر')}</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                  {tr('Auto-generated when saved', 'يُنشأ تلقائيًا عند الحفظ')}
                </div>
              </div>
                <div className="space-y-1">
                  <Label>{tr('Supplier', 'المورّد')}</Label>
                  <Combobox
                    options={suppliers.map((c: Contact) => ({ value: c.id, label: c.name }))}
                    value={form.contactId}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, contactId: value }))}
                    placeholder={tr('Select supplier', 'اختر المورّد')}
                    searchPlaceholder={tr('Select supplier', 'اختر المورّد')}
                  />
                </div>
              <div className="space-y-1">
                <Label>{tr('Order Date', 'تاريخ الطلب')}</Label>
                <Input
                  type="date"
                  value={form.orderDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, orderDate: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{tr('Expected Date', 'التاريخ المتوقع')}</Label>
                <Input
                  type="date"
                  value={form.expectedDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, expectedDate: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{tr('Initial Status', 'الحالة الأولية')}</Label>
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
                    <SelectItem value="Draft">{tr('Draft', 'مسودة')}</SelectItem>
                    <SelectItem value="Ordered">{tr('Ordered', 'تم الطلب')}</SelectItem>
                    <SelectItem value="Received">{tr('Received', 'مستلَم')}</SelectItem>
                    <SelectItem value="Cancelled">{tr('Cancelled', 'ملغى')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{tr('Estimated Total', 'الإجمالي التقديري')}</Label>
                <div className="flex h-10 items-center rounded-md border px-3 text-sm">
                  {amount(estimatedTotal)}
                </div>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>{tr('Notes', 'ملاحظات')}</Label>
                <Textarea
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder={tr('Optional purchasing notes', 'ملاحظات شراء اختيارية')}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{tr('Line Items', 'البنود')}</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItemRow}>
                  {tr('Add Line', 'إضافة بند')}
                </Button>
              </div>
              {form.items.map((item, index) => (
                <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                  <div className="space-y-1">
                    <Label>{tr('Inventory Item', 'صنف المخزون')}</Label>
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
                        <SelectValue placeholder={tr('Select item', 'اختر صنفًا')} />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((inventoryItem) => (
                          <SelectItem key={inventoryItem.id} value={inventoryItem.id}>
                            {inventoryItem.sku}-{inventoryItem.name}-{inventoryItem.barcode || tr('No Barcode', 'بدون باركود')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>{tr('Quantity', 'الكمية')}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(event) => updateItemRow(index, { quantity: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tr('Unit Cost', 'تكلفة الوحدة')}</Label>
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
                      {tr('Remove', 'إزالة')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCreate(false)}>
                {tr('Cancel', 'إلغاء')}
              </Button>
            <Button onClick={handleCreate}>{tr('Create Order', 'إنشاء الأمر')}</Button>
          </DialogFooter>
        </DialogContent>
          </Dialog>
        )}
      />

      <Dialog
        open={receiptState.open}
        onOpenChange={(open) =>
          setReceiptState((prev) => (open ? prev : { open: false, notes: '', quantities: {}, lots: {} }))
        }
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tr('Receive Purchase Order', 'استلام أمر الشراء')}</DialogTitle>
            <DialogDescription>
              {tr('Record a full or partial receipt. Only remaining quantities are shown. Add a lot number and expiry date to track the batch for FEFO and expiry alerts.', 'سجّل استلامًا كاملًا أو جزئيًا. تُعرض الكميات المتبقية فقط. أضف رقم الدفعة وتاريخ الانتهاء لتتبّع الدفعة وفق نظام FEFO وتنبيهات الانتهاء.')}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-3 overflow-y-auto py-2">
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
                      {tr('Ordered', 'مطلوب')} {item.quantity} • {tr('Received', 'مستلَم')} {received} • {tr('Remaining', 'متبقٍ')} {remaining}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>{tr('Receive Qty', 'كمية الاستلام')}</Label>
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
                    <Label>{tr('Unit Cost', 'تكلفة الوحدة')}</Label>
                    <div className="flex h-10 items-center rounded-md border px-3 text-sm">
                      {amount(item.unitCost)}
                    </div>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>{tr('Lot / Batch No. (optional)', 'رقم الدفعة (اختياري)')}</Label>
                    <Input
                      placeholder={tr('Leave blank to skip batch tracking', 'اتركه فارغًا لتجاوز تتبّع الدفعات')}
                      value={receiptState.lots[lineIndex]?.lotNumber ?? ''}
                      onChange={(event) =>
                        setReceiptState((prev) => ({
                          ...prev,
                          lots: {
                            ...prev.lots,
                            [lineIndex]: {
                              lotNumber: event.target.value,
                              expiryDate: prev.lots[lineIndex]?.expiryDate ?? '',
                            },
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tr('Expiry Date', 'تاريخ الانتهاء')}</Label>
                    <Input
                      type="date"
                      value={receiptState.lots[lineIndex]?.expiryDate ?? ''}
                      onChange={(event) =>
                        setReceiptState((prev) => ({
                          ...prev,
                          lots: {
                            ...prev.lots,
                            [lineIndex]: {
                              lotNumber: prev.lots[lineIndex]?.lotNumber ?? '',
                              expiryDate: event.target.value,
                            },
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              );
            })}
            <div className="space-y-1">
              <Label>{tr('Notes', 'ملاحظات')}</Label>
              <Textarea
                value={receiptState.notes}
                onChange={(event) =>
                  setReceiptState((prev) => ({ ...prev, notes: event.target.value }))
                }
                placeholder={tr('Packing slip, partial shipment, damaged carton...', 'إشعار التعبئة، شحنة جزئية، صندوق تالف...')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReceiptState({ open: false, notes: '', quantities: {}, lots: {} })}
            >
              {tr('Cancel', 'إلغاء')}
            </Button>
            <Button onClick={handleReceive}>
              <PackageCheck className="me-2 h-4 w-4" />
              {tr('Record Receipt', 'تسجيل الاستلام')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!items.length && !loading && (
        <SectionEmptyState
          title={tr('Inventory items are required first', 'يجب توفّر أصناف المخزون أولًا')}
          description={tr('Purchase orders are linked to tracked stock items so receipts can update inventory automatically. Create inventory items before opening new POs.', 'ترتبط أوامر الشراء بأصناف المخزون المتتبَّعة حتى يحدّث الاستلام المخزون تلقائيًا. أنشئ أصناف المخزون قبل فتح أوامر شراء جديدة.')}
        />
      )}

      <div className="overflow-x-auto rounded-lg border" data-tutorial="purchases-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('Order #', 'رقم الأمر')}</TableHead>
              <TableHead>{tr('Supplier', 'المورّد')}</TableHead>
              <TableHead>{tr('Dates', 'التواريخ')}</TableHead>
              <TableHead>{tr('Items', 'الأصناف')}</TableHead>
              <TableHead className="text-end">{tr('Total', 'الإجمالي')}</TableHead>
              <TableHead>{tr('Payables', 'الذمم الدائنة')}</TableHead>
              <TableHead>{tr('Status', 'الحالة')}</TableHead>
              <TableHead className="text-end">{tr('Action', 'الإجراء')}</TableHead>
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
                          {tr('Linked supplier record', 'سجل مورّد مرتبط')}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{format(order.orderDate, 'MMM d, yyyy')}</div>
                    <div className="text-xs text-muted-foreground">
                      {order.expectedDate
                        ? `${tr('Expected', 'متوقع')} ${format(order.expectedDate, 'MMM d, yyyy')}`
                        : tr('No ETA', 'لا يوجد موعد متوقع')}
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
                        {tr('Received', 'مستلَم')} {orderReceiptProgress.get(order.id)?.receivedUnits || 0} /{' '}
                        {orderReceiptProgress.get(order.id)?.totalUnits || 0}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-end">{amount(order.totalAmount)}</TableCell>
                  <TableCell>
                    <div className="space-y-1 text-sm">
                      <div>{tr('Billed', 'مفوتر')} {amount(payableMap.get(order.id)?.billedAmount || 0)}</div>
                      <div className="text-muted-foreground">
                        {tr('Remaining', 'متبقٍ')} {amount(payableMap.get(order.id)?.remainingToBill || order.totalAmount)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant="outline" className={statusStyles[order.status]}>
                        {tr(order.status, ({
                          'Draft': 'مسودة',
                          'Ordered': 'تم الطلب',
                          'Partially Received': 'مستلَم جزئيًا',
                          'Received': 'مستلَم',
                          'Cancelled': 'ملغى',
                        } as Record<PurchaseOrderStatus, string>)[order.status])}
                      </Badge>
                      {order.approvalStatus === 'pending' && (
                        <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
                          {tr('Awaiting approval', 'بانتظار الموافقة')}
                        </Badge>
                      )}
                      {order.approvalStatus === 'approved' && (
                        <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">
                          {tr('Approved', 'تمت الموافقة')}{order.approvedBy ? ` · ${order.approvedBy}` : ''}
                        </Badge>
                      )}
                      {order.approvalStatus === 'rejected' && (
                        <Badge
                          variant="outline"
                          className="bg-rose-100 text-rose-800 border-rose-200"
                          title={order.rejectionReason || undefined}
                        >
                          {tr('Rejected', 'مرفوض')}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedOrderForDocs(order)}
                    >
                      {tr('Docs', 'المستندات')}
                    </Button>
                    {order.approvalStatus === 'pending' && canApprove && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          onClick={() => handleApprove(order.id)}
                        >
                          {tr('Approve', 'موافقة')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-rose-200 text-rose-700 hover:bg-rose-50"
                          onClick={() => handleReject(order.id)}
                        >
                          {tr('Reject', 'رفض')}
                        </Button>
                      </>
                    )}
                    {order.status === 'Draft' && order.approvalStatus !== 'pending' && order.approvalStatus !== 'rejected' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusUpdate(order.id, 'Ordered')}
                      >
                        {tr('Place Order', 'تأكيد الطلب')}
                      </Button>
                    )}
                    {(order.status === 'Ordered' || order.status === 'Partially Received') && (
                      <Button size="sm" onClick={() => openReceiveDialog(order)}>
                        <PackageCheck className="me-2 h-4 w-4" />
                        {tr('Receive', 'استلام')}
                      </Button>
                    )}
                    {order.status !== 'Draft' &&
                      order.status !== 'Ordered' &&
                      order.status !== 'Partially Received' && (
                      <span className="text-sm text-muted-foreground">
                        {order.receivedAt
                          ? `${tr('Received', 'استُلم')} ${format(order.receivedAt, 'MMM d')}`
                          : tr('No action', 'لا يوجد إجراء')}
                      </span>
                    )}
                    {canApprove && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={async () => {
                          if (!(await confirm({
                            title: tr('Delete purchase order?', 'حذف أمر الشراء؟'),
                            description: tr(`Delete order ${order.orderNumber}? This cannot be undone.`, `هل تريد حذف الأمر ${order.orderNumber}؟ لا يمكن التراجع عن هذا الإجراء.`),
                            confirmText: tr('Delete', 'حذف'),
                            cancelText: tr('Cancel', 'إلغاء'),
                            destructive: true,
                          }))) return;
                          try {
                            await deletePurchaseOrder(order.id);
                            await load();
                            toast({ title: tr('Purchase order deleted', 'تم حذف أمر الشراء') });
                          } catch (error: any) {
                            toast({ variant: 'destructive', title: tr('Could not delete purchase order', 'تعذّر حذف أمر الشراء'), description: error?.message });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            {!loading && filteredOrders.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  {orders.length === 0
                    ? tr('No purchase orders yet. Create one to link procurement with inventory receipts.', 'لا توجد أوامر شراء بعد. أنشئ أمرًا لربط التوريد باستلامات المخزون.')
                    : tr('No purchase orders match the current search or filter.', 'لا توجد أوامر شراء مطابقة للبحث أو عامل التصفية الحالي.')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tr('Recent Receipt History', 'سجل الاستلامات الأخيرة')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr('Date', 'التاريخ')}</TableHead>
                  <TableHead>{tr('Order', 'الأمر')}</TableHead>
                  <TableHead>{tr('Supplier', 'المورّد')}</TableHead>
                  <TableHead>{tr('Items', 'الأصناف')}</TableHead>
                  <TableHead>{tr('Notes', 'ملاحظات')}</TableHead>
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
                      {tr('No receipts have been recorded yet.', 'لم يتم تسجيل أي استلامات بعد.')}
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
            <DialogDescription>{tr('Purchase order documents and audit timeline.', 'مستندات أمر الشراء والمخطط الزمني للتدقيق.')}</DialogDescription>
          </DialogHeader>
          {selectedOrderForDocs && selectedCompany && (
            <RecordSupportPanel
              companyId={selectedCompany.id}
              entityType="purchase_order"
              entityId={selectedOrderForDocs.id}
              title={tr('Purchase Order Attachments & Timeline', 'مرفقات أمر الشراء والمخطط الزمني')}
            />
          )}
        </DialogContent>
      </Dialog>
    </SectionPageShell>
  );
}
