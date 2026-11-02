'use client';

import { useCompanyScope } from '@/context/company-scope-context';
import { fanOut, type MissingCompany } from '@/lib/fan-out';
import { sumByCurrency } from '@/lib/money-by-currency';
import { CompanyLabel } from '@/modules/groups/components/company-cell';
import { CurrencyTotals } from '@/modules/groups/components/currency-totals';
import { MissingCompanies } from '@/modules/groups/components/missing-companies';
import { CreateTargetSelect, useCreateTarget } from '@/modules/groups/components/company-picker';
import { useCurrencyOf } from '@/modules/groups/hooks/use-currency-of';
import * as React from 'react';
import { isModuleOn } from '@/modules/companies/lib/company-modules';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/context/company-context';
import { inCompanyCurrency, useCompanyCurrency } from '@/lib/currency';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { PortalAccessPanel } from '@/modules/portal-access/components/portal-access-panel';
import { useCanManagePortal } from '@/modules/portal-access/lib/use-can-manage-portal';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { getContacts, createContact, type Contact } from '@/services/contactService';
import { getInvoices } from '@/services/financeService';
import { getProjects } from '@/services/projectService';
import type { Invoice } from '@/modules/finance/types';
import type { Project } from '@/modules/projects/types';
import { CustomFieldsForm } from '@/components/ui/custom-fields-form';
import { getCustomFieldDefinitions, type CustomFieldDefinition } from '@/services/customFieldService';
import {
  ContactFormFields,
  emptyContactForm,
  buildContactPayload,
  type ContactForm,
} from '@/modules/contacts/components/contact-form-fields';
import { Building2, User, Plus, Search } from 'lucide-react';

