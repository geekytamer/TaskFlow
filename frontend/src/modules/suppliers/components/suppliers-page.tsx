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
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/context/company-context';
import { useCompanyCurrency } from '@/lib/currency';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { getContacts, createContact, type Contact } from '@/services/contactService';
import { getSupplierPayables } from '@/services/financeService';
import { getPurchaseOrders } from '@/services/operationsService';
import type { PurchaseOrder } from '@/modules/operations/types';
import type { SupplierPayablesSummary } from '@/modules/finance/types';
import { CustomFieldsForm } from '@/components/ui/custom-fields-form';
import { getCustomFieldDefinitions, type CustomFieldDefinition } from '@/services/customFieldService';
import {
  ContactFormFields,
  emptyContactForm,
  buildContactPayload,
  type ContactForm,
} from '@/modules/contacts/components/contact-form-fields';
import { Building2, User, Plus, Search } from 'lucide-react';

export function SuppliersPage() {
  const { selectedCompany } = useCompany();
  const { amountIn } = useCompanyCurrency();
  const { t } = useI18n();
  const { toast } = useToast();
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [orders, setOrders] = React.useState<PurchaseOrder[]>([]);
  const [payables, setPayables] = React.useState<SupplierPayablesSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [openCreate, setOpenCreate] = React.useState(false);
  const [form, setForm] = React.useState<ContactForm>(emptyContactForm());
  const [customFieldDefs, setCustomFieldDefs] = React.useState<CustomFieldDefinition[]>([]);
  const [createCustomValues, setCreateCustomValues] = React.useState<Record<string, unknown>>({});
  const [saving, setSaving] = React.useState(false);
  // A group shown whole: every company's suppliers; money in each company's currency.
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
        setOrders([]);
        setPayables([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const ids = scopeKey.split(',');
        // Each company answers for itself; one that refuses purchasing just has no figures.
        const [contactData, orderData, payableData] = await Promise.all([
          fanOut(ids, (id) => getContacts(id, 'Vendor')),
          fanOut(ids, (id) => getPurchaseOrders(id)),
          fanOut(ids, (id) => getSupplierPayables(id)),
        ]);
        if (!cancelled) {
          setContacts(contactData.rows);
          setMissing(contactData.missing);
          setOrders(orderData.rows);
          setPayables(payableData.rows);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedCompany, scopeKey]);

  const contactMetrics = React.useMemo(() => {
    const map = new Map<string, { orderCount: number; spend: number }>();
    contacts.forEach((contact: Contact) => {
      const lookupId = contact.supplierId || contact.id;
      const supplierOrders = orders.filter((o: PurchaseOrder) => o.supplierId === lookupId);
      map.set(contact.id, {
        orderCount: supplierOrders.length,
        spend: supplierOrders.reduce((sum: number, o: PurchaseOrder) => sum + o.totalAmount, 0),
      });
    });
    return map;
  }, [contacts, orders]);

  const payablesMap = React.useMemo(() => {
    const map = new Map<string, SupplierPayablesSummary>();
    payables.forEach((p: SupplierPayablesSummary) => map.set(p.supplierId, p));
    return map;
  }, [payables]);

  // Per company currency: never added across currencies.
  const openPayablesTotal = React.useMemo(
    () => sumByCurrency(
      payables as Array<SupplierPayablesSummary & { companyId: string }>,
      (p) => currencyOf(p.companyId),
      (p) => p.openPayables,
      currencyOf(selectedCompany?.id ?? ''),
    ),
    [payables, currencyOf, selectedCompany],
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
        ...buildContactPayload(form, { customFields: createCustomValues, lockedRole: 'Vendor' }),
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
      title={t('sections.suppliers.title')}
      description={t('sections.suppliers.description')}
      actions={
        <div className="flex flex-wrap items-center gap-2">
        <CreateTargetSelect {...createTarget} />
        {createTarget.target && <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 me-1" />{t('suppliers.addSupplier')}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('suppliers.createTitle')}</DialogTitle>
            </DialogHeader>
            <ContactFormFields form={form} setForm={setForm} lockedRole="Vendor" />
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
            <CardTitle className="text-sm font-medium">{t('suppliers.statSuppliers')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-14" /> : <div className="text-2xl font-bold">{contacts.length}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('suppliers.statPurchaseOrders')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-14" /> : <div className="text-2xl font-bold">{orders.length}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('suppliers.statOpenPayables')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold"><CurrencyTotals totals={openPayablesTotal} /></div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('suppliers.statToBill')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-14" /> : (
              <div className="text-2xl font-bold">
                {payables.filter((p: SupplierPayablesSummary) => p.remainingToBill > 0).length}
              </div>
            )}
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
          title={t('suppliers.emptyTitle')}
          description={t('suppliers.emptyDescription')}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('contacts.name')}</TableHead>
              <TableHead>{t('contacts.contactPerson')}</TableHead>
              <TableHead>{t('contacts.email')}</TableHead>
              <TableHead>{t('contacts.phone')}</TableHead>
              <TableHead className="text-end">{t('suppliers.colOrders')}</TableHead>
              <TableHead className="text-end">{t('suppliers.colPayables')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c: Contact) => {
              const metrics = contactMetrics.get(c.id);
              const lookupId = c.supplierId || c.id;
              const payable = payablesMap.get(lookupId);
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
                  <TableCell className="text-end">{metrics?.orderCount ?? 0}</TableCell>
                  <TableCell className="text-end">
                    {payable?.openPayables ? (
                      <Badge variant="outline" className="text-orange-600 dark:text-orange-400">{amountIn(payable.openPayables, currencyOf(c.companyId))}</Badge>
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
