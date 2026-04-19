'use client';

import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useCompany } from '@/context/company-context';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getClients, getInvoices, updateClient } from '@/services/financeService';
import type { Client, Invoice } from '../types';
import { AddClientDialog } from './add-client-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getProjects } from '@/services/projectService';
import type { Project } from '@/lib/types';
import { ActivityFeed } from '@/modules/operations/components/activity-feed';
import { SectionToolbar } from '@/modules/operations/components/section-toolbar';
import { RecordSupportPanel } from '@/modules/shared/components/record-support-panel';

const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value || 0);

export function ClientTable() {
  const { selectedCompany } = useCompany();
  const [clients, setClients] = React.useState<Client[]>([]);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const { toast } = useToast();
  const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState<{
    name?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    vatNumber?: string;
    creditLimit?: string;
    creditNumber?: string;
    paymentMethod?: string;
    address?: string;
    status?: Client['status'];
    notes?: string;
  }>({});

  const fetchData = React.useCallback(async () => {
    if (!selectedCompany) {
      setClients([]);
      setInvoices([]);
      setLoading(false);
      return;
    }
    setLoading(true);
      try {
      const [clientData, invoiceData, projectData] = await Promise.all([
        getClients(selectedCompany.id),
        getInvoices(selectedCompany.id),
        getProjects(),
      ]);
      setClients(clientData);
      setInvoices(invoiceData);
      setProjects(projectData.filter((project) => project.companyId === selectedCompany.id));
    } catch (error: any) {
      setClients([]);
      setInvoices([]);
      setProjects([]);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'Could not load clients.',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const clientMetrics = React.useMemo(() => {
    const map = new Map<
      string,
      { invoiceCount: number; outstanding: number; total: number; paid: number; invoices: Invoice[] }
    >();

    clients.forEach((client) => {
      const clientInvoices = invoices.filter((invoice) => invoice.clientId === client.id);
      const total = clientInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
      const outstanding = clientInvoices.reduce(
        (sum, invoice) => sum + (invoice.outstandingAmount || 0),
        0,
      );
      const paid = clientInvoices.reduce(
        (sum, invoice) => sum + (invoice.paidAmount || 0),
        0,
      );

      map.set(client.id, {
        invoiceCount: clientInvoices.length,
        outstanding,
        total,
        paid,
        invoices: clientInvoices,
      });
    });

    return map;
  }, [clients, invoices]);

  const filteredClients = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter((client) =>
      [client.reference, client.name, client.email, client.address].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [clients, search]);

  const clientInvoices = selectedClient ? clientMetrics.get(selectedClient.id)?.invoices || [] : [];
  const clientProjects = selectedClient
    ? projects.filter((project) => project.clientId === selectedClient.id)
    : [];

  React.useEffect(() => {
    if (!selectedClient) {
      setEditing(false);
      setForm({});
      return;
    }
    setForm({
      name: selectedClient.name,
      contactName: selectedClient.contactName || '',
      email: selectedClient.email,
      phone: selectedClient.phone || '',
      vatNumber: selectedClient.vatNumber || '',
      creditLimit:
        selectedClient.creditLimit === undefined || selectedClient.creditLimit === null
          ? ''
          : String(selectedClient.creditLimit),
      creditNumber: selectedClient.creditNumber || '',
      paymentMethod: selectedClient.paymentMethod || 'Bank Transfer',
      address: selectedClient.address,
      status: selectedClient.status || 'Active',
      notes: selectedClient.notes || '',
    });
  }, [selectedClient]);

  const handleSave = async () => {
    if (!selectedClient) return;
    try {
      const updated = await updateClient(selectedClient.id, {
        name: form.name,
        contactName: form.contactName || undefined,
        email: form.email,
        phone: form.phone || undefined,
        vatNumber: form.vatNumber || undefined,
        creditLimit: !form.creditLimit ? undefined : Number(form.creditLimit),
        creditNumber: form.creditNumber || undefined,
        paymentMethod: form.paymentMethod || undefined,
        address: form.address,
        status: form.status as Client['status'],
        notes: form.notes || undefined,
      });
      setSelectedClient(updated);
      setEditing(false);
      await fetchData();
      toast({ title: 'Client updated' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error?.message || 'Could not update client.',
      });
    }
  };

  if (loading) {
    return (
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Address</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(3)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                <TableCell><Skeleton className="h-5 w-48" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
            placeholder="Search clients by name, email, or address"
            className="max-w-md"
          />
        )}
        summary={`${filteredClients.length} client${filteredClients.length === 1 ? '' : 's'}`}
        actions={(
          <AddClientDialog
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          onClientAdded={fetchData}
        >
          <Button>
            <PlusCircle className="me-2 h-4 w-4" />
            Add Client
          </Button>
        </AddClientDialog>
        )}
      />
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Address</TableHead>
              <TableHead className="text-end">Invoices</TableHead>
              <TableHead className="text-end">Outstanding</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClients.map((client) => {
              const metrics = clientMetrics.get(client.id);
              return (
                <TableRow
                  key={client.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => {
                    setSelectedClient(client);
                  }}
                >
                  <TableCell className="font-medium">
                    <div>{client.name}</div>
                    <div className="text-xs text-muted-foreground">Open details</div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1 text-sm">
                      <div>{client.contactName || client.email}</div>
                      <div className="text-muted-foreground">{client.phone || client.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>{client.reference}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{client.status || 'Active'}</Badge>
                  </TableCell>
                  <TableCell>{client.address}</TableCell>
                  <TableCell className="text-end">{metrics?.invoiceCount || 0}</TableCell>
                  <TableCell className="text-end">{money(metrics?.outstanding || 0)}</TableCell>
                </TableRow>
              );
            })}
            {filteredClients.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                  {clients.length === 0
                    ? 'No clients yet. Add your first client to start linking projects and invoices.'
                    : 'No clients match your search.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selectedClient} onOpenChange={(open) => !open && setSelectedClient(null)}>
        <SheetContent className="w-full max-w-2xl sm:max-w-2xl">
          {selectedClient && (
            <>
              <SheetHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <SheetTitle>{selectedClient.name}</SheetTitle>
                    <p className="text-sm text-muted-foreground">
                      {selectedClient.reference} • {selectedClient.email}
                    </p>
                  </div>
                  {editing ? (
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                      <Button onClick={handleSave}>Save</Button>
                    </div>
                  ) : (
                    <Button variant="outline" onClick={() => setEditing(true)}>Edit Client</Button>
                  )}
                </div>
              </SheetHeader>
              <div className="space-y-6 py-4">
                {(() => {
                  const total = clientMetrics.get(selectedClient.id)?.total || 0;
                  const paid = clientMetrics.get(selectedClient.id)?.paid || 0;
                  const outstanding = clientMetrics.get(selectedClient.id)?.outstanding || 0;
                  const paidPct = total ? Math.round((paid / total) * 100) : 0;
                  return (
                    <div className="grid grid-cols-3 gap-4">
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">Total Billed</p>
                        <p className="text-2xl font-bold">{money(total)}</p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">Outstanding</p>
                        <p className="text-2xl font-bold text-orange-600">{money(outstanding)}</p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">Paid</p>
                        <p className="text-2xl font-bold text-green-600">{money(paid)}</p>
                        <Progress value={paidPct} className="mt-2" />
                        <p className="text-xs text-muted-foreground mt-1">{paidPct}% paid</p>
                      </div>
                    </div>
                  );
                })()}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Credit Limit</p>
                    <p className="text-xl font-semibold">{money(selectedClient.creditLimit || 0)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedClient.creditNumber || 'No credit number'}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Billing Profile</p>
                    <p className="text-xl font-semibold">{selectedClient.paymentMethod || 'Not set'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      VAT: {selectedClient.vatNumber || 'Not set'}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Client Name</Label>
                    <Input
                      value={form.name || ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Contact Name</Label>
                    <Input
                      value={form.contactName || ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, contactName: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Email</Label>
                    <Input
                      value={form.email || ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Phone</Label>
                    <Input
                      value={form.phone || ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>VAT Number</Label>
                    <Input
                      value={form.vatNumber || ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, vatNumber: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Credit Limit</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.creditLimit ?? ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, creditLimit: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Credit Number</Label>
                    <Input
                      value={form.creditNumber || ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, creditNumber: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Payment Method</Label>
                    <Select
                      value={(form.paymentMethod as string) || 'Bank Transfer'}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, paymentMethod: value }))}
                      disabled={!editing}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="Credit">Credit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Status</Label>
                    <Select
                      value={(form.status as string) || 'Active'}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as Client['status'] }))}
                      disabled={!editing}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Lead">Lead</SelectItem>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="At Risk">At Risk</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Address</Label>
                    <Input
                      value={form.address || ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={form.notes || ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold mb-2">Linked Projects</p>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project</TableHead>
                          <TableHead>Visibility</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientProjects.map((project) => (
                          <TableRow key={project.id}>
                            <TableCell className="font-medium">{project.name}</TableCell>
                            <TableCell>{project.visibility}</TableCell>
                          </TableRow>
                        ))}
                        {clientProjects.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={2} className="text-center text-sm text-muted-foreground">
                              No linked projects yet.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold mb-2">Invoice History</p>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Number</TableHead>
                          <TableHead>Issued</TableHead>
                          <TableHead>Due</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-end">Paid</TableHead>
                          <TableHead className="text-end">Outstanding</TableHead>
                          <TableHead className="text-end">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientInvoices.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                            <TableCell>{format(inv.issueDate, 'MMM d, yyyy')}</TableCell>
                            <TableCell>{format(inv.dueDate, 'MMM d, yyyy')}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{inv.status}</Badge>
                            </TableCell>
                            <TableCell className="text-end">${(inv.paidAmount || 0).toFixed(2)}</TableCell>
                            <TableCell className="text-end">${(inv.outstandingAmount || 0).toFixed(2)}</TableCell>
                            <TableCell className="text-end">${inv.total.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                        {clientInvoices.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                              No invoices yet.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <ActivityFeed
                  title="Client Activity"
                  entityType="client"
                  entityId={selectedClient.id}
                  limit={6}
                  emptyMessage="No client activity recorded yet."
                />
                {selectedCompany && (
                  <RecordSupportPanel
                    companyId={selectedCompany.id}
                    entityType="client"
                    entityId={selectedClient.id}
                    title="Client Attachments & Timeline"
                    compact
                  />
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
