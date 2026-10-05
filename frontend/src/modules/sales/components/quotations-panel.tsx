'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { FileText, MoreHorizontal, PlusCircle, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { usePermissionOr } from '@/context/permissions-context';
import { useToast } from '@/hooks/use-toast';
import { CurrencyAmount, useCompanyCurrency } from '@/lib/currency';
import type { InvoiceTemplate, Quotation, QuotationStatus } from '@/modules/finance/types';
import { chooseTemplateId } from '@/modules/finance/template-selection';
import type { InventoryItem } from '@/modules/operations/types';
import { getContacts, type Contact } from '@/services/contactService';
import { getInvoiceTemplates } from '@/services/financeService';
import { getInventoryItems } from '@/services/operationsService';
import {
  convertQuotationToInvoice, convertQuotationToSalesOrder, createQuotation, deleteQuotation, getQuotations,
  setQuotationStatus, updateQuotation,
} from '@/services/quotationService';
import { SalesLineItemsEditor, emptyItemRow, formItemsTotal, itemsToForm, prepareItems, type SalesItemForm } from './sales-line-items';

const statusStyles: Record<QuotationStatus, string> = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  Sent: 'bg-blue-100 text-blue-700 border-blue-200',
  Accepted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Declined: 'bg-red-100 text-red-700 border-red-200',
  Expired: 'bg-amber-100 text-amber-800 border-amber-200',
};

const STATUSES: QuotationStatus[] = ['Draft', 'Sent', 'Accepted', 'Declined', 'Expired'];

type QuoteForm = {
  contactId: string;
  issueDate: string;
  validUntil: string;
  taxRate: string;
  templateId: string;
  notes: string;
  items: SalesItemForm[];
};

const blankForm = (): QuoteForm => ({
  contactId: '',
  issueDate: format(new Date(), 'yyyy-MM-dd'),
  validUntil: format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'),
  taxRate: '0',
  templateId: '',
  notes: '',
  items: [emptyItemRow()],
});

/**
 * Quotations: the whole list on the sales page, or one opportunity's own when
 * `opportunityId` is given (the client then comes from the opportunity).
 */
