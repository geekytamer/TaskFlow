'use client';

import * as React from 'react';
import { getCurrentLocale } from '@/lib/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { getSupplierPayables } from '@/services/financeService';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { SectionToolbar } from '@/modules/operations/components/section-toolbar';
import { createSupplier, getPurchaseOrders, getSuppliers } from '@/services/operationsService';
import type { PurchaseOrder, Supplier } from '@/modules/operations/types';
import type { SupplierPayablesSummary } from '@/modules/finance/types';
import { Truck } from 'lucide-react';
import { RecordSupportPanel } from '@/modules/shared/components/record-support-panel';

type SupplierForm = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  paymentTermsDays: string;
  notes: string;
};

const emptyForm = (): SupplierForm => ({
  name: '',
  contactName: '',
  email: '',
  phone: '',
  paymentTermsDays: '30',
  notes: '',
});

export function SuppliersPage() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const { money, amount } = useCompanyCurrency();
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [orders, setOrders] = React.useState<PurchaseOrder[]>([]);
  const [payables, setPayables] = React.useState<SupplierPayablesSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [openCreate, setOpenCreate] = React.useState(false);
  const [selectedSupplier, setSelectedSupplier] = React.useState<Supplier | null>(null);
  const [search, setSearch] = React.useState('');
  const [form, setForm] = React.useState<SupplierForm>(emptyForm);

  const load = React.useCallback(async () => {
    if (!selectedCompany) {
      setSuppliers([]);
      setOrders([]);
      setPayables([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [supplierData, orderData, payableData] = await Promise.all([
        getSuppliers(selectedCompany.id),
        getPurchaseOrders(selectedCompany.id),
        getSupplierPayables(selectedCompany.id),
      ]);
      setSuppliers(supplierData);
      setOrders(orderData);
      setPayables(payableData);
    } catch (error: any) {
      setSuppliers([]);
      setOrders([]);
      setPayables([]);
      toast({
        variant: 'destructive',
        title: 'Suppliers unavailable',
        description: error?.message || 'Could not load suppliers.',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const supplierMetrics = React.useMemo(() => {
    const map = new Map<string, { orderCount: number; spend: number; lastOrderDate?: Date }>();
    suppliers.forEach((supplier) => {
      const supplierOrders = orders.filter(
        (order) => order.supplierId === supplier.id || order.supplierName === supplier.name,
      );
      map.set(supplier.id, {
        orderCount: supplierOrders.length,
        spend: supplierOrders.reduce((sum, order) => sum + order.totalAmount, 0),
        lastOrderDate: supplierOrders[0]?.orderDate,
      });
    });
    return map;
  }, [orders, suppliers]);

  const payablesMap = React.useMemo(() => {
    const map = new Map<string, SupplierPayablesSummary>();
    payables.forEach((summary) => map.set(summary.supplierId, summary));
    return map;
  }, [payables]);

  const filteredSuppliers = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return suppliers;
    return suppliers.filter((supplier) =>
      [
        supplier.reference,
        supplier.name,
        supplier.contactName || '',
        supplier.email || '',
        supplier.phone || '',
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [search, suppliers]);

  const handleCreate = async () => {
    if (!selectedCompany) return;
    if (!form.name.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing required fields',
        description: 'Supplier name is required.',
      });
      return;
    }

    try {
      await createSupplier(selectedCompany.id, {
        name: form.name.trim(),
        contactName: form.contactName.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        paymentTermsDays: form.paymentTermsDays ? Number(form.paymentTermsDays) : undefined,
        notes: form.notes.trim() || undefined,
        isActive: true,
      });
      setOpenCreate(false);
      setForm(emptyForm());
      await load();
      toast({ title: 'Supplier created' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Create failed',
        description: error?.message || 'Could not create supplier.',
      });
    }
  };

  if (!selectedCompany) {
    return (
      <SectionPageShell
        title="Suppliers"
        description="Maintain vendor records used by purchasing, preferred stock sources, and payables."
      >
        <SectionEmptyState
          title="Choose a company to continue"
          description="Supplier records are stored per company. Switch into a company first to manage vendors, linked orders, and open payable exposure."
        />
      </SectionPageShell>
    );
  }

  return (
    <SectionPageShell
      title="Suppliers"
      description="Maintain vendor records used by purchasing, preferred stock sources, and payable workflows. Non-stock purchases are controlled at the item level through inventory tracking."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Suppliers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{suppliers.filter((supplier) => supplier.isActive).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Linked Purchase Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open Supplier Payables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {amount(payables.reduce((sum, summary) => sum + summary.openPayables, 0))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Suppliers To Bill</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {payables.filter((summary) => summary.remainingToBill > 0).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <SectionToolbar
        search={(
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, contact, email, or phone"
            className="max-w-md"
          />
        )}
        summary={`Showing ${filteredSuppliers.length} of ${suppliers.length} suppliers`}
        actions={(
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button>
              <Truck className="me-2 h-4 w-4" />
              New Supplier
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Supplier</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-2 sm:grid-cols-2">
              <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground sm:col-span-2">
                Supplier reference is generated automatically when the record is saved.
              </div>
              <div className="space-y-1">
                <Label>Supplier Name</Label>
                <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Contact Name</Label>
                <Input value={form.contactName} onChange={(event) => setForm((prev) => ({ ...prev, contactName: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Payment Terms (days)</Label>
                <Input
                  type="number"
                  value={form.paymentTermsDays}
                  onChange={(event) => setForm((prev) => ({ ...prev, paymentTermsDays: event.target.value }))}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate}>Create Supplier</Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
        )}
      />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Terms</TableHead>
              <TableHead>Purchase Activity</TableHead>
              <TableHead>Payables</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-36" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                </TableRow>
              ))}
            {!loading && filteredSuppliers.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {suppliers.length === 0
                    ? 'No suppliers yet. Create one to connect purchasing and preferred stock sources.'
                    : 'No suppliers match the current search.'}
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              filteredSuppliers.map((supplier) => {
                const metrics = supplierMetrics.get(supplier.id);
                const payable = payablesMap.get(supplier.id);
                return (
                  <TableRow
                    key={supplier.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedSupplier(supplier)}
                  >
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{supplier.name}</p>
                        {supplier.notes && (
                          <p className="max-w-md truncate text-xs text-muted-foreground">{supplier.notes}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{supplier.reference}</TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <div>{supplier.contactName || '—'}</div>
                        <div className="text-muted-foreground">{supplier.email || supplier.phone || '—'}</div>
                      </div>
                    </TableCell>
                    <TableCell>{supplier.paymentTermsDays ? `${supplier.paymentTermsDays} days` : '—'}</TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <div>{metrics?.orderCount || 0} orders</div>
                        <div className="text-muted-foreground">
                          {metrics?.lastOrderDate ? `Last order ${metrics.lastOrderDate.toLocaleDateString(getCurrentLocale())}` : 'No orders yet'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <div>
                          Open{' '}
                          {amount(payable?.openPayables || 0)}
                        </div>
                        <div className="text-muted-foreground">
                          To bill{' '}
                          {amount(payable?.remainingToBill || 0)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{supplier.isActive ? 'Active' : 'Inactive'}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedSupplier} onOpenChange={(open) => !open && setSelectedSupplier(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedSupplier?.name}</DialogTitle>
          </DialogHeader>
          {selectedSupplier && selectedCompany && (
            <RecordSupportPanel
              companyId={selectedCompany.id}
              entityType="supplier"
              entityId={selectedSupplier.id}
              title="Supplier Attachments & Timeline"
            />
          )}
        </DialogContent>
      </Dialog>
    </SectionPageShell>
  );
}
