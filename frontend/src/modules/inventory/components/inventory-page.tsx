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
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { SectionToolbar } from '@/modules/operations/components/section-toolbar';
import {
  adjustInventoryItem,
  createInventoryItem,
  getInventoryItems,
  getInventoryLocationBalances,
  getPurchaseOrders,
  getStockMovements,
  getSuppliers,
  issueInventoryItem,
  transferInventoryItem,
} from '@/services/operationsService';
import { getProjects } from '@/services/projectService';
import type { InventoryItem, InventoryLocationBalance, PurchaseOrder, StockMovement, Supplier } from '@/modules/operations/types';
import type { Project } from '@/modules/projects/types';
import { ArrowRightLeft, PackageMinus, PackagePlus, SlidersHorizontal } from 'lucide-react';
import { RecordSupportPanel } from '@/modules/shared/components/record-support-panel';

const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value || 0);

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
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [orders, setOrders] = React.useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [movements, setMovements] = React.useState<StockMovement[]>([]);
  const [balances, setBalances] = React.useState<InventoryLocationBalance[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [openCreate, setOpenCreate] = React.useState(false);
  const [selectedItemForDocs, setSelectedItemForDocs] = React.useState<InventoryItem | null>(null);
  const [form, setForm] = React.useState<InventoryFormState>(emptyForm);
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
      setProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [itemData, orderData, supplierData, movementData, balanceData, projectData] = await Promise.all([
        getInventoryItems(selectedCompany.id),
        getPurchaseOrders(selectedCompany.id),
        getSuppliers(selectedCompany.id),
        getStockMovements(selectedCompany.id),
        getInventoryLocationBalances(selectedCompany.id),
        getProjects(),
      ]);
      setItems(itemData);
      setOrders(orderData);
      setSuppliers(supplierData);
      setMovements(movementData);
      setBalances(balanceData);
      setProjects(projectData.filter((project) => project.companyId === selectedCompany.id));
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Inventory unavailable',
        description: error?.message || 'Could not load inventory items.',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

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
        title: 'Missing required fields',
        description: 'Name, category, and unit are required.',
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
      });
      setOpenCreate(false);
      resetForm();
      await load();
      toast({ title: 'Inventory item created' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Create failed',
        description: error?.message || 'Could not create inventory item.',
      });
    }
  };

  const handleAdjust = async () => {
    if (!selectedCompany || !adjustment.item) return;
    const quantityChange = Number(adjustment.quantityChange || 0);
    if (!Number.isFinite(quantityChange) || quantityChange === 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid adjustment',
        description: 'Enter a non-zero quantity change.',
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
      toast({ title: 'Stock adjusted' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Adjustment failed',
        description: error?.message || 'Could not adjust inventory.',
      });
    }
  };

  const handleIssue = async () => {
    if (!selectedCompany || !issue.item) return;
    const quantity = Number(issue.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid issue',
        description: 'Enter a quantity greater than zero.',
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
      toast({ title: 'Inventory issued' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Issue failed',
        description: error?.message || 'Could not issue stock.',
      });
    }
  };

  const handleTransfer = async () => {
    if (!selectedCompany || !transfer.item) return;
    const quantity = Number(transfer.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0 || !transfer.toLocation.trim()) {
      toast({
        variant: 'destructive',
        title: 'Invalid transfer',
        description: 'Enter a quantity and destination location.',
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
      toast({ title: 'Inventory transferred' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Transfer failed',
        description: error?.message || 'Could not transfer stock.',
      });
    }
  };

  const getStatus = (item: InventoryItem) => {
    if (item.onHand <= 0) {
      return { label: 'Out of Stock', className: 'bg-red-100 text-red-700 border-red-200' };
    }
    if (item.onHand <= item.reorderPoint) {
      return { label: 'Low Stock', className: 'bg-amber-100 text-amber-700 border-amber-200' };
    }
    return { label: 'Healthy', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  };

  if (!selectedCompany) {
    return (
      <SectionPageShell
        title="Inventory Management"
        description="Track stock levels, reorder points, locations, and inbound quantities from purchase orders."
      >
        <SectionEmptyState
          title="Choose a company to continue"
          description="Inventory is scoped by company. Use the company switcher first, then manage stock, movements, and receiving from one place."
        />
      </SectionPageShell>
    );
  }

  return (
    <SectionPageShell
      title="Inventory Management"
      description="Track stock levels, reorder points, and inbound quantities from purchase orders."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active SKUs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalItems}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.lowStock}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.outOfStock}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Incoming Units</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.incomingUnits}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Stock Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{money(stats.inventoryValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tracked Locations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.trackedLocations}</div>
          </CardContent>
        </Card>
      </div>

      <SectionToolbar
        search={(
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by SKU, item, vendor, or location"
            className="max-w-md"
          />
        )}
        filters={(
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={stockFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStockFilter('all')}
            >
              All
            </Button>
            <Button
              variant={stockFilter === 'attention' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStockFilter('attention')}
            >
              Needs Attention
            </Button>
            <Button
              variant={stockFilter === 'healthy' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStockFilter('healthy')}
            >
              Healthy
            </Button>
          </div>
        )}
        summary={`Showing ${filteredItems.length} of ${items.length} items`}
        actions={(
          <Dialog
          open={openCreate}
          onOpenChange={(open) => {
            setOpenCreate(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <PackagePlus className="me-2 h-4 w-4" />
              New Inventory Item
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Inventory Item</DialogTitle>
              <DialogDescription>
                Create a stock item that can be tracked in inventory and referenced by purchases.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Item name"
                />
              </div>
              <div className="space-y-1">
                <Label>SKU</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                  Auto-generated when saved
                </div>
              </div>
              <div className="space-y-1">
                <Label>Barcode</Label>
                <Input
                  value={form.barcode}
                  onChange={(event) => setForm((prev) => ({ ...prev, barcode: event.target.value }))}
                  placeholder="Optional barcode"
                />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Input
                  value={form.category}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, category: event.target.value }))
                  }
                  placeholder="Category"
                />
              </div>
              <div className="space-y-1">
                <Label>Unit</Label>
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
                <Label>VAT</Label>
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
                    <SelectItem value="yes">5% VAT applicable</SelectItem>
                    <SelectItem value="no">No VAT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Inventory Tracking</Label>
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
                    <SelectItem value="tracked">Track in inventory</SelectItem>
                    <SelectItem value="non-tracked">Do not track stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>On Hand</Label>
                <Input
                  type="number"
                  value={form.onHand}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, onHand: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Reorder Point</Label>
                <Input
                  type="number"
                  value={form.reorderPoint}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, reorderPoint: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Unit Cost</Label>
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
                <Label>Sale Price</Label>
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
                <Label>Preferred Supplier</Label>
                <Select
                  value={form.preferredSupplierId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, preferredSupplierId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.reference} - {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Location</Label>
                <Input
                  value={form.location}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, location: event.target.value }))
                  }
                  placeholder="Warehouse A"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCreate(false)}>
                Cancel
              </Button>
            <Button onClick={handleCreate}>Create Item</Button>
          </DialogFooter>
        </DialogContent>
          </Dialog>
        )}
      />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-end">On Hand</TableHead>
              <TableHead className="text-end">Incoming</TableHead>
              <TableHead className="text-end">Reorder</TableHead>
              <TableHead className="text-end">Unit Cost</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-end">Actions</TableHead>
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
              const primaryLocation = itemBalances[0]?.location || item.location || 'Unassigned';
              const locationSummary = itemBalances.length
                ? itemBalances.map((entry) => `${entry.location}: ${entry.quantity}`).join(' • ')
                : `${primaryLocation}: ${item.onHand}`;

                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.sku}</TableCell>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[item.barcode || 'No barcode', item.tracksInventory ? locationSummary : 'Non-stock item']
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
                    <TableCell className="text-end">{money(item.unitCost)}</TableCell>
                    <TableCell>
                      {item.preferredSupplierId
                        ? supplierNameMap.get(item.preferredSupplierId) || item.preferredVendor || 'Unassigned'
                        : item.preferredVendor || 'Unassigned'}
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
                          Docs
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
                              Adjust
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Adjust Stock</DialogTitle>
                              <DialogDescription>
                                Use a positive quantity to add stock or a negative quantity to reduce it.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 py-2">
                              <div className="space-y-1">
                                <Label>Location</Label>
                                <Input
                                  value={adjustment.location}
                                  onChange={(event) =>
                                    setAdjustment((prev) => ({ ...prev, location: event.target.value }))
                                  }
                                  placeholder="Warehouse A"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Quantity Change</Label>
                                <Input
                                  type="number"
                                  value={adjustment.quantityChange}
                                  onChange={(event) =>
                                    setAdjustment((prev) => ({ ...prev, quantityChange: event.target.value }))
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Reason</Label>
                                <Input
                                  value={adjustment.note}
                                  onChange={(event) =>
                                    setAdjustment((prev) => ({ ...prev, note: event.target.value }))
                                  }
                                  placeholder="Cycle count, damaged stock, shrinkage..."
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
                                Cancel
                              </Button>
                              <Button onClick={handleAdjust}>Save Adjustment</Button>
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
                              Issue
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-lg">
                            <DialogHeader>
                              <DialogTitle>Issue Stock</DialogTitle>
                              <DialogDescription>
                                Allocate stock to a project, team member, or internal use.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-3 py-2 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label>Location</Label>
                                <Input
                                  value={issue.location}
                                  onChange={(event) =>
                                    setIssue((prev) => ({ ...prev, location: event.target.value }))
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Quantity</Label>
                                <Input
                                  type="number"
                                  value={issue.quantity}
                                  onChange={(event) =>
                                    setIssue((prev) => ({ ...prev, quantity: event.target.value }))
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Project</Label>
                                <select
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  value={issue.projectId}
                                  onChange={(event) =>
                                    setIssue((prev) => ({ ...prev, projectId: event.target.value }))
                                  }
                                >
                                  <option value="">Internal / Unassigned</option>
                                  {projects.map((project) => (
                                    <option key={project.id} value={project.id}>
                                      {project.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <Label>Issued To</Label>
                                <Input
                                  value={issue.issuedTo}
                                  onChange={(event) =>
                                    setIssue((prev) => ({ ...prev, issuedTo: event.target.value }))
                                  }
                                  placeholder="Team, department, employee..."
                                />
                              </div>
                              <div className="space-y-1 sm:col-span-2">
                                <Label>Note</Label>
                                <Textarea
                                  value={issue.note}
                                  onChange={(event) =>
                                    setIssue((prev) => ({ ...prev, note: event.target.value }))
                                  }
                                  placeholder="Issued for event kit, project delivery, office use..."
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
                                Cancel
                              </Button>
                              <Button onClick={handleIssue}>Issue Stock</Button>
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
                              Transfer
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-lg">
                            <DialogHeader>
                              <DialogTitle>Transfer Stock</DialogTitle>
                              <DialogDescription>
                                Move stock between internal storage locations while keeping total quantity unchanged.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-3 py-2 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label>From Location</Label>
                                <Input
                                  value={transfer.fromLocation}
                                  onChange={(event) =>
                                    setTransfer((prev) => ({ ...prev, fromLocation: event.target.value }))
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>To Location</Label>
                                <Input
                                  value={transfer.toLocation}
                                  onChange={(event) =>
                                    setTransfer((prev) => ({ ...prev, toLocation: event.target.value }))
                                  }
                                  placeholder="Warehouse B"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Quantity</Label>
                                <Input
                                  type="number"
                                  value={transfer.quantity}
                                  onChange={(event) =>
                                    setTransfer((prev) => ({ ...prev, quantity: event.target.value }))
                                  }
                                />
                              </div>
                              <div className="space-y-1 sm:col-span-2">
                                <Label>Note</Label>
                                <Textarea
                                  value={transfer.note}
                                  onChange={(event) =>
                                    setTransfer((prev) => ({ ...prev, note: event.target.value }))
                                  }
                                  placeholder="Shelf reorganization, event staging, warehouse move..."
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
                                Cancel
                              </Button>
                              <Button onClick={handleTransfer}>Transfer Stock</Button>
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
                          Docs
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
                    ? 'No inventory items yet. Add your first stock item to start tracking inventory.'
                    : 'No inventory items match the current search or filter.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Stock Movements</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-end">Quantity</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.slice(0, 10).map((movement) => {
                  const item = items.find((entry) => entry.id === movement.inventoryItemId);
                  return (
                    <TableRow key={movement.id}>
                      <TableCell>{movement.createdAt.toLocaleDateString()}</TableCell>
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
                      No stock movements recorded yet.
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
            <DialogDescription>Inventory item documents and audit timeline.</DialogDescription>
          </DialogHeader>
          {selectedItemForDocs && selectedCompany && (
            <RecordSupportPanel
              companyId={selectedCompany.id}
              entityType="inventory_item"
              entityId={selectedItemForDocs.id}
              title="Inventory Attachments & Timeline"
            />
          )}
        </DialogContent>
      </Dialog>
    </SectionPageShell>
  );
}