export function QuotationsPanel({ opportunityId, compact = false }: { opportunityId?: string; compact?: boolean }) {
  const { selectedCompany, currentRole } = useCompany();
  const { t, language } = useI18n();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { money } = useCompanyCurrency();
  const canManage = usePermissionOr('sales', 'write', currentRole !== 'Employee');
  const locale = language === 'ar' ? 'ar-u-nu-latn' : 'en-GB';
  const companyId = selectedCompany?.id || '';

  const [quotes, setQuotes] = React.useState<Quotation[]>([]);
  const [clients, setClients] = React.useState<Contact[]>([]);
  const [inventory, setInventory] = React.useState<InventoryItem[]>([]);
  const [quoteTemplates, setQuoteTemplates] = React.useState<InvoiceTemplate[]>([]);
  const [invoiceTemplates, setInvoiceTemplates] = React.useState<InvoiceTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | QuotationStatus>('all');
  const [editing, setEditing] = React.useState<Quotation | 'new' | null>(null);
  const [form, setForm] = React.useState<QuoteForm>(blankForm);
  const [saving, setSaving] = React.useState(false);
  const [invoicing, setInvoicing] = React.useState<Quotation | null>(null);
  const [invoiceTemplateId, setInvoiceTemplateId] = React.useState('');

  const load = React.useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [quoteData, clientData, itemData, quoteTemplateData, invoiceTemplateData] = await Promise.all([
        getQuotations(companyId, { opportunityId }),
        opportunityId ? Promise.resolve([] as Contact[]) : getContacts(companyId, 'Client'),
        getInventoryItems(companyId),
        getInvoiceTemplates(companyId, 'quote'),
        getInvoiceTemplates(companyId, 'invoice'),
      ]);
      setQuotes(quoteData);
      setClients(clientData);
      setInventory(itemData);
      setQuoteTemplates(quoteTemplateData);
      setInvoiceTemplates(invoiceTemplateData);
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('quotes.unavailable'), description: error?.message });
    } finally {
      setLoading(false);
    }
  }, [companyId, opportunityId, toast, t]);

  React.useEffect(() => { load(); }, [load]);

  const clientName = React.useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => { map.set(c.id, c.name); if (c.clientId) map.set(c.clientId, c.name); });
    return (quote: Quotation) => map.get(quote.contactId || '') || map.get(quote.clientId) || '';
  }, [clients]);
  const inventoryMap = React.useMemo(() => new Map(inventory.map((item) => [item.id, item])), [inventory]);

  const shown = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return quotes.filter((quote) => {
      const matchesQuery = !query || [quote.quoteNumber, clientName(quote), quote.notes || '', ...quote.items.map((i) => i.description)]
        .some((value) => value.toLowerCase().includes(query));
      return matchesQuery && (statusFilter === 'all' || quote.status === statusFilter);
    });
  }, [quotes, search, statusFilter, clientName]);

  const dateLabel = (value: Date) => value.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const statusLabel = (status: QuotationStatus) => t(`quotes.status.${status}`);

  const openNew = () => { setForm({ ...blankForm(), templateId: chooseTemplateId(quoteTemplates) }); setEditing('new'); };
  const openEdit = (quote: Quotation) => {
    setForm({
      contactId: quote.contactId || quote.clientId,
      issueDate: format(quote.issueDate, 'yyyy-MM-dd'),
      validUntil: format(quote.validUntil, 'yyyy-MM-dd'),
      taxRate: String(quote.taxRate),
      templateId: quote.templateId || '',
      notes: quote.notes || '',
      items: itemsToForm(quote.items),
    });
    setEditing(quote);
  };

  const subtotal = formItemsTotal(form.items);
  const vat = Math.round(subtotal * (Number(form.taxRate) || 0)) / 100;

  const save = async () => {
    const items = prepareItems(form.items, inventoryMap);
    if ((!opportunityId && !form.contactId) || !items.length) {
      toast({ variant: 'destructive', title: t('quotes.missingClient') });
      return;
    }
    const contact = clients.find((c) => c.id === form.contactId);
    const payload = {
      issueDate: new Date(form.issueDate),
      validUntil: new Date(form.validUntil),
      items,
      taxRate: Number(form.taxRate) || 0,
      notes: form.notes || undefined,
      templateId: form.templateId || undefined,
    };
    setSaving(true);
    try {
      if (editing === 'new') {
        await createQuotation(companyId, opportunityId
          ? { ...payload, opportunityId }
          : { ...payload, contactId: contact ? contact.id : undefined, clientId: contact?.clientId || form.contactId });
      } else if (editing) {
        await updateQuotation(editing.id, opportunityId ? payload : { ...payload, clientId: contact?.clientId || form.contactId });
      }
      setEditing(null);
      await load();
      toast({ title: t('quotes.saved') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('quotes.saveFailed'), description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const run = async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      await load();
      if (success) toast({ title: success });
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('quotes.updateFailed'), description: error?.message });
    }
  };

  const move = (quote: Quotation, status: QuotationStatus) => run(() => setQuotationStatus(quote.id, status));
  const toOrder = (quote: Quotation) => run(async () => {
    const order = await convertQuotationToSalesOrder(quote.id);
    toast({ title: t('quotes.orderCreated', undefined, { number: order.orderNumber }) });
  });
  const remove = async (quote: Quotation) => {
    if (!(await confirm({
      title: t('quotes.deleteTitle'),
      description: t('quotes.deleteDesc', undefined, { number: quote.quoteNumber }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    }))) return;
    await run(() => deleteQuotation(quote.id), t('quotes.deleted'));
  };
  const invoice = async () => {
    if (!invoicing) return;
    const quote = invoicing;
    await run(async () => {
      const created = await convertQuotationToInvoice(quote.id, { templateId: invoiceTemplateId || undefined });
      toast({ title: t('quotes.invoiceCreated', undefined, { number: created.invoiceNumber }) });
    });
    setInvoicing(null);
  };

  const converted = (quote: Quotation) => Boolean(quote.salesOrderId || quote.invoiceId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {!compact && (
          <>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('quotes.searchPlaceholder')} className="max-w-xs" />
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | QuotationStatus)}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('quotes.allStatuses')}</SelectItem>
                {STATUSES.map((status) => <SelectItem key={status} value={status}>{statusLabel(status)}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}
        {canManage && (
          <Button className="ms-auto" size={compact ? 'sm' : 'default'} onClick={openNew} disabled={!opportunityId && !clients.length}>
            <PlusCircle className="me-2 h-4 w-4" />{t('quotes.new')}
          </Button>
        )}
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('quotes.loading')}</p>
      ) : quotes.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center">
          <p className="font-medium">{opportunityId ? t('quotes.emptyOpportunity') : t('quotes.empty')}</p>
          {!opportunityId && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t('quotes.emptyBody')}</p>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('quotes.number')}</TableHead>
                {!opportunityId && <TableHead>{t('quotes.client')}</TableHead>}
                <TableHead>{t('quotes.validUntil')}</TableHead>
                <TableHead className="text-end">{t('quotes.total')}</TableHead>
                <TableHead>{t('quotes.status')}</TableHead>
                <TableHead className="text-end">{t('quotes.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell className="font-medium"><bdi>{quote.quoteNumber}</bdi></TableCell>
                  {!opportunityId && <TableCell><bdi>{clientName(quote) || t('quotes.client.unknown')}</bdi></TableCell>}
                  <TableCell>
                    <div className="text-sm">{dateLabel(quote.validUntil)}</div>
                    <div className="text-xs text-muted-foreground">{dateLabel(quote.issueDate)}</div>
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    <CurrencyAmount value={quote.totalAmount} currencyCode={quote.currency as any} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusStyles[quote.status]}>{statusLabel(quote.status)}</Badge>
                    {quote.salesOrderId && <div className="mt-1 text-xs text-muted-foreground">{t('quotes.convertedOrder')}</div>}
                    {quote.invoiceId && <div className="mt-1 text-xs text-muted-foreground">{t('quotes.convertedInvoice')}</div>}
                    {quote.status === 'Expired' && <div className="mt-1 max-w-[14rem] text-xs text-muted-foreground">{t('quotes.expiredHint')}</div>}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-2">
                      {quote.status === 'Accepted' && !converted(quote) && canManage && (
                        <Button size="sm" onClick={() => toOrder(quote)}>{t('quotes.toOrder')}</Button>
                      )}
                      {(quote.status === 'Draft' || quote.status === 'Sent') && canManage && (
                        <Button size="sm" variant="outline" onClick={() => move(quote, 'Accepted')}>{t('quotes.accept')}</Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => window.open(`/quotation/${quote.id}`, '_blank', 'noopener')} aria-label={t('quotes.print')}>
                        <Printer className="h-4 w-4" />
                      </Button>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" aria-label={t('quotes.more')}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!converted(quote) && quote.status !== 'Accepted' && quote.status !== 'Declined' && (
                              <DropdownMenuItem onClick={() => openEdit(quote)}>{t('quotes.edit')}</DropdownMenuItem>
                            )}
                            {(quote.status === 'Draft' || quote.status === 'Expired') && (
                              <DropdownMenuItem onClick={() => move(quote, 'Sent')}>{t('quotes.markSent')}</DropdownMenuItem>
                            )}
                            {(quote.status === 'Draft' || quote.status === 'Sent') && (
                              <DropdownMenuItem onClick={() => move(quote, 'Declined')}>{t('quotes.decline')}</DropdownMenuItem>
                            )}
                            {quote.status === 'Accepted' && !converted(quote) && (
                              <DropdownMenuItem onClick={() => { setInvoiceTemplateId(chooseTemplateId(invoiceTemplates)); setInvoicing(quote); }}>
                                <FileText className="me-2 h-4 w-4" />{t('quotes.toInvoice')}
                              </DropdownMenuItem>
                            )}
                            {(quote.status === 'Accepted' || quote.status === 'Declined') && !converted(quote) && (
                              <DropdownMenuItem onClick={() => move(quote, 'Draft')}>{t('quotes.reopen')}</DropdownMenuItem>
                            )}
                            {!converted(quote) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={() => remove(quote)}>{t('common.delete')}</DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editing === 'new' || !editing ? t('quotes.new') : t('quotes.editTitle', undefined, { number: editing.quoteNumber })}
            </DialogTitle>
            <DialogDescription>{t('quotes.createDescription')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            {!opportunityId && (
              <div className="space-y-1 sm:col-span-2">
                <Label>{t('quotes.client')}</Label>
                <Combobox
                  options={clients.map((c) => ({ value: c.id, label: c.name }))}
                  value={form.contactId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, contactId: value }))}
                  placeholder={t('sales.selectClient')}
                  searchPlaceholder={t('sales.selectClient')}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="quote-date">{t('quotes.issueDate')}</Label>
              <Input id="quote-date" type="date" value={form.issueDate} onChange={(e) => setForm((prev) => ({ ...prev, issueDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quote-valid">{t('quotes.validUntil')}</Label>
              <Input id="quote-valid" type="date" min={form.issueDate} value={form.validUntil} onChange={(e) => setForm((prev) => ({ ...prev, validUntil: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quote-vat">{t('quotes.vat')}</Label>
              <Input id="quote-vat" type="number" min="0" max="100" step="0.01" className="text-end" value={form.taxRate} onChange={(e) => setForm((prev) => ({ ...prev, taxRate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t('quotes.template')}</Label>
              <Select value={form.templateId || 'default'} onValueChange={(value) => setForm((prev) => ({ ...prev, templateId: value === 'default' ? '' : value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t('quotes.defaultTemplate')}</SelectItem>
                  {quoteTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <SalesLineItemsEditor rows={form.items} onChange={(rows) => setForm((prev) => ({ ...prev, items: rows }))} inventory={inventory} />
          <dl className="ms-auto grid w-full max-w-xs grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t('quotes.subtotal')}</dt><dd className="text-end tabular-nums">{money(subtotal)}</dd>
            <dt className="text-muted-foreground">{t('quotes.vatAmount')}</dt><dd className="text-end tabular-nums">{money(vat)}</dd>
            <dt className="font-medium">{t('quotes.total')}</dt><dd className="text-end font-semibold tabular-nums">{money(subtotal + vat)}</dd>
          </dl>
          <div className="space-y-1">
            <Label htmlFor="quote-notes">{t('quotes.notes')}</Label>
            <Textarea id="quote-notes" dir="auto" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button onClick={save} disabled={saving}>{saving ? t('common.loading') : t('quotes.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(invoicing)} onOpenChange={(open) => { if (!open) setInvoicing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('quotes.invoiceTitle')}</DialogTitle>
            <DialogDescription>{invoicing ? <bdi>{invoicing.quoteNumber}</bdi> : null}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t('finance.invoiceTemplate')}</Label>
            <Select value={invoiceTemplateId} onValueChange={setInvoiceTemplateId}>
              <SelectTrigger><SelectValue placeholder={t('createInvoice.selectTemplate')} /></SelectTrigger>
              <SelectContent>
                {invoiceTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoicing(null)}>{t('common.cancel')}</Button>
            <Button onClick={invoice}>{t('quotes.toInvoice')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
