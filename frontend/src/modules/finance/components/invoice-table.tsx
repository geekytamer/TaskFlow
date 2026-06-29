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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlusCircle, AlertTriangle, Download, ListChecks, Eye, Printer, Undo2, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCompany } from '@/context/company-context';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  bulkUpdateInvoiceStatus,
  createPayment,
  reversePayment,
  downloadInvoicePdf,
  createCreditNote,
  getInvoices,
  getInvoiceTemplates,
  getPayments,
  updateInvoiceStatus,
  deleteInvoice,
} from '@/services/financeService';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type { Client, Invoice, InvoiceStatus, InvoiceTemplate, Payment } from '../types';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getTasks } from '@/services/projectService';
import type { Task } from '@/modules/projects/types';
import { format } from 'date-fns';
import { getClients } from '@/services/financeService';
import { CreateInvoiceSheet } from './create-invoice-sheet';
import { downloadCsv } from '@/modules/finance/lib/csv';
import { useI18n } from '@/context/i18n-context';
import { SectionToolbar } from '@/modules/operations/components/section-toolbar';
import { RecordSupportPanel } from '@/modules/shared/components/record-support-panel';
import { InvoiceDocument } from './invoice-document';
import { InvoiceCommissionsPanel } from './invoice-commissions-panel';
import { useCompanyCurrency } from '@/lib/currency';
import { getCampaigns, type CrmCampaign } from '@/services/crmService';
import { useAuthGuard } from '@/hooks/use-auth-guard';