export function ClientsPage() {
  const { selectedCompany } = useCompany();
  const { amountIn } = useCompanyCurrency();
  const { t, language } = useI18n();
  const { toast } = useToast();
  const canManagePortal = useCanManagePortal();
  const [portalFor, setPortalFor] = React.useState<Contact | null>(null);
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [openCreate, setOpenCreate] = React.useState(false);
  const [form, setForm] = React.useState<ContactForm>(emptyContactForm());
  const [customFieldDefs, setCustomFieldDefs] = React.useState<CustomFieldDefinition[]>([]);
  const [createCustomValues, setCreateCustomValues] = React.useState<Record<string, unknown>>({});
  const [saving, setSaving] = React.useState(false);
  // A group shown whole: every company's clients; money in each company's currency.
  const { companyIds } = useCompanyScope();
  const scopeKey = companyIds.join(',');
  const [missing, setMissing] = React.useState<MissingCompany[]>([]);
  const createTarget = useCreateTarget('contacts.create');
  const currencyOf = useCurrencyOf();

  React.useEffect(() => {
    if (!createTarget.target) { setCustomFieldDefs([]); return; }
    let cancelled = false;
    getCustomFieldDefinitions(createTarget.target, 'contact')
      .then((defs) => { if (!cancelled) setCustomFieldDefs(defs); })
      .catch(() => { if (!cancelled) setCustomFieldDefs([]); });
    return () => { cancelled = true; };
  }, [createTarget.target]);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!selectedCompany || !scopeKey) {
        setContacts([]);
        setInvoices([]);
        setProjects([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const ids = scopeKey.split(',');
        // Each company answers for itself; a company that refuses invoices just has no figures.
        const [contactData, invoiceData, projectData] = await Promise.all([
          fanOut(ids, (id) => getContacts(id, 'Client')),
          fanOut(ids, (id) => getInvoices(id)),
          isModuleOn(selectedCompany, 'projects') ? getProjects() : Promise.resolve([] as Awaited<ReturnType<typeof getProjects>>),
        ]);
        if (!cancelled) {
          setContacts(contactData.rows);
          setMissing(contactData.missing);
          setInvoices(invoiceData.rows);
          setProjects(projectData.filter((p: Project) => ids.includes(p.companyId)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedCompany, scopeKey]);

  const contactMetrics = React.useMemo(() => {
    const map = new Map<string, { invoiceCount: number; outstanding: number; total: number }>();
    contacts.forEach((contact: Contact) => {
      const lookupId = contact.clientId || contact.id;
      const clientInvoices = invoices.filter((inv: Invoice) => inv.clientId === lookupId);
      const total = clientInvoices.reduce((sum: number, inv: Invoice) => sum + inCompanyCurrency(inv.total, inv.exchangeRate), 0);
      const outstanding = clientInvoices.reduce((sum: number, inv: Invoice) => sum + inCompanyCurrency(inv.outstandingAmount, inv.exchangeRate), 0);
      map.set(contact.id, { invoiceCount: clientInvoices.length, outstanding, total });
    });
    return map;
  }, [contacts, invoices]);

  // What is still owed (after payments and credit notes), per company currency: never added across currencies.
  const outstanding = React.useMemo(
    () => sumByCurrency(
      invoices.filter((inv: Invoice) => inv.status === 'Sent' || inv.status === 'Overdue'),
      (inv) => currencyOf(inv.companyId),
      (inv) => inCompanyCurrency(inv.outstandingAmount ?? inv.total, inv.exchangeRate),
      currencyOf(selectedCompany?.id ?? ''),
    ),
    [invoices, currencyOf, selectedCompany],
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
    if (!createTarget.target || !form.name.trim()) return;
    setSaving(true);
    try {
      const contact = await createContact({
        companyId: createTarget.target,
        ...buildContactPayload(form, { customFields: createCustomValues, lockedRole: 'Client' }),
      });
      setContacts((prev: Contact[]) => [...prev, contact]);
      setOpenCreate(false);
      setForm(emptyContactForm());
      setCreateCustomValues({});
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
        <div className="flex flex-wrap items-center gap-2">
        <CreateTargetSelect {...createTarget} />
        {createTarget.target && <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 me-1" />{t('clients.addClient')}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('clients.createTitle')}</DialogTitle>
            </DialogHeader>
            <ContactFormFields form={form} setForm={setForm} lockedRole="Client" />
            {customFieldDefs.length > 0 && (
              <div className="border-t pt-3">
                <CustomFieldsForm
                  definitions={customFieldDefs}
                  values={createCustomValues}
                  onChange={setCreateCustomValues}
                />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCreate(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleCreate} disabled={saving || !form.name.trim()}>{t('common.save')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>}
        </div>
      }
    >
      <MissingCompanies missing={missing} />
      <div className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold"><CurrencyTotals totals={outstanding} /></div>}
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
              {canManagePortal && <TableHead className="text-end">{language === 'ar' ? 'البوابة' : 'Portal'}</TableHead>}
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
                      <span>{c.name}<CompanyLabel companyId={c.companyId} /></span>
                    </div>
                  </TableCell>
                  <TableCell>{c.contactPerson ?? '—'}</TableCell>
                  <TableCell>{c.email ?? '—'}</TableCell>
                  <TableCell>{c.phone ?? '—'}</TableCell>
                  <TableCell className="text-end">{metrics?.invoiceCount ?? 0}</TableCell>
                  <TableCell className="text-end">
                    {metrics?.outstanding ? (
                      <Badge variant="outline" className="text-orange-600 dark:text-orange-400">{amountIn(metrics.outstanding, currencyOf(c.companyId))}</Badge>
                    ) : '—'}
                  </TableCell>
                  {canManagePortal && (
                    <TableCell className="text-end">
                      <Button size="sm" variant="ghost" onClick={() => setPortalFor(c)}>
                        {language === 'ar' ? 'الوصول' : 'Access'}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Sheet open={!!portalFor} onOpenChange={(open) => !open && setPortalFor(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{portalFor?.name}</SheetTitle>
          </SheetHeader>
          {portalFor && <PortalAccessPanel contact={portalFor} audience="client" />}
        </SheetContent>
      </Sheet>
    </SectionPageShell>
  );
}
