'use client';

import * as React from 'react';
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
import { CreatableCombobox } from '@/components/ui/creatable-combobox';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { getCurrentLocale } from '@/lib/locale';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { SectionToolbar } from '@/modules/operations/components/section-toolbar';
import { CustomFieldsForm } from '@/components/ui/custom-fields-form';
import { getCustomFieldDefinitions, type CustomFieldDefinition } from '@/services/customFieldService';
import {
  adjustInventoryItem,
  createInventoryItem,
  deleteInventoryItem,
  getExpiringLots,
  getInventoryItems,
  getInventoryLocationBalances,
  getPurchaseOrders,
  getStockMovements,
  getSuppliers,
  getWarehouses,
  issueInventoryItem,
  transferInventoryItem,
} from '@/services/operationsService';
import { getProjects } from '@/services/projectService';
import type { InventoryItem, InventoryLocationBalance, InventoryLot, PurchaseOrder, StockMovement, Supplier, Warehouse } from '@/modules/operations/types';
import { WarehousesPanel } from './warehouses-panel';
import { InventoryLotsDialog } from './inventory-lots-dialog';
import { ExpiringLotsPanel } from './expiring-lots-panel';
import { CsvImportExport } from '@/components/ui/csv-import-export';
import type { Project } from '@/modules/projects/types';
import { ArrowRightLeft, Layers, PackageMinus, PackagePlus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { RecordSupportPanel } from '@/modules/shared/components/record-support-panel';

type InventoryFormState = {
  name: string;
  barcode: string;
  category: string;
  unit: string;
  vatApplicable: 'yes' | 'no';
  tracksInventory: 'tracked' | 'non-tracked';
  onHand: string;
  reorderPoint: string;
  unitCost: string;
  salePrice: string;
  preferredSupplierId: string;
  location: string;
};

type AdjustmentState = {
  open: boolean;
  item?: InventoryItem;
  quantityChange: string;
  location: string;
  note: string;
};

type IssueState = {
  open: boolean;
  item?: InventoryItem;
  quantity: string;
  location: string;
  projectId: string;
  issuedTo: string;
  note: string;
};

type TransferState = {
  open: boolean;
  item?: InventoryItem;
  quantity: string;
  fromLocation: string;
  toLocation: string;
  note: string;
};

const emptyForm = (): InventoryFormState => ({
  name: '',
  barcode: '',
  category: '',
  unit: 'pcs',
  vatApplicable: 'yes',
  tracksInventory: 'tracked',
  onHand: '0',
  reorderPoint: '0',
  unitCost: '0',
  salePrice: '',
  preferredSupplierId: '',
  location: '',
});

const inventoryUnitOptions = ['pcs', 'box', 'pack', 'set', 'kg', 'g', 'ltr', 'ml'] as const;

export function InventoryPage() {
  const { selectedCompany, currentRole } = useCompany();
  const confirm = useConfirm();
  const canManageInventory = currentRole !== 'Employee';
  const { money, amount } = useCompanyCurrency();
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = React.useCallback(
    (en: string, ar: string) => (language === 'ar' ? ar : en),
    [language],
  );
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [orders, setOrders] = React.useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [movements, setMovements] = React.useState<StockMovement[]>([]);
  const [balances, setBalances] = React.useState<InventoryLocationBalance[]>([]);
  const [warehouses, setWarehouses] = React.useState<Warehouse[]>([]);
  const [expiringLots, setExpiringLots] = React.useState<InventoryLot[]>([]);
  const [lotsItem, setLotsItem] = React.useState<InventoryItem | null>(null);

  const categoryOptions = React.useMemo(
    () => Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[],
    [items],
  );
  // Stock locations are registered, active warehouses (enforced server-side).
  const locationOptions = React.useMemo(
    () => warehouses.filter((w) => w.isActive).map((w) => w.name),
    [warehouses],
  );
  const defaultWarehouseName = React.useMemo(() => {
    const active = warehouses.filter((w) => w.isActive);
    return (active.find((w) => w.isDefault) ?? active[0])?.name ?? '';
  }, [warehouses]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [openCreate, setOpenCreate] = React.useState(false);
  const [selectedItemForDocs, setSelectedItemForDocs] = React.useState<InventoryItem | null>(null);
  const [form, setForm] = React.useState<InventoryFormState>(emptyForm);
  const [customFieldDefs, setCustomFieldDefs] = React.useState<CustomFieldDefinition[]>([]);
  const [createCustomValues, setCreateCustomValues] = React.useState<Record<string, unknown>>({});
  const [search, setSearch] = React.useState('');
  const [stockFilter, setStockFilter] = React.useState<'all' | 'attention' | 'healthy'>('all');
  const [adjustment, setAdjustment] = React.useState<AdjustmentState>({
    open: false,
    quantityChange: '',
    location: '',
    note: '',
  });
  const [issue, setIssue] = React.useState<IssueState>({
    open: false,
    quantity: '',
    location: '',
    projectId: '',
    issuedTo: '',
    note: '',
  });
  const [transfer, setTransfer] = React.useState<TransferState>({
    open: false,
    quantity: '',
    fromLocation: '',
    toLocation: '',
    note: '',
  });

  const load = React.useCallback(async () => {
    if (!selectedCompany) {
      setItems([]);
      setOrders([]);
      setSuppliers([]);
      setMovements([]);
      setBalances([]);
      setExpiringLots([]);
      setProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [itemData, orderData, supplierData, movementData, balanceData, warehouseData, expiringData, projectData] = await Promise.all([
        getInventoryItems(selectedCompany.id),
        getPurchaseOrders(selectedCompany.id),
        getSuppliers(selectedCompany.id),
        getStockMovements(selectedCompany.id),
        getInventoryLocationBalances(selectedCompany.id),
        getWarehouses(selectedCompany.id),
        getExpiringLots(selectedCompany.id, 30),
        getProjects(),
      ]);
      setItems(itemData);
      setOrders(orderData);
      setSuppliers(supplierData);
      setMovements(movementData);
      setBalances(balanceData);
      setWarehouses(warehouseData);
      setExpiringLots(expiringData);
      setProjects(projectData.filter((project) => project.companyId === selectedCompany.id));
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Inventory unavailable', 'المخزون غير متاح'),
        description: error?.message || tr('Could not load inventory items.', 'تعذر تحميل عناصر المخزون.'),
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!selectedCompany) { setCustomFieldDefs([]); return; }
    let cancelled = false;
    getCustomFieldDefinitions(selectedCompany.id, 'inventory_item')
      .then((defs) => { if (!cancelled) setCustomFieldDefs(defs); })
      .catch(() => { if (!cancelled) setCustomFieldDefs([]); });
    return () => { cancelled = true; };
  }, [selectedCompany]);

  const reloadWarehouses = React.useCallback(async () => {
    if (!selectedCompany) return;
    setWarehouses(await getWarehouses(selectedCompany.id));
  }, [selectedCompany]);

  const incomingMap = React.useMemo(() => {
    const map = new Map<string, number>();
    orders
      .filter((order) => order.status === 'Ordered')
      .forEach((order) => {
        order.items.forEach((item) => {
          const key = item.inventoryItemId || item.sku;
          if (!key) return;
          map.set(key, (map.get(key) || 0) + item.quantity);
        });
      });
    return map;
  }, [orders]);

  const supplierNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    suppliers.forEach((supplier) => map.set(supplier.id, supplier.name));
    return map;
  }, [suppliers]);

  const balancesByItem = React.useMemo(() => {
    const map = new Map<string, InventoryLocationBalance[]>();
    balances.forEach((balance) => {
      const entries = map.get(balance.inventoryItemId) || [];
      entries.push(balance);
      map.set(balance.inventoryItemId, entries);
    });
    map.forEach((entries) =>
      entries.sort((left, right) => right.quantity - left.quantity || left.location.localeCompare(right.location)),
    );
    return map;
  }, [balances]);

  const stats = React.useMemo(() => {
    const lowStock = items.filter((item) => item.onHand > 0 && item.onHand <= item.reorderPoint).length;
    const outOfStock = items.filter((item) => item.onHand <= 0).length;
    const incomingUnits = orders
      .filter((order) => order.status === 'Ordered')
      .reduce(
        (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
        0,
      );
    const inventoryValue = items.reduce((sum, item) => sum + item.onHand * item.unitCost, 0);

    return {
      totalItems: items.length,
      lowStock,
      outOfStock,
      incomingUnits,
      inventoryValue,
      trackedLocations: new Set(balances.map((entry) => entry.location)).size,
    };
  }, [balances, items, orders]);

  const filteredItems = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const locationLabel = (balancesByItem.get(item.id) || [])
        .map((entry) => entry.location)
        .join(' ');
      const matchesQuery =
        !query ||
        [
          item.sku,
          item.barcode || '',
          item.name,
          item.category,
          item.preferredVendor || '',
          item.location || '',
          locationLabel,
        ].some(
          (value) => value.toLowerCase().includes(query),
        );
      const needsAttention = item.onHand <= item.reorderPoint;
      const matchesFilter =
        stockFilter === 'all' ||
        (stockFilter === 'attention' && needsAttention) ||
        (stockFilter === 'healthy' && !needsAttention);

      return matchesQuery && matchesFilter;
    });
  }, [balancesByItem, items, search, stockFilter]);

  const resetForm = () => setForm(emptyForm());

  const handleCreate = async () => {
    if (!selectedCompany) return;
    if (!form.name || !form.category || !form.unit) {
      toast({
        variant: 'destructive',
        title: tr('Missing required fields', 'حقول مطلوبة مفقودة'),
        description: tr('Name, category, and unit are required.', 'الاسم والفئة والوحدة مطلوبة.'),
      });
      return;
    }

    try {
      const selectedSupplier = suppliers.find((supplier) => supplier.id === form.preferredSupplierId);
      await createInventoryItem(selectedCompany.id, {
        name: form.name,
        barcode: form.barcode || undefined,
        category: form.category,
        unit: form.unit,
        vatApplicable: form.vatApplicable === 'yes',
        tracksInventory: form.tracksInventory === 'tracked',
        onHand: Number(form.onHand || 0),
        reorderPoint: Number(form.reorderPoint || 0),
        unitCost: Number(form.unitCost || 0),
        salePrice: form.salePrice ? Number(form.salePrice) : undefined,
        preferredVendor: selectedSupplier?.name,
        preferredSupplierId: selectedSupplier?.id,
        location: form.location || undefined,
        customFields: Object.keys(createCustomValues).length > 0 ? createCustomValues : undefined,
      });
      setOpenCreate(false);
      resetForm();
      setCreateCustomValues({});
      await load();
      toast({ title: tr('Inventory item created', 'تم إنشاء عنصر مخزون') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Create failed', 'فشل الإنشاء'),
        description: error?.message || tr('Could not create inventory item.', 'تعذر إنشاء عنصر المخزون.'),
      });
    }
  };

  const handleAdjust = async () => {
    if (!selectedCompany || !adjustment.item) return;
    const quantityChange = Number(adjustment.quantityChange || 0);
    if (!Number.isFinite(quantityChange) || quantityChange === 0) {
      toast({
        variant: 'destructive',
        title: tr('Invalid adjustment', 'تعديل غير صالح'),
        description: tr('Enter a non-zero quantity change.', 'أدخل تغيير كمية غير صفري.'),
      });
      return;
    }

    try {
      await adjustInventoryItem(selectedCompany.id, adjustment.item.id, {
        quantityChange,
        note: adjustment.note || undefined,
        location: adjustment.location || undefined,
      });
      setAdjustment({ open: false, quantityChange: '', location: '', note: '' });
      await load();
      toast({ title: tr('Stock adjusted', 'تم تعديل المخزون') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Adjustment failed', 'فشل التعديل'),
        description: error?.message || tr('Could not adjust inventory.', 'تعذر تعديل المخزون.'),
      });
    }
  };

  const handleIssue = async () => {
    if (!selectedCompany || !issue.item) return;
    const quantity = Number(issue.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast({
        variant: 'destructive',
        title: tr('Invalid issue', 'عملية صرف غير صالحة'),
        description: tr('Enter a quantity greater than zero.', 'أدخل كمية أكبر من صفر.'),
      });
      return;
    }

    try {
      await issueInventoryItem(selectedCompany.id, issue.item.id, {
        quantity,
        location: issue.location || undefined,
        projectId: issue.projectId || undefined,
        issuedTo: issue.issuedTo || undefined,
        note: issue.note || undefined,
      });
      setIssue({
        open: false,
        quantity: '',
        location: '',
        projectId: '',
        issuedTo: '',
        note: '',
      });
      await load();
      toast({ title: tr('Inventory issued', 'تم صرف المخزون') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Issue failed', 'فشل الصرف'),
        description: error?.message || tr('Could not issue stock.', 'تعذر صرف المخزون.'),
      });
    }
  };

  const handleTransfer = async () => {
    if (!selectedCompany || !transfer.item) return;
    const quantity = Number(transfer.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0 || !transfer.toLocation.trim()) {
      toast({
        variant: 'destructive',
        title: tr('Invalid transfer', 'تحويل غير صالح'),
        description: tr('Enter a quantity and destination location.', 'أدخل الكمية وموقع الوجهة.'),
      });
      return;
    }

    try {
      await transferInventoryItem(selectedCompany.id, transfer.item.id, {
        quantity,
        fromLocation: transfer.fromLocation || undefined,
        toLocation: transfer.toLocation.trim(),
        note: transfer.note || undefined,
      });
      setTransfer({
        open: false,
        quantity: '',
        fromLocation: '',
        toLocation: '',
        note: '',
      });
      await load();
      toast({ title: tr('Inventory transferred', 'تم تحويل المخزون') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Transfer failed', 'فشل التحويل'),
        description: error?.message || tr('Could not transfer stock.', 'تعذر تحويل المخزون.'),
      });
    }
  };

  const getStatus = (item: InventoryItem) => {
    if (item.onHand <= 0) {
      return { label: tr('Out of Stock', 'نفد المخزون'), className: 'bg-red-100 text-red-700 border-red-200' };
    }
    if (item.onHand <= item.reorderPoint) {
      return { label: tr('Low Stock', 'مخزون منخفض'), className: 'bg-amber-100 text-amber-700 border-amber-200' };
    }
    return { label: tr('Healthy', 'جيد'), className: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  };

  if (!selectedCompany) {
    return (
      <SectionPageShell
        title={tr('Inventory Management', 'إدارة المخزون')}
        description={tr('Track stock levels, reorder points, locations, and inbound quantities from purchase orders.', 'تتبع مستويات المخزون ونقاط إعادة الطلب والمواقع والكميات الواردة من أوامر الشراء.')}
      >
        <SectionEmptyState
          title={tr('Choose a company to continue', 'اختر شركة للمتابعة')}
          description={tr('Inventory is scoped by company. Use the company switcher first, then manage stock, movements, and receiving from one place.', 'المخزون مرتبط بالشركة. استخدم مبدل الشركة أولًا ثم أدر المخزون والحركات والاستلام من مكان واحد.')}
        />
      </SectionPageShell>
    );
  }

  return (
    <SectionPageShell
      title={tr('Inventory Management', 'إدارة المخزون')}
      description={tr('Track stock levels, reorder points, and inbound quantities from purchase orders.', 'تتبع مستويات المخزون ونقاط إعادة الطلب والكميات الواردة من أوامر الشراء.')}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-tutorial="inventory-metrics">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{tr('Active SKUs', 'الأصناف النشطة')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalItems}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{tr('Low Stock', 'مخزون منخفض')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.lowStock}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{tr('Out of Stock', 'نفد المخزون')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.outOfStock}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{tr('Incoming Units', 'الوحدات الواردة')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.incomingUnits}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{tr('Stock Value', 'قيمة المخزون')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{amount(stats.inventoryValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{tr('Tracked Locations', 'المواقع المتتبعة')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.trackedLocations}</div>
          </CardContent>
        </Card>
      </div>

      <SectionToolbar
        search={(
          <Input
            data-tutorial="inventory-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr('Search by SKU, item, vendor, or location', 'ابحث حسب SKU أو الصنف أو المورد أو الموقع')}
            className="max-w-md"
          />
        )}
        filters={(
          <div className="flex flex-wrap items-center gap-2" data-tutorial="inventory-stock-filter">
            <Button
              variant={stockFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStockFilter('all')}
            >
              {tr('All', 'الكل')}
            </Button>
            <Button
              variant={stockFilter === 'attention' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStockFilter('attention')}
            >
              {tr('Needs Attention', 'تحتاج انتباه')}
            </Button>
            <Button
              variant={stockFilter === 'healthy' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStockFilter('healthy')}
            >
              {tr('Healthy', 'جيد')}
            </Button>
          </div>
        )}
        summary={tr(`Showing ${filteredItems.length} of ${items.length} items`, `عرض ${filteredItems.length} من أصل ${items.length} عنصر`)}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
          {selectedCompany ? (
            <CsvImportExport
              exportPath={`/companies/${selectedCompany.id}/inventory-items/export`}
              exportFilename="inventory-items.csv"
              importPath={`/companies/${selectedCompany.id}/inventory-items/import`}
              onImported={load}
              labels={{ export: tr('Export', 'تصدير'), import: tr('Import', 'استيراد') }}
            />
          ) : null}
          <Dialog
          open={openCreate}
          onOpenChange={(open) => {
            setOpenCreate(open);
            if (open) setForm({ ...emptyForm(), location: defaultWarehouseName });
            else resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button data-tutorial="inventory-create-btn">
              <PackagePlus className="me-2 h-4 w-4" />
              {tr('New Inventory Item', 'عنصر مخزون جديد')}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{tr('Add Inventory Item', 'إضافة عنصر مخزون')}</DialogTitle>
              <DialogDescription>
                {tr('Create a stock item that can be tracked in inventory and referenced by purchases.', 'أنشئ عنصر مخزون يمكن تتبعه في المخزون وربطه بعمليات الشراء.')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{tr('Name', 'الاسم')}</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder={tr('Item name', 'اسم الصنف')}
                />
              </div>
              <div className="space-y-1">
                <Label>{tr('SKU', 'SKU')}</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                  {tr('Auto-generated when saved', 'يتم إنشاؤه تلقائيًا عند الحفظ')}
                </div>
              </div>
              <div className="space-y-1">
                <Label>{tr('Barcode', 'الباركود')}</Label>
                <Input
                  value={form.barcode}
                  onChange={(event) => setForm((prev) => ({ ...prev, barcode: event.target.value }))}
                  placeholder={tr('Optional barcode', 'باركود اختياري')}
                />
              </div>
              <div className="space-y-1">
                <Label>{tr('Category', 'الفئة')}</Label>
                <CreatableCombobox
                  options={categoryOptions}
                  value={form.category}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
                  placeholder={tr('Category', 'الفئة')}
                  searchPlaceholder={tr('Search or add category…', 'ابحث أو أضف فئة…')}
                  createLabel={tr('Create "{value}"', 'إنشاء «{value}»')}
                />
              </div>
              <div className="space-y-1">
                <Label>{tr('Unit', 'الوحدة')}</Label>
                <Select value={form.unit} onValueChange={(value) => setForm((prev) => ({ ...prev, unit: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {inventoryUnitOptions.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{tr('VAT', 'ضريبة القيمة المضافة')}</Label>
                <Select
                  value={form.vatApplicable}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, vatApplicable: value as InventoryFormState['vatApplicable'] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">{tr('5% VAT applicable', 'تطبق ضريبة 5%')}</SelectItem>
                    <SelectItem value="no">{tr('No VAT', 'بدون ضريبة')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{tr('Inventory Tracking', 'تتبع المخزون')}</Label>
                <Select
                  value={form.tracksInventory}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, tracksInventory: value as InventoryFormState['tracksInventory'] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tracked">{tr('Track in inventory', 'تتبع في المخزون')}</SelectItem>
                    <SelectItem value="non-tracked">{tr('Do not track stock', 'عدم تتبع المخزون')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{tr('On Hand', 'الكمية المتاحة')}</Label>
                <Input
                  type="number"
                  value={form.onHand}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, onHand: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{tr('Reorder Point', 'نقطة إعادة الطلب')}</Label>
                <Input
                  type="number"
                  value={form.reorderPoint}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, reorderPoint: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{tr('Unit Cost', 'تكلفة الوحدة')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.unitCost}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, unitCost: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{tr('Sale Price', 'سعر البيع')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.salePrice}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, salePrice: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>{tr('Preferred Supplier', 'المورد المفضل')}</Label>
                <Combobox
                  options={suppliers.map((supplier) => ({
                    value: supplier.id,
                    label: `${supplier.reference} - ${supplier.name}`,
                    keywords: supplier.name,
                  }))}
                  value={form.preferredSupplierId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, preferredSupplierId: value }))}
                  placeholder={tr('Select supplier', 'اختر المورد')}
                  searchPlaceholder={tr('Select supplier', 'اختر المورد')}
                />
              </div>
              <div className="space-y-1">
                <Label>{tr('Warehouse', 'المستودع')}</Label>
                <WarehouseSelect
                  value={form.location}
                  onChange={(value) => setForm((prev) => ({ ...prev, location: value }))}
                  options={locationOptions}
                  placeholder={tr('Select a warehouse', 'اختر مستودعًا')}
                  allowNone
                  noneLabel={tr('No warehouse', 'بدون مستودع')}
                  emptyLabel={tr('No warehouses yet', 'لا توجد مستودعات بعد')}
                />
              </div>
            </div>
            {customFieldDefs.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <CustomFieldsForm
                  definitions={customFieldDefs}
                  values={createCustomValues}
                  onChange={setCreateCustomValues}
                />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCreate(false)}>
                {tr('Cancel', 'إلغاء')}
              </Button>
            <Button onClick={handleCreate}>{tr('Create Item', 'إنشاء عنصر')}</Button>
            {/* end create dialog footer */}
          </DialogFooter>
        </DialogContent>
          </Dialog>
          </div>
        )}
      />

      <div className="overflow-x-auto rounded-lg border" data-tutorial="inventory-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('SKU', 'SKU')}</TableHead>
              <TableHead>{tr('Item', 'الصنف')}</TableHead>
              <TableHead>{tr('Category', 'الفئة')}</TableHead>
              <TableHead className="text-end">{tr('On Hand', 'الكمية المتاحة')}</TableHead>
              <TableHead className="text-end">{tr('Incoming', 'الوارد')}</TableHead>
              <TableHead className="text-end">{tr('Reorder', 'إعادة الطلب')}</TableHead>
              <TableHead className="text-end">{tr('Unit Cost', 'تكلفة الوحدة')}</TableHead>
              <TableHead>{tr('Vendor', 'المورد')}</TableHead>
              <TableHead>{tr('Status', 'الحالة')}</TableHead>
              <TableHead className="text-end">{tr('Actions', 'الإجراءات')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="ms-auto h-5 w-12" /></TableCell>
                  <TableCell><Skeleton className="ms-auto h-5 w-12" /></TableCell>
                  <TableCell><Skeleton className="ms-auto h-5 w-12" /></TableCell>
                  <TableCell><Skeleton className="ms-auto h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="ms-auto h-9 w-24" /></TableCell>
                </TableRow>
              ))}
            {!loading &&
              filteredItems.map((item) => {
              const status = getStatus(item);
              const incoming = incomingMap.get(item.id) || incomingMap.get(item.sku) || 0;
              const itemBalances = balancesByItem.get(item.id) || [];
              const primaryLocation = itemBalances[0]?.location || item.location || defaultWarehouseName;
              const locationSummary = itemBalances.length
                ? itemBalances.map((entry) => `${entry.location}: ${entry.quantity}`).join(' • ')
                : `${primaryLocation}: ${item.onHand}`;

                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.sku}</TableCell>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[item.barcode || tr('No barcode', 'لا يوجد باركود'), item.tracksInventory ? locationSummary : tr('Non-stock item', 'عنصر غير مخزني')]
                          .filter(Boolean)
                          .join(' • ')}
                      </div>
                    </TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell className="text-end">
                      {item.onHand} {item.unit}
                    </TableCell>
                    <TableCell className="text-end">{incoming}</TableCell>
                    <TableCell className="text-end">{item.reorderPoint}</TableCell>
                    <TableCell className="text-end">{amount(item.unitCost)}</TableCell>
                    <TableCell>
                      {item.preferredSupplierId
                        ? supplierNameMap.get(item.preferredSupplierId) || item.preferredVendor || tr('Unassigned', 'غير محدد')
                        : item.preferredVendor || tr('Unassigned', 'غير محدد')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={status.className}>
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      {item.tracksInventory ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedItemForDocs(item)}
                        >
                          {tr('Docs', 'ملفات')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLotsItem(item)}
                        >
                          <Layers className="me-2 h-4 w-4" />
                          {tr('Lots', 'الدفعات')}
                        </Button>
                        <Dialog
                          open={adjustment.open && adjustment.item?.id === item.id}
                          onOpenChange={(open) =>
                            setAdjustment(
                              open
                                ? {
                                    open: true,
                                    item,
                                    quantityChange: '',
                                    location: primaryLocation,
                                    note: '',
                                  }
                                : { open: false, quantityChange: '', location: '', note: '' },
                            )
                          }
                        >
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <SlidersHorizontal className="me-2 h-4 w-4" />
                              {tr('Adjust', 'تعديل')}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>{tr('Adjust Stock', 'تعديل المخزون')}</DialogTitle>
                              <DialogDescription>
                                {tr('Use a positive quantity to add stock or a negative quantity to reduce it.', 'استخدم قيمة موجبة لإضافة مخزون أو سالبة لتقليله.')}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 py-2">
                              <div className="space-y-1">
                                <Label>{tr('Warehouse', 'المستودع')}</Label>
                                <WarehouseSelect
                                  value={adjustment.location}
                                  onChange={(value) => setAdjustment((prev) => ({ ...prev, location: value }))}
                                  options={locationOptions}
                                  placeholder={tr('Select a warehouse', 'اختر مستودعًا')}
                                  emptyLabel={tr('No warehouses yet', 'لا توجد مستودعات بعد')}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>{tr('Quantity Change', 'تغيير الكمية')}</Label>
                                <Input
                                  type="number"
                                  value={adjustment.quantityChange}
                                  onChange={(event) =>
                                    setAdjustment((prev) => ({ ...prev, quantityChange: event.target.value }))
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>{tr('Reason', 'السبب')}</Label>
                                <Input
                                  value={adjustment.note}
                                  onChange={(event) =>
                                    setAdjustment((prev) => ({ ...prev, note: event.target.value }))
                                  }
                                  placeholder={tr('Cycle count, damaged stock, shrinkage...', 'جرد دوري، تلف، فاقد...')}
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button
                                variant="outline"
                                onClick={() =>
                                  setAdjustment({ open: false, quantityChange: '', location: '', note: '' })
                                }
                              >
                                {tr('Cancel', 'إلغاء')}
                              </Button>
                              <Button onClick={handleAdjust}>{tr('Save Adjustment', 'حفظ التعديل')}</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Dialog
                          open={issue.open && issue.item?.id === item.id}
                          onOpenChange={(open) =>
                            setIssue(
                              open
                                ? {
                                    open: true,
                                    item,
                                    quantity: '',
                                    location: primaryLocation,
                                    projectId: '',
                                    issuedTo: '',
                                    note: '',
                                  }
                                : {
                                    open: false,
                                    quantity: '',
                                    location: '',
                                    projectId: '',
                                    issuedTo: '',
                                    note: '',
                                  },
                            )
                          }
                        >
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <PackageMinus className="me-2 h-4 w-4" />
                              {tr('Issue', 'صرف')}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-lg">
                            <DialogHeader>
                              <DialogTitle>{tr('Issue Stock', 'صرف المخزون')}</DialogTitle>
                              <DialogDescription>
                                {tr('Allocate stock to a project, team member, or internal use. Tracked lots are drawn first-expiry-first-out (FEFO).', 'خصص المخزون لمشروع أو موظف أو استخدام داخلي. تُصرف الدفعات حسب الأقرب انتهاءً أولًا (FEFO).')}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-3 py-2 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label>{tr('Warehouse', 'المستودع')}</Label>
                                <WarehouseSelect
                                  value={issue.location}
                                  onChange={(value) => setIssue((prev) => ({ ...prev, location: value }))}
                                  options={locationOptions}
                                  placeholder={tr('Select a warehouse', 'اختر مستودعًا')}
                                  emptyLabel={tr('No warehouses yet', 'لا توجد مستودعات بعد')}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>{tr('Quantity', 'الكمية')}</Label>
                                <Input
                                  type="number"
                                  value={issue.quantity}
                                  onChange={(event) =>
                                    setIssue((prev) => ({ ...prev, quantity: event.target.value }))
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>{tr('Project', 'المشروع')}</Label>
                                <select
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  value={issue.projectId}
                                  onChange={(event) =>
                                    setIssue((prev) => ({ ...prev, projectId: event.target.value }))
                                  }
                                >
                                  <option value="">{tr('Internal / Unassigned', 'داخلي / غير محدد')}</option>
                                  {projects.map((project) => (
                                    <option key={project.id} value={project.id}>
                                      {project.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <Label>{tr('Issued To', 'مُصروف إلى')}</Label>
                                <Input
                                  value={issue.issuedTo}
                                  onChange={(event) =>
                                    setIssue((prev) => ({ ...prev, issuedTo: event.target.value }))
                                  }
                                  placeholder={tr('Team, department, employee...', 'فريق، قسم، موظف...')}
                                />
                              </div>
                              <div className="space-y-1 sm:col-span-2">
                                <Label>{tr('Note', 'ملاحظة')}</Label>
                                <Textarea
                                  value={issue.note}
                                  onChange={(event) =>
                                    setIssue((prev) => ({ ...prev, note: event.target.value }))
                                  }
                                  placeholder={tr('Issued for event kit, project delivery, office use...', 'صرف لحقيبة فعالية، تسليم مشروع، استخدام مكتبي...')}
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button
                                variant="outline"
                                onClick={() =>
                                  setIssue({
                                    open: false,
                                    quantity: '',
                                    location: '',
                                    projectId: '',
                                    issuedTo: '',
                                    note: '',
                                  })
                                }
                              >
                                {tr('Cancel', 'إلغاء')}
                              </Button>
                              <Button onClick={handleIssue}>{tr('Issue Stock', 'صرف المخزون')}</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Dialog
                          open={transfer.open && transfer.item?.id === item.id}
                          onOpenChange={(open) =>
                            setTransfer(
                              open
                                ? {
                                    open: true,
                                    item,
                                    quantity: '',
                                    fromLocation: primaryLocation,
                                    toLocation: '',
                                    note: '',
                                  }
                                : {
                                    open: false,
                                    quantity: '',
                                    fromLocation: '',
                                    toLocation: '',
                                    note: '',
                                  },
                            )
                          }
                        >
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <ArrowRightLeft className="me-2 h-4 w-4" />
                              {tr('Transfer', 'تحويل')}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-lg">
                            <DialogHeader>
                              <DialogTitle>{tr('Transfer Stock', 'تحويل المخزون')}</DialogTitle>
                              <DialogDescription>
                                {tr('Move stock between internal storage locations while keeping total quantity unchanged.', 'انقل المخزون بين مواقع التخزين الداخلية مع بقاء الكمية الإجمالية دون تغيير.')}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-3 py-2 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label>{tr('From Warehouse', 'من مستودع')}</Label>
                                <WarehouseSelect
                                  value={transfer.fromLocation}
                                  onChange={(value) => setTransfer((prev) => ({ ...prev, fromLocation: value }))}
                                  options={locationOptions}
                                  placeholder={tr('Select a warehouse', 'اختر مستودعًا')}
                                  emptyLabel={tr('No warehouses yet', 'لا توجد مستودعات بعد')}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>{tr('To Warehouse', 'إلى مستودع')}</Label>
                                <WarehouseSelect
                                  value={transfer.toLocation}
                                  onChange={(value) => setTransfer((prev) => ({ ...prev, toLocation: value }))}
                                  options={locationOptions}
                                  placeholder={tr('Select a warehouse', 'اختر مستودعًا')}
                                  emptyLabel={tr('No warehouses yet', 'لا توجد مستودعات بعد')}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>{tr('Quantity', 'الكمية')}</Label>
                                <Input
                                  type="number"
                                  value={transfer.quantity}
                                  onChange={(event) =>
                                    setTransfer((prev) => ({ ...prev, quantity: event.target.value }))
                                  }
                                />
                              </div>
                              <div className="space-y-1 sm:col-span-2">
                                <Label>{tr('Note', 'ملاحظة')}</Label>
                                <Textarea
                                  value={transfer.note}
                                  onChange={(event) =>
                                    setTransfer((prev) => ({ ...prev, note: event.target.value }))
                                  }
                                  placeholder={tr('Shelf reorganization, event staging, warehouse move...', 'إعادة تنظيم الرفوف، تجهيز فعالية، نقل مستودع...')}
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button
                                variant="outline"
                                onClick={() =>
                                  setTransfer({
                                    open: false,
                                    quantity: '',
                                    fromLocation: '',
                                    toLocation: '',
                                    note: '',
                                  })
                                }
                              >
                                {tr('Cancel', 'إلغاء')}
                              </Button>
                              <Button onClick={handleTransfer}>{tr('Transfer Stock', 'تحويل المخزون')}</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedItemForDocs(item)}
                        >
                          {tr('Docs', 'ملفات')}
                        </Button>
                      )}
                      {canManageInventory && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ms-1 text-muted-foreground hover:text-destructive"
                          onClick={async () => {
                            if (!(await confirm({
                              title: tr('Delete item?', 'حذف الصنف؟'),
                              description: tr(`Delete "${item.name}"? This cannot be undone.`, `حذف "${item.name}"؟ لا يمكن التراجع.`),
                              confirmText: tr('Delete', 'حذف'),
                              cancelText: tr('Cancel', 'إلغاء'),
                              destructive: true,
                            }))) return;
                            try {
                              await deleteInventoryItem(item.id);
                              await load();
                              toast({ title: tr('Item deleted', 'تم حذف الصنف') });
                            } catch (error: any) {
                              toast({ variant: 'destructive', title: tr('Could not delete item', 'تعذر حذف الصنف'), description: error?.message });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            {!loading && filteredItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                  {items.length === 0
                    ? tr('No inventory items yet. Add your first stock item to start tracking inventory.', 'لا توجد عناصر مخزون بعد. أضف أول عنصر لبدء تتبع المخزون.')
                    : tr('No inventory items match the current search or filter.', 'لا توجد عناصر مخزون تطابق البحث أو الفلتر الحالي.')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {selectedCompany ? (
        <WarehousesPanel
          companyId={selectedCompany.id}
          warehouses={warehouses}
          balances={balances}
          onChanged={reloadWarehouses}
          tr={tr}
        />
      ) : null}

      <ExpiringLotsPanel lots={expiringLots} items={items} tr={tr} />

      <Card data-tutorial="inventory-movements">
        <CardHeader>
          <CardTitle>{tr('Recent Stock Movements', 'أحدث حركات المخزون')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr('Date', 'التاريخ')}</TableHead>
                  <TableHead>{tr('Item', 'الصنف')}</TableHead>
                  <TableHead>{tr('Type', 'النوع')}</TableHead>
                  <TableHead className="text-end">{tr('Quantity', 'الكمية')}</TableHead>
                  <TableHead>{tr('Reference', 'المرجع')}</TableHead>
                  <TableHead>{tr('Note', 'ملاحظة')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.slice(0, 10).map((movement) => {
                  const item = items.find((entry) => entry.id === movement.inventoryItemId);
                  return (
                    <TableRow key={movement.id}>
                      <TableCell>{movement.createdAt.toLocaleDateString(getCurrentLocale())}</TableCell>
                      <TableCell>{item?.name || movement.inventoryItemId}</TableCell>
                      <TableCell>{movement.movementType}</TableCell>
                      <TableCell className="text-end">
                        {movement.quantityChange > 0 ? `+${movement.quantityChange}` : movement.quantityChange}
                      </TableCell>
                      <TableCell>{movement.referenceId || '—'}</TableCell>
                      <TableCell>{movement.note || '—'}</TableCell>
                    </TableRow>
                  );
                })}
                {movements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      {tr('No stock movements recorded yet.', 'لا توجد حركات مخزون مسجلة بعد.')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedItemForDocs} onOpenChange={(open) => !open && setSelectedItemForDocs(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedItemForDocs?.sku} - {selectedItemForDocs?.name}</DialogTitle>
            <DialogDescription>{tr('Inventory item documents and audit timeline.', 'مستندات عنصر المخزون وسجل التدقيق الزمني.')}</DialogDescription>
          </DialogHeader>
          {selectedItemForDocs && selectedCompany && (
            <RecordSupportPanel
              companyId={selectedCompany.id}
              entityType="inventory_item"
              entityId={selectedItemForDocs.id}
              title={tr('Inventory Attachments & Timeline', 'مرفقات المخزون والخط الزمني')}
            />
          )}
        </DialogContent>
      </Dialog>

      {selectedCompany && (
        <InventoryLotsDialog
          item={lotsItem}
          companyId={selectedCompany.id}
          locationOptions={locationOptions}
          defaultWarehouseName={defaultWarehouseName}
          suppliers={suppliers}
          amount={amount}
          canManage={canManageInventory}
          tr={tr}
          onClose={() => setLotsItem(null)}
          onChanged={load}
        />
      )}
    </SectionPageShell>
  );
}

/** Strict location picker: only registered, active warehouses (enforce mode). */
function WarehouseSelect({
  value,
  onChange,
  options,
  placeholder,
  allowNone,
  noneLabel,
  emptyLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  allowNone?: boolean;
  noneLabel?: string;
  emptyLabel?: string;
}) {
  const NONE = '__none__';
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  return (
    <Select
      value={value ? value : allowNone ? NONE : undefined}
      onValueChange={(v) => onChange(v === NONE ? '' : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowNone ? <SelectItem value={NONE}>{noneLabel ?? '—'}</SelectItem> : null}
        {options.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">{emptyLabel ?? tr('No warehouses', 'لا توجد مستودعات')}</div>
        ) : (
          options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