export function InvoiceTable() {
  const { selectedCompany } = useCompany();
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [templates, setTemplates] = React.useState<InvoiceTemplate[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [campaigns, setCampaigns] = React.useState<CrmCampaign[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | InvoiceStatus>('all');
  const [paymentDialog, setPaymentDialog] = React.useState<{ open: boolean; invoice?: Invoice }>({ open: false });
  const [previewInvoice, setPreviewInvoice] = React.useState<Invoice | null>(null);
  const [pdfPending, setPdfPending] = React.useState(false);
  const [creditDialog, setCreditDialog] = React.useState<{ open: boolean; invoice?: Invoice }>({ open: false });
  const [creditAmount, setCreditAmount] = React.useState('');
  const [creditReason, setCreditReason] = React.useState('');
  const [creditPending, setCreditPending] = React.useState(false);
  const [paymentAmount, setPaymentAmount] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState('');
  const [paymentNote, setPaymentNote] = React.useState('');
  const [payments, setPayments] = React.useState<Payment[]>([]);
  const [paymentLoading, setPaymentLoading] = React.useState(false);
  const [reversingPaymentId, setReversingPaymentId] = React.useState<string | null>(null);
  const { toast } = useToast();
  const confirm = useConfirm();
  const { t, language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { money, amount } = useCompanyCurrency();
  const { effectiveRole } = useAuthGuard();
  const canManageFinance = effectiveRole !== 'Employee';

  const fetchData = React.useCallback(async () => {
    if (!selectedCompany) {
      setInvoices([]);
      setClients([]);
      setTemplates([]);
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [invoiceData, clientData, templateData, taskData, campaignData] = await Promise.all([
        getInvoices(selectedCompany.id),
        getClients(selectedCompany.id),
        getInvoiceTemplates(selectedCompany.id),
        getTasks(),
        getCampaigns(selectedCompany.id, true),
      ]);
      setInvoices(invoiceData);
      setClients(clientData);
      setTemplates(templateData);
      setTasks(taskData.filter((t) => t.companyId === selectedCompany.id));
      setCampaigns(campaignData);
    } catch (error: any) {
      setInvoices([]);
      setClients([]);
      setTemplates([]);
      setTasks([]);
      toast({
        variant: 'destructive',
        title: t('invoiceTable.toastErrorTitle'),
        description: error?.message || t('invoiceTable.toastLoadInvoicesFailed'),
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast, t]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getClientName = (clientId: string, contactId?: string) => {
    return clients.find(c => c.id === clientId || c.id === contactId)?.name || tr('N/A', 'غير متاح');
  };

  const getTaskTitle = (taskId?: string) =>
    taskId ? tasks.find((task) => task.id === taskId)?.title || taskId : undefined;

  const getTemplateName = (templateId?: string) =>
    templateId ? templates.find((template) => template.id === templateId)?.name || tr('Custom', 'مخصص') : tr('Default', 'افتراضي');

  const getTemplate = (templateId?: string) =>
    (templateId ? templates.find((template) => template.id === templateId) : undefined)
    || templates.find((template) => template.isDefault)
    || templates[0];

  const getCampaignName = (campaignId?: string) =>
    campaignId ? campaigns.find((campaign) => campaign.id === campaignId)?.name || campaignId : undefined;

  const handleDownloadPdf = async (invoice: Invoice) => {
    setPdfPending(true);
    try {
      await downloadInvoicePdf(invoice.id, invoice.invoiceNumber, language);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: t('invoiceTable.pdfErrorTitle'),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPdfPending(false);
    }
  };

  const openCreditDialog = (invoice: Invoice) => {
    const outstanding = invoice.outstandingAmount ?? invoice.total;
    setCreditDialog({ open: true, invoice });
    setCreditAmount(outstanding > 0 ? String(outstanding) : '');
    setCreditReason('');
  };

  const submitCreditNote = async () => {
    const invoice = creditDialog.invoice;
    if (!invoice || !selectedCompany) return;
    const amount = Number(creditAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ variant: 'destructive', title: t('invoiceTable.creditInvalid') });
      return;
    }
    setCreditPending(true);
    try {
      await createCreditNote(selectedCompany.id, {
        invoiceId: invoice.id,
        reason: creditReason.trim() || undefined,
        lineItems: [{ description: creditReason.trim() || t('invoiceTable.creditDefaultLine'), amount }],
      });
      toast({ title: t('invoiceTable.creditCreated') });
      setCreditDialog({ open: false });
      await fetchData();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: t('invoiceTable.creditError'),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCreditPending(false);
    }
  };

  const getOriginLabel = (invoice: Invoice, item: Invoice['lineItems'][number]) => {
    if (item.taskId) return getTaskTitle(item.taskId);
    if (invoice.campaignId) return t('invoiceTable.campaignPrefix').replace('{name}', getCampaignName(invoice.campaignId) || '');
    return item.description;
  };

  const filteredInvoices = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    return invoices.filter((invoice) => {
      if (statusFilter !== 'all' && invoice.status !== statusFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const taskText = invoice.lineItems
        .map((item) => (item.taskId ? getTaskTitle(item.taskId) : item.description) || '')
        .join(' ');

      return [
        invoice.invoiceNumber,
        getClientName(invoice.clientId, invoice.contactId),
        invoice.status,
        taskText,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [invoices, search, statusFilter, tasks, clients, campaigns]);

  const filteredOutstanding = React.useMemo(
    () => filteredInvoices.reduce((sum, invoice) => sum + (invoice.outstandingAmount || 0), 0),
    [filteredInvoices],
  );

  const handleStatusChange = async (invoiceId: string, status: InvoiceStatus) => {
    try {
      await updateInvoiceStatus(invoiceId, status);
      await fetchData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('invoiceTable.toastUpdateFailedTitle'),
        description: error?.message || t('invoiceTable.toastUpdateFailedDesc'),
      });
    }
  };

  const handleBulkStatus = async (targetStatus: InvoiceStatus, currentStatus: InvoiceStatus) => {
    if (!selectedCompany) return;
    try {
      const result = await bulkUpdateInvoiceStatus(selectedCompany.id, targetStatus, {
        currentStatus,
      });
      await fetchData();
      toast({
        title: t('invoiceTable.toastBulkCompleteTitle'),
        description: t('invoiceTable.toastBulkCompleteDesc')
          .replace('{count}', String(result.updatedCount))
          .replace('{status}', targetStatus),
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('invoiceTable.toastBulkFailedTitle'),
        description: error?.message || t('invoiceTable.toastBulkFailedDesc'),
      });
    }
  };

  const openPaymentDialog = async (invoice: Invoice) => {
    setPaymentDialog({ open: true, invoice });
    setPaymentAmount(String(invoice.outstandingAmount || 0));
    setPaymentMethod('');
    setPaymentNote('');
    setPayments([]);
    setReversingPaymentId(null);
    setPaymentLoading(true);
    try {
      const paymentHistory = await getPayments(invoice.id);
      setPayments(paymentHistory);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('invoiceTable.toastPaymentsUnavailableTitle'),
        description: error?.message || t('invoiceTable.toastPaymentsUnavailableDesc'),
      });
    } finally {
      setPaymentLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('invoiceTable.colNumber')}</TableHead>
              <TableHead>{t('invoiceTable.colClient')}</TableHead>
              <TableHead>{t('invoiceTable.colIssueDate')}</TableHead>
              <TableHead>{t('invoiceTable.colDueDate')}</TableHead>
              <TableHead>{t('invoiceTable.colTemplate')}</TableHead>
              <TableHead>{t('invoiceTable.colTotal')}</TableHead>
              <TableHead>{t('invoiceTable.colStatus')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(3)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (!selectedCompany) {
    return (
      <div className="rounded-lg border">
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          {t('invoiceTable.selectCompany')}
        </div>
      </div>
    );
  }

  return (
    <>
      <SectionToolbar
        search={(
          <Input
            data-tutorial="invoice-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('invoiceTable.searchPlaceholder')}
            className="max-w-md"
          />
        )}
        filters={(
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as 'all' | InvoiceStatus)}
          >
            <SelectTrigger className="w-[180px]" data-tutorial="invoice-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('invoiceTable.allStatuses')}</SelectItem>
              {(['Draft', 'Sent', 'Paid', 'Overdue'] as InvoiceStatus[]).map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`invoiceTable.status${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        summary={t('invoiceTable.invoicesSummary').replace('{count}', String(filteredInvoices.length)).replace('{amount}', money(filteredOutstanding))}
        actions={(
          <div data-tutorial="invoice-bulk-actions" className="flex items-center gap-2">
            {canManageFinance && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleBulkStatus('Sent', 'Draft')
                  }
                >
                  <ListChecks className="me-2 h-4 w-4" />
                  {t('finance.sendAllDraft')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleBulkStatus('Paid', 'Sent')}>
                  <ListChecks className="me-2 h-4 w-4" />
                  {t('finance.markAllSentPaid')}
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  `invoices-${format(new Date(), 'yyyy-MM-dd')}.csv`,
                  [
                    'invoiceNumber',
                    'client',
                    'issueDate',
                    'dueDate',
                    'total',
                    'status',
                    'currency',
                  ],
                  filteredInvoices.map((invoice) => [
                    invoice.invoiceNumber,
                    getClientName(invoice.clientId, invoice.contactId),
                    invoice.issueDate.toISOString(),
                    invoice.dueDate.toISOString(),
                    invoice.total,
                    invoice.status,
                    invoice.currency || 'USD',
                  ]),
                )
              }
            >
              <Download className="me-2 h-4 w-4" />
              {t('finance.exportCsv')}
            </Button>
            {canManageFinance && (
              <CreateInvoiceSheet
                open={isSheetOpen}
                onOpenChange={setIsSheetOpen}
                onInvoiceCreated={fetchData}
              >
                <Button data-tutorial="invoice-create-btn">
                  <PlusCircle className="me-2 h-4 w-4" />
                  {t('finance.createInvoice')}
                </Button>
              </CreateInvoiceSheet>
            )}
          </div>
        )}
      />
      <div className="overflow-x-auto rounded-lg border" data-tutorial="invoice-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('invoiceTable.colNumber')}</TableHead>
              <TableHead>{t('invoiceTable.colClient')}</TableHead>
              <TableHead>{t('invoiceTable.colIssueDate')}</TableHead>
              <TableHead>{t('invoiceTable.colDueDate')}</TableHead>
              <TableHead>{t('invoiceTable.colTemplate')}</TableHead>
              <TableHead className="text-end">{t('invoiceTable.colTotal')}</TableHead>
              <TableHead className="text-end">{t('invoiceTable.colPaid')}</TableHead>
              <TableHead className="text-end">{t('invoiceTable.colOutstanding')}</TableHead>
              <TableHead>{t('invoiceTable.colStatus')}</TableHead>
              <TableHead>{t('invoiceTable.colOrigin')}</TableHead>
              <TableHead className="text-end">{t('invoiceTable.colActions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInvoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                <TableCell>{getClientName(invoice.clientId, invoice.contactId)}</TableCell>
                <TableCell>{format(invoice.issueDate, 'MMM d, yyyy')}</TableCell>
                <TableCell>{format(invoice.dueDate, 'MMM d, yyyy')}</TableCell>
                <TableCell>{getTemplateName(invoice.templateId)}</TableCell>
                <TableCell className="text-end">{amount(invoice.total)}</TableCell>
                <TableCell className="text-end">{amount(invoice.paidAmount || 0)}</TableCell>
                <TableCell className="text-end">{amount(invoice.outstandingAmount || 0)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {canManageFinance ? (
                      <Select
                        value={invoice.status}
                        onValueChange={(value) => handleStatusChange(invoice.id, value as InvoiceStatus)}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(['Draft', 'Sent', 'Paid', 'Overdue'] as InvoiceStatus[]).map((status) => (
                            <SelectItem key={status} value={status}>
                              {t(`invoiceTable.status${status}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{t(`invoiceTable.status${invoice.status}`)}</Badge>
                    )}
                    {invoice.status !== 'Paid' && invoice.dueDate < new Date() && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {t('invoiceTable.overdueBadge')}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {invoice.lineItems.map((item, index) => (
                      <Badge key={`${item.taskId || invoice.campaignId || item.description}-${index}`} variant="outline">
                        {getOriginLabel(invoice, item)}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-end">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewInvoice(invoice)}
                    >
                      <Eye className="me-2 h-4 w-4" />
                      {t('invoiceTable.previewBtn')}
                    </Button>
                    {canManageFinance && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        if (!(await confirm({
                          title: t('invoiceTable.deleteInvoiceTitle', 'Delete invoice?'),
                          description: t('invoiceTable.deleteInvoiceDesc', 'Delete invoice {number}? This cannot be undone.').replace('{number}', invoice.invoiceNumber),
                          confirmText: t('common.delete'),
                          cancelText: t('common.cancel'),
                          destructive: true,
                        }))) return;
                        try {
                          await deleteInvoice(invoice.id);
                          await fetchData();
                          toast({ title: t('invoiceTable.toastInvoiceDeleted', 'Invoice deleted') });
                        } catch (error: any) {
                          toast({ variant: 'destructive', title: t('invoiceTable.toastInvoiceDeleteFailed', 'Could not delete invoice'), description: error?.message });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    )}
                    {canManageFinance && (
                    <Dialog
                      open={paymentDialog.open && paymentDialog.invoice?.id === invoice.id}
                      onOpenChange={(open) => {
                        if (!open) {
                          setPaymentDialog({ open: false });
                          setPayments([]);
                        } else {
                          openPaymentDialog(invoice);
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            invoice.status === 'Draft'
                            || ((invoice.outstandingAmount || 0) <= 0 && (invoice.paidAmount || 0) <= 0)
                          }
                        >
                          {(invoice.paidAmount || 0) > 0
                            ? t('invoiceTable.managePaymentsBtn')
                            : t('invoiceTable.recordPaymentBtn')}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>
                            {(invoice.paidAmount || 0) > 0
                              ? t('invoiceTable.managePaymentsTitle')
                              : t('invoiceTable.recordPaymentTitle')}
                          </DialogTitle>
                          <p className="text-sm text-muted-foreground">
                            {invoice.invoiceNumber} — {getClientName(invoice.clientId, invoice.contactId)}
                          </p>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                          {(invoice.outstandingAmount || 0) > 0 && (
                            <>
                              <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-md border p-3 text-sm">
                                  <div className="text-muted-foreground">{t('invoiceTable.invoiceTotalLabel')}</div>
                                  <div className="text-lg font-semibold">{amount(invoice.total)}</div>
                                </div>
                                <div className="rounded-md border p-3 text-sm">
                                  <div className="text-muted-foreground">{t('invoiceTable.paidLabel')}</div>
                                  <div className="text-lg font-semibold">{amount(invoice.paidAmount || 0)}</div>
                                </div>
                                <div className="rounded-md border p-3 text-sm">
                                  <div className="text-muted-foreground">{t('invoiceTable.outstandingLabel')}</div>
                                  <div className="text-lg font-semibold">{amount(invoice.outstandingAmount || 0)}</div>
                                </div>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-3">
                                <div className="space-y-1">
                                  <Label>{t('invoiceTable.amountLabel')}</Label>
                                  <Input
                                    type="number"
                                    value={paymentAmount}
                                    onChange={(e) => setPaymentAmount(e.target.value)}
                                    placeholder={t('invoiceTable.amountPlaceholder')}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>{t('invoiceTable.methodLabel')}</Label>
                                  <Select value={paymentMethod || undefined} onValueChange={setPaymentMethod}>
                                    <SelectTrigger>
                                      <SelectValue placeholder={t('invoiceTable.methodPlaceholder')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Bank Transfer">{t('vendorBills.payMethodBankTransfer')}</SelectItem>
                                      <SelectItem value="Cash">{t('vendorBills.payMethodCash')}</SelectItem>
                                      <SelectItem value="Card">{t('vendorBills.payMethodCard')}</SelectItem>
                                      <SelectItem value="Cheque">{t('vendorBills.payMethodCheque')}</SelectItem>
                                      <SelectItem value="Other">{t('vendorBills.payMethodOther')}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label>{t('invoiceTable.noteLabel')}</Label>
                                  <Input
                                    value={paymentNote}
                                    onChange={(e) => setPaymentNote(e.target.value)}
                                    placeholder={t('invoiceTable.notePlaceholder')}
                                  />
                                </div>
                              </div>
                            </>
                          )}
                          {(invoice.outstandingAmount || 0) <= 0 && payments.length > 0 && (
                            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                              {t('invoiceTable.fullyPaidManageHelp')}
                            </p>
                          )}
                          <div className="rounded-lg border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>{t('invoiceTable.colHistDate')}</TableHead>
                                  <TableHead>{t('invoiceTable.colHistMethod')}</TableHead>
                                  <TableHead>{t('invoiceTable.colHistNote')}</TableHead>
                                  <TableHead className="text-end">{t('invoiceTable.colHistAmount')}</TableHead>
                                  <TableHead className="text-end" />
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {paymentLoading && (
                                  <TableRow>
                                    <TableCell colSpan={5} className="h-16 text-center text-sm text-muted-foreground">
                                      {t('invoiceTable.loadingPayments')}
                                    </TableCell>
                                  </TableRow>
                                )}
                                {!paymentLoading && payments.length === 0 && (
                                  <TableRow>
                                    <TableCell colSpan={5} className="h-16 text-center text-sm text-muted-foreground">
                                      {t('invoiceTable.noPayments')}
                                    </TableCell>
                                  </TableRow>
                                )}
                                {!paymentLoading &&
                                  payments.map((payment) => (
                                    <TableRow key={payment.id}>
                                      <TableCell>{format(payment.paidAt, 'MMM d, yyyy')}</TableCell>
                                      <TableCell>{payment.method || '—'}</TableCell>
                                      <TableCell>{payment.note || '—'}</TableCell>
                                      <TableCell className="text-end">{amount(payment.amount)}</TableCell>
                                      <TableCell className="text-end">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
                                          disabled={reversingPaymentId === payment.id}
                                          onClick={async () => {
                                            if (!(await confirm({
                                              title: t('invoiceTable.reversePaymentTitle'),
                                              description: t('invoiceTable.reversePaymentDesc')
                                                .replace('{amount}', String(payment.amount))
                                                .replace('{number}', invoice.invoiceNumber),
                                              confirmText: t('invoiceTable.reversePaymentConfirm'),
                                              cancelText: t('common.cancel'),
                                              destructive: true,
                                            }))) return;
                                            setReversingPaymentId(payment.id);
                                            try {
                                              const updatedInvoice = await reversePayment(invoice.id, payment.id);
                                              const refreshed = await getPayments(invoice.id);
                                              setPayments(refreshed);
                                              setPaymentDialog({ open: true, invoice: updatedInvoice });
                                              setPaymentAmount(String(updatedInvoice.outstandingAmount || 0));
                                              await fetchData();
                                              toast({ title: t('invoiceTable.toastPaymentReversed') });
                                            } catch (error: any) {
                                              toast({
                                                variant: 'destructive',
                                                title: t('invoiceTable.toastPaymentReverseFailed'),
                                                description: error?.message,
                                              });
                                            } finally {
                                              setReversingPaymentId(null);
                                            }
                                          }}
                                        >
                                          <Undo2 className="h-3.5 w-3.5" />
                                          {t('invoiceTable.reversePaymentBtn')}
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                              </TableBody>
                            </Table>
                          </div>
                          {selectedCompany && (
                            <RecordSupportPanel
                              companyId={selectedCompany.id}
                              entityType="invoice"
                              entityId={invoice.id}
                              title={t('invoiceTable.attachmentsTitle')}
                              compact
                            />
                          )}
                        </div>
                        {(invoice.outstandingAmount || 0) > 0 && (
                        <DialogFooter>
                          <Button
                            onClick={async () => {
                              const amount = Number(paymentAmount);
                              if (!Number.isFinite(amount) || amount <= 0) {
                                toast({
                                  variant: 'destructive',
                                  title: t('invoiceTable.toastInvalidPaymentTitle'),
                                  description: t('invoiceTable.toastInvalidPaymentDesc'),
                                });
                                return;
                              }
                              if (!(await confirm({
                                title: t('invoiceTable.confirmPaymentTitle'),
                                description: t('invoiceTable.confirmPaymentDesc')
                                  .replace('{amount}', String(amount))
                                  .replace('{number}', invoice.invoiceNumber),
                                confirmText: t('invoiceTable.savePayment'),
                                cancelText: t('common.cancel'),
                              }))) return;
                              try {
                                await createPayment(invoice.id, {
                                  amount,
                                  method: paymentMethod || undefined,
                                  note: paymentNote || undefined,
                                });
                                setPaymentDialog({ open: false });
                                setPayments([]);
                                setPaymentAmount('');
                                setPaymentMethod('');
                                setPaymentNote('');
                                await fetchData();
                                toast({ title: t('invoiceTable.toastPaymentRecorded') });
                              } catch (error: any) {
                                toast({
                                  variant: 'destructive',
                                  title: t('invoiceTable.toastPaymentFailedTitle'),
                                  description: error?.message || t('invoiceTable.toastPaymentFailedDesc'),
                                });
                              }
                            }}
                            disabled={!paymentAmount}
                          >
                            {t('invoiceTable.savePayment')}
                          </Button>
                        </DialogFooter>
                        )}
                      </DialogContent>
                    </Dialog>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredInvoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="h-24 text-center text-sm text-muted-foreground">
                  {invoices.length === 0
                    ? t('invoiceTable.noInvoicesYet')
                    : t('invoiceTable.noInvoicesMatch')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog open={Boolean(previewInvoice)} onOpenChange={(open) => !open && setPreviewInvoice(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{t('invoiceTable.previewTitle')}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {t('invoiceTable.previewSubtitle')
                .replace('{number}', previewInvoice?.invoiceNumber || '')
                .replace('{template}', getTemplateName(previewInvoice?.templateId))}
            </p>
          </DialogHeader>
          <div className="invoice-preview-actions flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {t('invoiceTable.printHint')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {canManageFinance && previewInvoice && previewInvoice.status !== 'Draft' && (previewInvoice.outstandingAmount ?? 0) > 0 ? (
                <Button variant="outline" onClick={() => previewInvoice && openCreditDialog(previewInvoice)}>
                  {t('invoiceTable.creditNote')}
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <a href={`/finance/invoices/${previewInvoice?.id}/print?print=1`} target="_blank" rel="noopener noreferrer">
                  <Printer className="me-2 h-4 w-4" />
                  {t('invoiceTable.downloadInvoice')}
                </a>
              </Button>
              <Button
                onClick={() => previewInvoice && handleDownloadPdf(previewInvoice)}
                disabled={pdfPending}
              >
                <Download className="me-2 h-4 w-4" />
                {pdfPending ? t('invoiceTable.pdfPending') : t('invoiceTable.downloadPdf')}
              </Button>
            </div>
          </div>
          {previewInvoice && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/30 p-3">
                <InvoiceDocument
                  invoice={previewInvoice}
                  client={clients.find((client) => client.id === previewInvoice.clientId)}
                  company={selectedCompany}
                  template={previewInvoice.templateSnapshot || getTemplate(previewInvoice.templateId)}
                />
              </div>
              {selectedCompany && (
                <InvoiceCommissionsPanel
                  companyId={selectedCompany.id}
                  invoiceId={previewInvoice.id}
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={creditDialog.open} onOpenChange={(open) => !open && setCreditDialog({ open: false })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('invoiceTable.creditNoteTitle')}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {t('invoiceTable.creditNoteSubtitle').replace('{number}', creditDialog.invoice?.invoiceNumber || '')}
            </p>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>{t('invoiceTable.creditAmount')}</Label>
              <Input
                type="number"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="0.00"
              />
              {creditDialog.invoice ? (
                <p className="text-[11px] text-muted-foreground">
                  {t('invoiceTable.creditOutstanding').replace(
                    '{amount}',
                    String(creditDialog.invoice.outstandingAmount ?? creditDialog.invoice.total),
                  )}
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>{t('invoiceTable.creditReason')}</Label>
              <Input value={creditReason} onChange={(e) => setCreditReason(e.target.value)} placeholder={t('invoiceTable.creditReasonPh')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditDialog({ open: false })}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submitCreditNote} disabled={creditPending}>
              {creditPending ? t('common.saving') : t('invoiceTable.creditNote')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
