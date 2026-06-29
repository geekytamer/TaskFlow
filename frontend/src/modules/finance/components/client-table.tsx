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
import { useI18n } from '@/context/i18n-context';
import { useCompanyCurrency } from '@/lib/currency';
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

export function ClientTable() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { money, amount } = useCompanyCurrency();
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
        title: tr('Error', 'خطأ'),
        description: error?.message || tr('Could not load clients.', 'تعذر تحميل العملاء.'),
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
      toast({ title: tr('Client updated', 'تم تحديث العميل') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Update failed', 'فشل التحديث'),
        description: error?.message || tr('Could not update client.', 'تعذر تحديث العميل.'),
      });
    }
  };

  if (loading) {
    return (
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('Client Name', 'اسم العميل')}</TableHead>
              <TableHead>{tr('Email', 'البريد الإلكتروني')}</TableHead>
              <TableHead>{tr('Address', 'العنوان')}</TableHead>
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
            placeholder={tr('Search clients by name, email, or address', 'ابحث عن العملاء بالاسم أو البريد أو العنوان')}
            className="max-w-md"
          />
        )}
        summary={
          language === 'ar'
            ? `${filteredClients.length} عميل`
            : `${filteredClients.length} client${filteredClients.length === 1 ? '' : 's'}`
        }
        actions={(
          <AddClientDialog
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          onClientAdded={fetchData}
        >
          <Button>
            <PlusCircle className="me-2 h-4 w-4" />
            {tr('Add Client', 'إضافة عميل')}
          </Button>
        </AddClientDialog>
        )}
      />
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('Client Name', 'اسم العميل')}</TableHead>
              <TableHead>{tr('Contact', 'جهة الاتصال')}</TableHead>
              <TableHead>{tr('Reference', 'المرجع')}</TableHead>
              <TableHead>{tr('Status', 'الحالة')}</TableHead>
              <TableHead>{tr('Address', 'العنوان')}</TableHead>
              <TableHead className="text-end">{tr('Invoices', 'الفواتير')}</TableHead>
              <TableHead className="text-end">{tr('Outstanding', 'المستحق')}</TableHead>
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
                    <div className="text-xs text-muted-foreground">{tr('Open details', 'عرض التفاصيل')}</div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1 text-sm">
                      <div>{client.contactName || client.email}</div>
                      <div className="text-muted-foreground">{client.phone || client.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>{client.reference}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{client.status || tr('Active', 'نشط')}</Badge>
                  </TableCell>
                  <TableCell>{client.address}</TableCell>
                  <TableCell className="text-end">{metrics?.invoiceCount || 0}</TableCell>
                  <TableCell className="text-end">{amount(metrics?.outstanding || 0)}</TableCell>
                </TableRow>
              );
            })}
            {filteredClients.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                  {clients.length === 0
                    ? tr(
                        'No clients yet. Add your first client to start linking projects and invoices.',
                        'لا يوجد عملاء بعد. أضف أول عميل لبدء ربط المشاريع والفواتير.',
                      )
                    : tr('No clients match your search.', 'لا يوجد عملاء مطابقون لبحثك.')}
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
                      <Button variant="outline" onClick={() => setEditing(false)}>{tr('Cancel', 'إلغاء')}</Button>
                      <Button onClick={handleSave}>{tr('Save', 'حفظ')}</Button>
                    </div>
                  ) : (
                    <Button variant="outline" onClick={() => setEditing(true)}>{tr('Edit Client', 'تعديل العميل')}</Button>
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
                        <p className="text-sm text-muted-foreground">{tr('Total Billed', 'إجمالي الفواتير')}</p>
                        <p className="text-2xl font-bold">{amount(total)}</p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">{tr('Outstanding', 'المستحق')}</p>
                        <p className="text-2xl font-bold text-orange-600">{amount(outstanding)}</p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">{tr('Paid', 'المدفوع')}</p>
                        <p className="text-2xl font-bold text-green-600">{amount(paid)}</p>
                        <Progress value={paidPct} className="mt-2" />
                        <p className="text-xs text-muted-foreground mt-1">{tr(`${paidPct}% paid`, `${paidPct}٪ مدفوع`)}</p>
                      </div>
                    </div>
                  );
                })()}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">{tr('Credit Limit', 'حد الائتمان')}</p>
                    <p className="text-xl font-semibold">{amount(selectedClient.creditLimit || 0)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedClient.creditNumber || tr('No credit number', 'لا يوجد رقم ائتمان')}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">{tr('Billing Profile', 'ملف الفوترة')}</p>
                    <p className="text-xl font-semibold">{selectedClient.paymentMethod || tr('Not set', 'غير محدد')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tr('VAT', 'الضريبة')}: {selectedClient.vatNumber || tr('Not set', 'غير محدد')}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>{tr('Client Name', 'اسم العميل')}</Label>
                    <Input
                      value={form.name || ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tr('Contact Name', 'اسم جهة الاتصال')}</Label>
                    <Input
                      value={form.contactName || ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, contactName: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tr('Email', 'البريد الإلكتروني')}</Label>
                    <Input
                      value={form.email || ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tr('Phone', 'الهاتف')}</Label>
                    <Input
                      value={form.phone || ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tr('VAT Number', 'الرقم الضريبي')}</Label>
                    <Input
                      value={form.vatNumber || ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, vatNumber: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tr('Credit Limit', 'حد الائتمان')}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.creditLimit ?? ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, creditLimit: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tr('Credit Number', 'رقم الائتمان')}</Label>
                    <Input
                      value={form.creditNumber || ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, creditNumber: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tr('Payment Method', 'طريقة الدفع')}</Label>
                    <Select
                      value={(form.paymentMethod as string) || 'Bank Transfer'}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, paymentMethod: value }))}
                      disabled={!editing}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bank Transfer">{tr('Bank Transfer', 'تحويل بنكي')}</SelectItem>
                        <SelectItem value="Cash">{tr('Cash', 'نقدًا')}</SelectItem>
                        <SelectItem value="Card">{tr('Card', 'بطاقة')}</SelectItem>
                        <SelectItem value="Credit">{tr('Credit', 'ائتمان')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>{tr('Status', 'الحالة')}</Label>
                    <Select
                      value={(form.status as string) || 'Active'}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as Client['status'] }))}
                      disabled={!editing}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Lead">{tr('Lead', 'عميل محتمل')}</SelectItem>
                        <SelectItem value="Active">{tr('Active', 'نشط')}</SelectItem>
                        <SelectItem value="At Risk">{tr('At Risk', 'معرّض للخطر')}</SelectItem>
                        <SelectItem value="Inactive">{tr('Inactive', 'غير نشط')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>{tr('Address', 'العنوان')}</Label>
                    <Input
                      value={form.address || ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>{tr('Notes', 'ملاحظات')}</Label>
                    <Textarea
                      value={form.notes || ''}
                      onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                      disabled={!editing}
                    />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold mb-2">{tr('Linked Projects', 'المشاريع المرتبطة')}</p>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{tr('Project', 'المشروع')}</TableHead>
                          <TableHead>{tr('Visibility', 'الظهور')}</TableHead>
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
                              {tr('No linked projects yet.', 'لا توجد مشاريع مرتبطة بعد.')}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold mb-2">{tr('Invoice History', 'سجل الفواتير')}</p>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{tr('Number', 'الرقم')}</TableHead>
                          <TableHead>{tr('Issued', 'تاريخ الإصدار')}</TableHead>
                          <TableHead>{tr('Due', 'تاريخ الاستحقاق')}</TableHead>
                          <TableHead>{tr('Status', 'الحالة')}</TableHead>
                          <TableHead className="text-end">{tr('Paid', 'المدفوع')}</TableHead>
                          <TableHead className="text-end">{tr('Outstanding', 'المستحق')}</TableHead>
                          <TableHead className="text-end">{tr('Total', 'الإجمالي')}</TableHead>
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
                            <TableCell className="text-end">{amount(inv.paidAmount || 0)}</TableCell>
                            <TableCell className="text-end">{amount(inv.outstandingAmount || 0)}</TableCell>
                            <TableCell className="text-end">{amount(inv.total)}</TableCell>
                          </TableRow>
                        ))}
                        {clientInvoices.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                              {tr('No invoices yet.', 'لا توجد فواتير بعد.')}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <ActivityFeed
                  title={tr('Client Activity', 'نشاط العميل')}
                  entityType="client"
                  entityId={selectedClient.id}
                  limit={6}
                  emptyMessage={tr('No client activity recorded yet.', 'لم يُسجَّل أي نشاط للعميل بعد.')}
                />
                {selectedCompany && (
                  <RecordSupportPanel
                    companyId={selectedCompany.id}
                    entityType="client"
                    entityId={selectedClient.id}
                    title={tr('Client Attachments & Timeline', 'مرفقات العميل والجدول الزمني')}
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
