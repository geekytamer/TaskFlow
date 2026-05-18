'use client';

import * as React from 'react';
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
import { useCompany } from '@/context/company-context';
import { useCompanyCurrency } from '@/lib/currency';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { getContacts, createContact, type Contact } from '@/services/contactService';
import { getInvoices } from '@/services/financeService';
import { getProjects } from '@/services/projectService';
import type { Invoice } from '@/modules/finance/types';
import type { Project } from '@/modules/projects/types';
import { Building2, User, Plus, Search } from 'lucide-react';

type ClientForm = {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

const emptyForm = (): ClientForm => ({
  name: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  notes: '',
});

export function ClientsPage() {
  const { selectedCompany } = useCompany();
  const { amount } = useCompanyCurrency();
  const { t } = useI18n();
  const { toast } = useToast();
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [openCreate, setOpenCreate] = React.useState(false);
  const [form, setForm] = React.useState<ClientForm>(emptyForm());
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!selectedCompany) {
        setContacts([]);
        setInvoices([]);
        setProjects([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [contactData, invoiceData, projectData] = await Promise.all([
          getContacts(selectedCompany.id, 'Client'),
          getInvoices(selectedCompany.id),
          getProjects(),
        ]);
        if (!cancelled) {
          setContacts(contactData);
          setInvoices(invoiceData);
          setProjects(projectData.filter((p: Project) => p.companyId === selectedCompany.id));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedCompany]);

  const contactMetrics = React.useMemo(() => {
    const map = new Map<string, { invoiceCount: number; outstanding: number; total: number }>();
    contacts.forEach((contact: Contact) => {
      const lookupId = contact.clientId || contact.id;
      const clientInvoices = invoices.filter((inv: Invoice) => inv.clientId === lookupId);
      const total = clientInvoices.reduce((sum: number, inv: Invoice) => sum + inv.total, 0);
      const outstanding = clientInvoices.reduce((sum: number, inv: Invoice) => sum + (inv.outstandingAmount || 0), 0);
      map.set(contact.id, { invoiceCount: clientInvoices.length, outstanding, total });
    });
    return map;
  }, [contacts, invoices]);

  const outstanding = React.useMemo(
    () => invoices
      .filter((inv: Invoice) => inv.status === 'Sent' || inv.status === 'Overdue')
      .reduce((sum: number, inv: Invoice) => sum + inv.total, 0),
    [invoices],
  );

  const linkedProjects = React.useMemo(
    () => projects.filter((p: Project) => Boolean(p.clientId)).length,
    [projects],
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c: Contact) =>
      c.name.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.contactPerson?.toLowerCase().includes(q),
    );
  }, [contacts, search]);

  const handleCreate = async () => {
    if (!selectedCompany || !form.name.trim()) return;
    setSaving(true);
    try {
      const contact = await createContact({
        companyId: selectedCompany.id,
        kind: 'Organization',
        name: form.name.trim(),
        contactPerson: form.contactPerson.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        notes: form.notes.trim() || undefined,
        roles: ['Client'],
      });
      setContacts((prev: Contact[]) => [...prev, contact]);
      setOpenCreate(false);
      setForm(emptyForm());
      toast({ title: t('contacts.created') });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionPageShell
      title={t('sections.clients.title')}
      description={t('sections.clients.description')}
      actions={
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 me-1" />{t('clients.addClient')}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('clients.createTitle')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>{t('contacts.name')} *</Label>
                <Input value={form.name} onChange={(e) => setForm((f: ClientForm) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>{t('contacts.contactPerson')}</Label>
                <Input value={form.contactPerson} onChange={(e) => setForm((f: ClientForm) => ({ ...f, contactPerson: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('contacts.email')}</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm((f: ClientForm) => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <Label>{t('contacts.phone')}</Label>
                  <Input value={form.phone} onChange={(e) => setForm((f: ClientForm) => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>{t('contacts.address')}</Label>
                <Input value={form.address} onChange={(e) => setForm((f: ClientForm) => ({ ...f, address: e.target.value }))} />
              </div>
              <div>
                <Label>{t('contacts.notes')}</Label>
                <Input value={form.notes} onChange={(e) => setForm((f: ClientForm) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCreate(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleCreate} disabled={saving || !form.name.trim()}>{t('common.save')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('clients.statClients')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-14" /> : <div className="text-2xl font-bold">{contacts.length}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('clients.statOpenInvoices')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-14" />
            ) : (
              <div className="text-2xl font-bold">
                {invoices.filter((inv: Invoice) => inv.status !== 'Paid').length}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('clients.statOutstanding')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{amount(outstanding)}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('clients.statProjects')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-14" /> : <div className="text-2xl font-bold">{linkedProjects}</div>}
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder={t('contacts.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_: unknown, i: number) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <SectionEmptyState
          title={t('clients.emptyTitle')}
          description={t('clients.emptyDescription')}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('contacts.name')}</TableHead>
              <TableHead>{t('contacts.contactPerson')}</TableHead>
              <TableHead>{t('contacts.email')}</TableHead>
              <TableHead>{t('contacts.phone')}</TableHead>
              <TableHead className="text-end">{t('clients.colInvoices')}</TableHead>
              <TableHead className="text-end">{t('clients.colOutstanding')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c: Contact) => {
              const metrics = contactMetrics.get(c.id);
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {c.kind === 'Organization' ? (
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      {c.name}
                    </div>
                  </TableCell>
                  <TableCell>{c.contactPerson ?? '—'}</TableCell>
                  <TableCell>{c.email ?? '—'}</TableCell>
                  <TableCell>{c.phone ?? '—'}</TableCell>
                  <TableCell className="text-end">{metrics?.invoiceCount ?? 0}</TableCell>
                  <TableCell className="text-end">
                    {metrics?.outstanding ? (
                      <Badge variant="outline" className="text-orange-600">{amount(metrics.outstanding)}</Badge>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </SectionPageShell>
  );
}
