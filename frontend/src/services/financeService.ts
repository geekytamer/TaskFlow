import { apiFetch, getStoredToken } from '@/lib/api-client';
import type {
  AgingBucket,
  ActivityEvent,
  AccountActivityReport,
  Client,
  ClientRevenueSummary,
  CompanyFinanceSettings,
  CompanyNumberingSetting,
  FinanceOverview,
  Expense,
  Invoice,
  CreditNote,
  CreditNoteLineItem,
  InvoiceTemplate,
  InvoiceLineItem,
  InventoryReportSummary,
  JournalEntry,
  JournalEntryLine,
  LedgerAccount,
  LedgerAccountType,
  ManagementReportSummary,
  NumberingEntityType,
  Payment,
  ProfitAndLossReport,
  PurchaseReportSummary,
  PurchaseOrderPayableSummary,
  RecordAttachment,
  RecordEntityType,
  RecordTimelineItem,
  SalesOrder,
  SalesOrderLineItem,
  SalesOrderStatus,
  SupplierSpendSummary,
  SupplierPayablesSummary,
  TrialBalanceReport,
  VendorBill,
  VendorBillPayment,
  VendorBillStatus,
} from '@/modules/finance/types';

const toDate = (value: any) => (value ? new Date(value) : undefined);
const stringId = (value: any) => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.id) return String(value.id);
  return String(value);
};

const mapInvoiceLineItem = (item: any): InvoiceLineItem => {
  const quantity = Number(item?.quantity ?? 1);
  const unitPrice = Number(item?.unitPrice ?? item?.amount ?? 0);
  const fallbackAmount = quantity * unitPrice;
  const amount = Number(item?.amount ?? fallbackAmount);
  const taskId = item?.taskId ? String(item.taskId) : undefined;

  return {
    taskId,
    itemType: item?.itemType === 'Manual' || item?.itemType === 'Task'
      ? item.itemType
      : taskId
        ? 'Task'
        : 'Manual',
    sku: item?.sku ? String(item.sku) : undefined,
    description: String(item?.description || ''),
    quantity: Number.isFinite(quantity) ? quantity : 1,
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    amount: Number.isFinite(amount) ? amount : 0,
  };
};

const mapInvoice = (invoice: any): Invoice => ({
  ...invoice,
  clientId: stringId(invoice.clientId) || '',
  contactId: stringId(invoice.contactId),
  salesOrderId: stringId(invoice.salesOrderId),
  templateId: stringId(invoice.templateId),
  templateSnapshot: invoice.templateSnapshot ? mapInvoiceTemplate(invoice.templateSnapshot) : undefined,
  campaignId: stringId(invoice.campaignId),
  total: Number(invoice.total || 0),
  issueDate: toDate(invoice.issueDate) || new Date(),
  dueDate: toDate(invoice.dueDate) || new Date(),
  lineItems: Array.isArray(invoice.lineItems)
    ? invoice.lineItems.map(mapInvoiceLineItem)
    : [],
  sentAt: toDate(invoice.sentAt),
  paidAt: toDate(invoice.paidAt),
  paidAmount: Number(invoice.paidAmount || 0),
  outstandingAmount: Number(invoice.outstandingAmount || 0),
  creditedAmount: Number(invoice.creditedAmount || 0),
});

const mapSalesOrderLineItem = (item: any): SalesOrderLineItem => {
  const quantity = Number(item?.quantity ?? 0);
  const unitPrice = Number(item?.unitPrice ?? 0);
  const fallbackLineTotal = quantity * unitPrice;
  const lineTotal = Number(item?.lineTotal ?? fallbackLineTotal);

  return {
    inventoryItemId: item?.inventoryItemId ? String(item.inventoryItemId) : undefined,
    sku: item?.sku ? String(item.sku) : undefined,
    description: String(item?.description || ''),
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    lineTotal: Number.isFinite(lineTotal) ? lineTotal : 0,
  };
};

const mapSalesOrder = (order: any): SalesOrder => ({
  ...order,
  orderDate: toDate(order.orderDate) || new Date(),
  expectedDate: toDate(order.expectedDate),
  items: Array.isArray(order.items) ? order.items.map(mapSalesOrderLineItem) : [],
  totalAmount: Number(order.totalAmount || 0),
  invoiceId: order.invoiceId || undefined,
  fulfillmentStatus: order.fulfillmentStatus || 'Unfulfilled',
  deliveredQuantityByLine: Array.isArray(order.deliveredQuantityByLine)
    ? order.deliveredQuantityByLine.map((n: any) => Number(n) || 0)
    : [],
});

const mapDelivery = (delivery: any): import('@/modules/finance/types').Delivery => ({
  ...delivery,
  items: Array.isArray(delivery.items)
    ? delivery.items.map((item: any) => ({
        salesOrderLineIndex: Number(item.salesOrderLineIndex || 0),
        inventoryItemId: item.inventoryItemId || undefined,
        sku: item.sku || undefined,
        description: String(item.description || ''),
        quantity: Number(item.quantity || 0),
        location: item.location || undefined,
      }))
    : [],
  scheduledFor: toDate(delivery.scheduledFor),
  dispatchedAt: toDate(delivery.dispatchedAt),
  deliveredAt: toDate(delivery.deliveredAt),
  cancelledAt: toDate(delivery.cancelledAt),
  createdAt: toDate(delivery.createdAt) || new Date(),
});

const mapInvoiceTemplate = (template: any): InvoiceTemplate => ({
  ...template,
  isDefault: Boolean(template.isDefault),
  qrEnabled: template.qrEnabled === undefined ? true : Boolean(template.qrEnabled),
  qrPosition: (['left', 'center', 'right'].includes(template.qrPosition) ? template.qrPosition : 'center'),
  sectionBreaks: Array.isArray(template.sectionBreaks) ? template.sectionBreaks : undefined,
  watermarkEnabled: template.watermarkEnabled === true,
  watermarkText: template.watermarkText || 'DRAFT',
  watermarkOpacity: Number.isFinite(Number(template.watermarkOpacity))
    ? Number(template.watermarkOpacity)
    : 0.12,
  showCompanyAddress: template.showCompanyAddress !== false,
  showTaxId: template.showTaxId !== false,
  createdAt: toDate(template.createdAt) || new Date(),
  updatedAt: toDate(template.updatedAt) || new Date(),
});

const mapActivityEvent = (event: any): ActivityEvent => ({
  ...event,
  createdAt: toDate(event.createdAt) || new Date(),
});

const mapNumberingSetting = (setting: any): CompanyNumberingSetting => ({
  ...setting,
  padLength: Number(setting.padLength || 1),
  nextNumber: Number(setting.nextNumber || 1),
  updatedAt: toDate(setting.updatedAt) || new Date(),
});

const mapCompanyFinanceSettings = (settings: any): CompanyFinanceSettings => ({
  ...settings,
  fiscalYearStartMonth: Number(settings.fiscalYearStartMonth || 1),
  lockedThroughDate: toDate(settings.lockedThroughDate),
  currencyCode: String(settings.currencyCode || 'USD').toUpperCase(),
  poApprovalThreshold: Number(settings.poApprovalThreshold || 0),
  updatedAt: toDate(settings.updatedAt) || new Date(),
});

const mapRecordAttachment = (attachment: any): RecordAttachment => ({
  ...attachment,
  sizeBytes:
    attachment.sizeBytes === undefined || attachment.sizeBytes === null
      ? undefined
      : Number(attachment.sizeBytes),
  createdAt: toDate(attachment.createdAt) || new Date(),
});

const mapRecordTimelineItem = (item: any): RecordTimelineItem => ({
  ...item,
  createdAt: toDate(item.createdAt) || new Date(),
  activity: item.activity ? mapActivityEvent(item.activity) : undefined,
  attachment: item.attachment ? mapRecordAttachment(item.attachment) : undefined,
});

const mapManagementReportSummary = (summary: any): ManagementReportSummary => ({
  finance: {
    openReceivables: Number(summary?.finance?.openReceivables || 0),
    openPayables: Number(summary?.finance?.openPayables || 0),
    paidThisMonth: Number(summary?.finance?.paidThisMonth || 0),
    paidPayablesThisMonth: Number(summary?.finance?.paidPayablesThisMonth || 0),
    billedThisMonth: Number(summary?.finance?.billedThisMonth || 0),
    expenseReceiptsThisMonth: Number(summary?.finance?.expenseReceiptsThisMonth || 0),
    revenueThisMonth: Number(summary?.finance?.revenueThisMonth || 0),
    expensesThisMonth: Number(summary?.finance?.expensesThisMonth || 0),
    netProfitThisMonth: Number(summary?.finance?.netProfitThisMonth || 0),
  },
  inventory: {
    totalItems: Number(summary?.inventory?.totalItems || 0),
    stockValue: Number(summary?.inventory?.stockValue || 0),
    lowStockCount: Number(summary?.inventory?.lowStockCount || 0),
    outOfStockCount: Number(summary?.inventory?.outOfStockCount || 0),
  },
  purchases: {
    openOrders: Number(summary?.purchases?.openOrders || 0),
    orderedSpend: Number(summary?.purchases?.orderedSpend || 0),
    awaitingReceiptUnits: Number(summary?.purchases?.awaitingReceiptUnits || 0),
    unbilledValue: Number(summary?.purchases?.unbilledValue || 0),
  },
  topClients: Array.isArray(summary?.topClients)
    ? (summary.topClients as ClientRevenueSummary[]).map((client) => ({
        ...client,
        invoiceCount: Number(client.invoiceCount || 0),
        totalBilled: Number(client.totalBilled || 0),
        paidAmount: Number(client.paidAmount || 0),
        outstandingAmount: Number(client.outstandingAmount || 0),
      }))
    : [],
  topSuppliers: Array.isArray(summary?.topSuppliers)
    ? (summary.topSuppliers as SupplierSpendSummary[]).map((supplier) => ({
        ...supplier,
        purchaseOrderCount: Number(supplier.purchaseOrderCount || 0),
        totalOrderedAmount: Number(supplier.totalOrderedAmount || 0),
        totalBilledAmount: Number(supplier.totalBilledAmount || 0),
        openPayables: Number(supplier.openPayables || 0),
        remainingToBill: Number(supplier.remainingToBill || 0),
      }))
    : [],
  lowStockItems: Array.isArray(summary?.lowStockItems) ? summary.lowStockItems : [],
  recentActivity: Array.isArray(summary?.recentActivity)
    ? summary.recentActivity.map(mapActivityEvent)
    : [],
});

const mapVendorBill = (bill: any): VendorBill => ({
  ...bill,
  amount: Number(bill.amount || 0),
  paidAmount: Number(bill.paidAmount || 0),
  outstandingAmount: Number(bill.outstandingAmount || 0),
  issueDate: toDate(bill.issueDate) || new Date(),
  dueDate: toDate(bill.dueDate) || new Date(),
  paidAt: toDate(bill.paidAt),
});

const mapVendorBillPayment = (payment: any): VendorBillPayment => ({
  ...payment,
  amount: Number(payment.amount || 0),
  paidAt: toDate(payment.paidAt) || new Date(),
});

const mapPurchaseOrderPayableSummary = (summary: any): PurchaseOrderPayableSummary => ({
  ...summary,
  totalAmount: Number(summary.totalAmount || 0),
  billedAmount: Number(summary.billedAmount || 0),
  draftBillAmount: Number(summary.draftBillAmount || 0),
  openPayableAmount: Number(summary.openPayableAmount || 0),
  paidAmount: Number(summary.paidAmount || 0),
  remainingToBill: Number(summary.remainingToBill || 0),
});

const mapSupplierPayablesSummary = (summary: any): SupplierPayablesSummary => ({
  ...summary,
  purchaseOrderCount: Number(summary.purchaseOrderCount || 0),
  vendorBillCount: Number(summary.vendorBillCount || 0),
  totalOrderedAmount: Number(summary.totalOrderedAmount || 0),
  totalBilledAmount: Number(summary.totalBilledAmount || 0),
  openPayables: Number(summary.openPayables || 0),
  paidAmount: Number(summary.paidAmount || 0),
  draftBillAmount: Number(summary.draftBillAmount || 0),
  remainingToBill: Number(summary.remainingToBill || 0),
});

const mapJournalLine = (line: any): JournalEntryLine => ({
  ...line,
  debit: Number(line.debit || 0),
  credit: Number(line.credit || 0),
});

const mapJournalEntry = (entry: any): JournalEntry => ({
  ...entry,
  entryDate: toDate(entry.entryDate) || new Date(),
  createdAt: toDate(entry.createdAt) || new Date(),
  lines: Array.isArray(entry.lines) ? entry.lines.map(mapJournalLine) : [],
});

const mapAccountActivityReport = (report: any): AccountActivityReport => ({
  ...report,
  from: toDate(report.from),
  to: toDate(report.to),
  openingBalance: Number(report.openingBalance || 0),
  closingBalance: Number(report.closingBalance || 0),
  debitTotal: Number(report.debitTotal || 0),
  creditTotal: Number(report.creditTotal || 0),
  lines: Array.isArray(report.lines)
    ? report.lines.map((line: any) => ({
        ...line,
        entryDate: toDate(line.entryDate) || new Date(),
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        movement: Number(line.movement || 0),
        runningBalance: Number(line.runningBalance || 0),
      }))
    : [],
});

const mapTrialBalanceReport = (report: any): TrialBalanceReport => ({
  ...report,
  asOf: toDate(report.asOf) || new Date(),
  totalDebit: Number(report.totalDebit || 0),
  totalCredit: Number(report.totalCredit || 0),
  lines: Array.isArray(report.lines)
    ? report.lines.map((line: any) => ({
        ...line,
        debitTotal: Number(line.debitTotal || 0),
        creditTotal: Number(line.creditTotal || 0),
        debitBalance: Number(line.debitBalance || 0),
        creditBalance: Number(line.creditBalance || 0),
      }))
    : [],
});

const mapProfitAndLossReport = (report: any): ProfitAndLossReport => ({
  ...report,
  from: toDate(report.from) || new Date(),
  to: toDate(report.to) || new Date(),
  revenue: Array.isArray(report.revenue)
    ? report.revenue.map((line: any) => ({ ...line, amount: Number(line.amount || 0) }))
    : [],
  expenses: Array.isArray(report.expenses)
    ? report.expenses.map((line: any) => ({ ...line, amount: Number(line.amount || 0) }))
    : [],
  totalRevenue: Number(report.totalRevenue || 0),
  totalExpenses: Number(report.totalExpenses || 0),
  netIncome: Number(report.netIncome || 0),
});

export async function getClients(companyId: string): Promise<Client[]> {
  if (!companyId) return [];
  return apiFetch<Client[]>(`/companies/${companyId}/clients`);
}

export async function getCompanyNumberingSettings(
  companyId: string,
): Promise<CompanyNumberingSetting[]> {
  if (!companyId) return [];
  const settings = await apiFetch<CompanyNumberingSetting[]>(
    `/companies/${companyId}/numbering-settings`,
  );
  return settings.map(mapNumberingSetting);
}

export async function updateCompanyNumberingSetting(
  companyId: string,
  entityType: NumberingEntityType,
  data: Partial<Pick<CompanyNumberingSetting, 'prefix' | 'padLength' | 'nextNumber'>>,
): Promise<CompanyNumberingSetting> {
  const setting = await apiFetch<CompanyNumberingSetting>(
    `/companies/${companyId}/numbering-settings/${entityType}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    },
  );
  return mapNumberingSetting(setting);
}

export async function getCompanyFinanceSettings(
  companyId: string,
): Promise<CompanyFinanceSettings | null> {
  if (!companyId) return null;
  const settings = await apiFetch<CompanyFinanceSettings>(
    `/companies/${companyId}/finance/settings`,
  );
  return mapCompanyFinanceSettings(settings);
}

export async function updateCompanyFinanceSettings(
  companyId: string,
  data: Partial<{
    fiscalYearStartMonth: number;
    lockedThroughDate: Date | null;
    currencyCode: string;
    poApprovalThreshold: number;
  }>,
): Promise<CompanyFinanceSettings> {
  const settings = await apiFetch<CompanyFinanceSettings>(
    `/companies/${companyId}/finance/settings`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    },
  );
  return mapCompanyFinanceSettings(settings);
}

export interface CreateClientInput {
  companyId: string;
  name: string;
  email: string;
  address: string;
  contactName?: string;
  phone?: string;
  vatNumber?: string;
  creditLimit?: number;
  creditNumber?: string;
  paymentMethod?: string;
  status?: Client['status'];
  notes?: string;
}

export async function createClient(clientData: CreateClientInput): Promise<Client> {
  return apiFetch<Client>('/clients', {
    method: 'POST',
    body: JSON.stringify(clientData),
  });
}

export async function updateClient(clientId: string, data: Partial<Client>): Promise<Client> {
  return apiFetch<Client>(`/clients/${clientId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getInvoices(companyId: string): Promise<Invoice[]> {
  if (!companyId) return [];
  const invoices = await apiFetch<Invoice[]>(`/companies/${companyId}/invoices`);
  return invoices.map(mapInvoice);
}

const mapCreditNote = (c: any): CreditNote => ({
  ...c,
  issueDate: toDate(c.issueDate) || new Date(),
  createdAt: toDate(c.createdAt) || new Date(),
  total: Number(c.total || 0),
  lineItems: Array.isArray(c.lineItems) ? c.lineItems : [],
});

export async function getCreditNotes(companyId: string): Promise<CreditNote[]> {
  if (!companyId) return [];
  const data = await apiFetch<any[]>(`/companies/${companyId}/credit-notes`);
  return data.map(mapCreditNote);
}

export async function createCreditNote(
  companyId: string,
  input: { invoiceId?: string; clientId?: string; reason?: string; lineItems: CreditNoteLineItem[] },
): Promise<CreditNote> {
  const data = await apiFetch<any>(`/companies/${companyId}/credit-notes`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return mapCreditNote(data);
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4005';

/**
 * Fetches a server-rendered PDF for an invoice and triggers a browser download.
 * The PDF is generated by headless Chromium from the public invoice page, so it
 * matches the on-screen document exactly (no print-dialog fiddling).
 */
export async function downloadInvoicePdf(
  invoiceId: string,
  invoiceNumber: string,
  lang?: string,
): Promise<void> {
  const token = getStoredToken();
  const query = lang ? `?lang=${encodeURIComponent(lang)}` : '';
  const res = await fetch(`${API_BASE_URL}/invoices/${invoiceId}/pdf${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let message = 'Could not generate the PDF.';
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // non-JSON error body; keep the default message
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `Invoice-${invoiceNumber.replace(/[^a-zA-Z0-9._-]+/g, '-')}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function getSalesOrders(companyId: string): Promise<SalesOrder[]> {
  if (!companyId) return [];
  const orders = await apiFetch<SalesOrder[]>(`/companies/${companyId}/sales-orders`);
  return orders.map(mapSalesOrder);
}

export async function createSalesOrder(
  companyId: string,
  data: {
    clientId: string;
    contactId?: string;
    orderDate: Date;
    expectedDate?: Date;
    status: SalesOrderStatus;
    notes?: string;
    items: SalesOrderLineItem[];
  },
): Promise<SalesOrder> {
  const order = await apiFetch<SalesOrder>(`/companies/${companyId}/sales-orders`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return mapSalesOrder(order);
}

export async function updateSalesOrderStatus(
  salesOrderId: string,
  status: SalesOrderStatus,
): Promise<SalesOrder> {
  const order = await apiFetch<SalesOrder>(`/sales-orders/${salesOrderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return mapSalesOrder(order);
}

export async function createInvoiceFromSalesOrder(
  salesOrderId: string,
  data: {
    templateId?: string;
    issueDate?: Date;
    dueDate?: Date;
    notes?: string;
    currency?: string;
    taxRate?: number;
  } = {},
): Promise<Invoice> {
  const invoice = await apiFetch<Invoice>(`/sales-orders/${salesOrderId}/invoice`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return mapInvoice(invoice);
}

export async function getInvoice(invoiceId: string): Promise<Invoice | null> {
  if (!invoiceId) return null;
  const invoice = await apiFetch<Invoice>(`/invoices/${invoiceId}`);
  return mapInvoice(invoice);
}

export async function getInvoiceTemplates(
  companyId: string,
  docType: 'invoice' | 'delivery' = 'invoice',
): Promise<InvoiceTemplate[]> {
  if (!companyId) return [];
  const query = docType === 'delivery' ? '?docType=delivery' : '';
  const templates = await apiFetch<InvoiceTemplate[]>(`/companies/${companyId}/invoice-templates${query}`);
  return templates.map(mapInvoiceTemplate);
}

// ============================================================
// Deliveries / Fulfillment
// ============================================================

export async function getDeliveries(
  companyId: string,
): Promise<import('@/modules/finance/types').Delivery[]> {
  if (!companyId) return [];
  const rows = await apiFetch<any[]>(`/companies/${companyId}/deliveries`);
  return rows.map(mapDelivery);
}

export async function getDeliveriesForSalesOrder(
  salesOrderId: string,
): Promise<import('@/modules/finance/types').Delivery[]> {
  if (!salesOrderId) return [];
  const rows = await apiFetch<any[]>(`/sales-orders/${salesOrderId}/deliveries`);
  return rows.map(mapDelivery);
}

export async function createDelivery(
  salesOrderId: string,
  data: {
    items: Array<{ salesOrderLineIndex: number; quantity: number; location?: string }>;
    carrier?: string;
    trackingNumber?: string;
    notes?: string;
    scheduledFor?: Date;
  },
): Promise<import('@/modules/finance/types').Delivery> {
  const body = await apiFetch<any>(`/sales-orders/${salesOrderId}/deliveries`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return mapDelivery(body);
}

export async function updateDeliveryStatus(
  deliveryId: string,
  status: import('@/modules/finance/types').DeliveryStatus,
  options: { occurredAt?: Date; reason?: string } = {},
): Promise<import('@/modules/finance/types').Delivery> {
  const body = await apiFetch<any>(`/deliveries/${deliveryId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      occurredAt: options.occurredAt?.toISOString(),
      reason: options.reason,
    }),
  });
  return mapDelivery(body);
}

export async function cancelDelivery(
  deliveryId: string,
  reason?: string,
): Promise<import('@/modules/finance/types').Delivery> {
  const body = await apiFetch<any>(`/deliveries/${deliveryId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return mapDelivery(body);
}

export type InvoiceTemplateInput = Omit<
  InvoiceTemplate,
  'id' | 'companyId' | 'createdAt' | 'updatedAt'
>;

export async function createInvoiceTemplate(
  companyId: string,
  data: InvoiceTemplateInput,
): Promise<InvoiceTemplate> {
  const template = await apiFetch<InvoiceTemplate>(`/companies/${companyId}/invoice-templates`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return mapInvoiceTemplate(template);
}

export async function updateInvoiceTemplate(
  templateId: string,
  data: Partial<InvoiceTemplateInput>,
): Promise<InvoiceTemplate> {
  const template = await apiFetch<InvoiceTemplate>(`/invoice-templates/${templateId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return mapInvoiceTemplate(template);
}

export async function deleteInvoiceTemplate(templateId: string): Promise<void> {
  await apiFetch(`/invoice-templates/${templateId}`, {
    method: 'DELETE',
  });
}

export async function deleteInvoice(invoiceId: string): Promise<void> {
  await apiFetch(`/invoices/${invoiceId}`, { method: 'DELETE' });
}

export async function deleteSalesOrder(salesOrderId: string): Promise<void> {
  await apiFetch(`/sales-orders/${salesOrderId}`, { method: 'DELETE' });
}

export async function deleteCreditNote(creditNoteId: string): Promise<void> {
  await apiFetch(`/credit-notes/${creditNoteId}`, { method: 'DELETE' });
}

export async function deleteVendorBill(billId: string): Promise<void> {
  await apiFetch(`/vendor-bills/${billId}`, { method: 'DELETE' });
}

export async function createInvoice(
  invoiceData: Omit<Invoice, 'id' | 'invoiceNumber'> & { invoiceNumber?: string },
): Promise<Invoice> {
  const invoice = await apiFetch<Invoice>('/invoices', {
    method: 'POST',
    body: JSON.stringify(invoiceData),
  });
  return mapInvoice(invoice);
}

export async function updateInvoiceStatus(
  invoiceId: string,
  status: Invoice['status'],
): Promise<void> {
  await apiFetch(`/invoices/${invoiceId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function updateInvoice(invoiceId: string, data: Partial<Invoice>): Promise<Invoice> {
  const invoice = await apiFetch<Invoice>(`/invoices/${invoiceId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return mapInvoice(invoice);
}

export interface PaymentInput {
  amount: number;
  method?: string;
  note?: string;
  paidAt?: Date;
}

export async function getPayments(invoiceId: string): Promise<Payment[]> {
  const payments = await apiFetch<Payment[]>(`/invoices/${invoiceId}/payments`);
  return payments.map((p) => ({ ...p, paidAt: toDate(p.paidAt) || new Date() }));
}

export async function createPayment(invoiceId: string, data: PaymentInput): Promise<Payment> {
  const payment = await apiFetch<Payment>(`/invoices/${invoiceId}/payments`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return { ...payment, paidAt: toDate(payment.paidAt) || new Date() };
}

export async function reversePayment(invoiceId: string, paymentId: string): Promise<Invoice> {
  const invoice = await apiFetch<Invoice>(`/invoices/${invoiceId}/payments/${paymentId}`, {
    method: 'DELETE',
  });
  return mapInvoice(invoice);
}

export async function bulkUpdateInvoiceStatus(
  companyId: string,
  targetStatus: Invoice['status'],
  options?: { invoiceIds?: string[]; currentStatus?: Invoice['status'] },
): Promise<{ updatedCount: number }> {
  return apiFetch<{ updatedCount: number }>(`/companies/${companyId}/invoices/bulk-status`, {
    method: 'POST',
    body: JSON.stringify({
      targetStatus,
      invoiceIds: options?.invoiceIds,
      currentStatus: options?.currentStatus,
    }),
  });
}

export async function getLedgerAccounts(companyId: string): Promise<LedgerAccount[]> {
  if (!companyId) return [];
  return apiFetch<LedgerAccount[]>(`/companies/${companyId}/finance/accounts`);
}

export async function createLedgerAccount(
  companyId: string,
  data: {
    name: string;
    type: LedgerAccountType;
    detailType?: string;
    description?: string;
    isActive?: boolean;
    isSystem?: boolean;
  },
): Promise<LedgerAccount> {
  return apiFetch<LedgerAccount>(`/companies/${companyId}/finance/accounts`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateLedgerAccount(
  accountId: string,
  data: Partial<{
    name: string;
    type: LedgerAccountType;
    detailType?: string;
    description?: string;
    isActive?: boolean;
  }>,
): Promise<LedgerAccount> {
  return apiFetch<LedgerAccount>(`/finance/accounts/${accountId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteLedgerAccount(accountId: string): Promise<void> {
  await apiFetch(`/finance/accounts/${accountId}`, {
    method: 'DELETE',
  });
}

export async function getJournalEntries(
  companyId: string,
  limit: number = 100,
): Promise<JournalEntry[]> {
  if (!companyId) return [];
  const entries = await apiFetch<JournalEntry[]>(
    `/companies/${companyId}/finance/journal?limit=${limit}`,
  );
  return entries.map(mapJournalEntry);
}

export interface CreateJournalInput {
  memo?: string;
  entryDate: Date;
  sourceType?: JournalEntry['sourceType'];
  sourceId?: string;
  lines: Array<{
    accountId: string;
    description?: string;
    debit: number;
    credit: number;
  }>;
}

export async function createJournalEntry(
  companyId: string,
  data: CreateJournalInput,
): Promise<JournalEntry> {
  const entry = await apiFetch<JournalEntry>(`/companies/${companyId}/finance/journal`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return mapJournalEntry(entry);
}

export async function getAccountActivityReport(
  companyId: string,
  accountId: string,
  options?: { from?: Date; to?: Date; limit?: number },
): Promise<AccountActivityReport | null> {
  if (!companyId || !accountId) return null;
  const params = new URLSearchParams();
  if (options?.from) params.set('from', options.from.toISOString());
  if (options?.to) params.set('to', options.to.toISOString());
  if (options?.limit) params.set('limit', String(options.limit));
  const query = params.toString();
  const report = await apiFetch<AccountActivityReport>(
    `/companies/${companyId}/finance/accounts/${accountId}/activity${query ? `?${query}` : ''}`,
  );
  return mapAccountActivityReport(report);
}

export async function getTrialBalanceReport(
  companyId: string,
  options?: { asOf?: Date },
): Promise<TrialBalanceReport | null> {
  if (!companyId) return null;
  const params = new URLSearchParams();
  if (options?.asOf) params.set('asOf', options.asOf.toISOString());
  const query = params.toString();
  const report = await apiFetch<TrialBalanceReport>(
    `/companies/${companyId}/finance/trial-balance${query ? `?${query}` : ''}`,
  );
  return mapTrialBalanceReport(report);
}

export async function getProfitAndLossReport(
  companyId: string,
  options?: { from?: Date; to?: Date },
): Promise<ProfitAndLossReport | null> {
  if (!companyId) return null;
  const params = new URLSearchParams();
  if (options?.from) params.set('from', options.from.toISOString());
  if (options?.to) params.set('to', options.to.toISOString());
  const query = params.toString();
  const report = await apiFetch<ProfitAndLossReport>(
    `/companies/${companyId}/finance/profit-and-loss${query ? `?${query}` : ''}`,
  );
  return mapProfitAndLossReport(report);
}

export async function getVendorBills(companyId: string): Promise<VendorBill[]> {
  if (!companyId) return [];
  const bills = await apiFetch<VendorBill[]>(`/companies/${companyId}/finance/vendor-bills`);
  return bills.map(mapVendorBill);
}

export async function getPurchaseOrderPayables(
  companyId: string,
): Promise<PurchaseOrderPayableSummary[]> {
  if (!companyId) return [];
  const summaries = await apiFetch<PurchaseOrderPayableSummary[]>(
    `/companies/${companyId}/purchase-order-payables`,
  );
  return summaries.map(mapPurchaseOrderPayableSummary);
}

export async function getSupplierPayables(
  companyId: string,
): Promise<SupplierPayablesSummary[]> {
  if (!companyId) return [];
  const summaries = await apiFetch<SupplierPayablesSummary[]>(
    `/companies/${companyId}/finance/supplier-payables`,
  );
  return summaries.map(mapSupplierPayablesSummary);
}

export interface CreateVendorBillInput {
  vendorName: string;
  supplierId?: string;
  purchaseOrderId?: string;
  referenceInvoiceNumber?: string;
  issueDate: Date;
  dueDate?: Date;
  amount?: number;
  status?: VendorBillStatus;
  notes?: string;
  expenseAccountId?: string;
}

export async function createVendorBill(
  companyId: string,
  data: CreateVendorBillInput,
): Promise<VendorBill> {
  const bill = await apiFetch<VendorBill>(`/companies/${companyId}/finance/vendor-bills`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return mapVendorBill(bill);
}

export async function updateVendorBillStatus(
  billId: string,
  status: VendorBillStatus,
): Promise<VendorBill> {
  const bill = await apiFetch<VendorBill>(`/vendor-bills/${billId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return mapVendorBill(bill);
}

export interface VendorBillPaymentInput {
  amount: number;
  method?: string;
  note?: string;
  paidAt?: Date;
}

export async function getVendorBillPayments(billId: string): Promise<VendorBillPayment[]> {
  const payments = await apiFetch<VendorBillPayment[]>(`/vendor-bills/${billId}/payments`);
  return payments.map(mapVendorBillPayment);
}

export async function createVendorBillPayment(
  billId: string,
  data: VendorBillPaymentInput,
): Promise<{ payment: VendorBillPayment; bill: VendorBill }> {
  const response = await apiFetch<{ payment: VendorBillPayment; bill: VendorBill }>(
    `/vendor-bills/${billId}/payments`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
  return {
    payment: mapVendorBillPayment(response.payment),
    bill: mapVendorBill(response.bill),
  };
}

export async function reverseVendorBillPayment(billId: string, paymentId: string): Promise<VendorBill> {
  const bill = await apiFetch<VendorBill>(
    `/vendor-bills/${billId}/payments/${paymentId}`,
    { method: 'DELETE' },
  );
  return mapVendorBill(bill);
}

export async function bulkUpdateVendorBillStatus(
  companyId: string,
  targetStatus: VendorBillStatus,
  options?: { billIds?: string[]; currentStatus?: VendorBillStatus },
): Promise<{ updatedCount: number }> {
  return apiFetch<{ updatedCount: number }>(
    `/companies/${companyId}/finance/vendor-bills/bulk-status`,
    {
      method: 'POST',
      body: JSON.stringify({
        targetStatus,
        billIds: options?.billIds,
        currentStatus: options?.currentStatus,
      }),
    },
  );
}

export async function getFinanceOverview(companyId: string): Promise<FinanceOverview> {
  return apiFetch<FinanceOverview>(`/companies/${companyId}/finance/overview`);
}

const mapExpense = (e: any): Expense => ({
  ...e,
  amount: Number(e.amount || 0),
  expenseDate: e.expenseDate ? new Date(e.expenseDate) : new Date(),
  createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
  updatedAt: e.updatedAt ? new Date(e.updatedAt) : new Date(),
});

export interface CreateExpenseInput {
  category: string;
  amount: number;
  expenseDate?: string;
  vendor?: string;
  description?: string;
  paymentMethod?: string;
  reference?: string;
  projectId?: string;
}

export async function getExpenses(companyId: string): Promise<Expense[]> {
  if (!companyId) return [];
  const rows = await apiFetch<Expense[]>(`/companies/${companyId}/expenses`);
  return rows.map(mapExpense);
}

export async function createExpense(companyId: string, data: CreateExpenseInput): Promise<Expense> {
  const created = await apiFetch<Expense>(`/companies/${companyId}/expenses`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return mapExpense(created);
}

export async function deleteExpense(expenseId: string): Promise<void> {
  await apiFetch(`/expenses/${expenseId}`, { method: 'DELETE' });
}

export interface FinanceAgingResponse {
  asOf: string;
  receivables: AgingBucket[];
  payables: AgingBucket[];
}

export async function getFinanceAging(companyId: string): Promise<FinanceAgingResponse> {
  return apiFetch<FinanceAgingResponse>(`/companies/${companyId}/finance/aging`);
}

export async function getActivityEvents(
  companyId: string,
  options?: {
    entityType?: ActivityEvent['entityType'];
    entityId?: string;
    actorUserId?: string;
    limit?: number;
  },
): Promise<ActivityEvent[]> {
  if (!companyId) return [];
  const params = new URLSearchParams();
  if (options?.entityType) params.set('entityType', options.entityType);
  if (options?.entityId) params.set('entityId', options.entityId);
  if (options?.actorUserId) params.set('actorUserId', options.actorUserId);
  if (options?.limit) params.set('limit', String(options.limit));
  const query = params.toString();
  const events = await apiFetch<ActivityEvent[]>(
    `/companies/${companyId}/activity-events${query ? `?${query}` : ''}`,
  );
  return events.map(mapActivityEvent);
}

export async function getRecordAttachments(
  companyId: string,
  entityType: RecordEntityType,
  entityId: string,
): Promise<RecordAttachment[]> {
  if (!companyId || !entityId) return [];
  const attachments = await apiFetch<RecordAttachment[]>(
    `/companies/${companyId}/records/${entityType}/${entityId}/attachments`,
  );
  return attachments.map(mapRecordAttachment);
}

export async function createRecordAttachment(
  companyId: string,
  entityType: RecordEntityType,
  entityId: string,
  data: {
    fileName: string;
    url?: string;
    mimeType?: string;
    sizeBytes?: number;
    note?: string;
  },
): Promise<RecordAttachment> {
  const attachment = await apiFetch<RecordAttachment>(
    `/companies/${companyId}/records/${entityType}/${entityId}/attachments`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
  return mapRecordAttachment(attachment);
}

export async function deleteRecordAttachment(attachmentId: string): Promise<void> {
  await apiFetch(`/record-attachments/${attachmentId}`, { method: 'DELETE' });
}

export async function getRecordTimeline(
  companyId: string,
  entityType: RecordEntityType,
  entityId: string,
  options?: { limit?: number },
): Promise<RecordTimelineItem[]> {
  if (!companyId || !entityId) return [];
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  const query = params.toString();
  const items = await apiFetch<RecordTimelineItem[]>(
    `/companies/${companyId}/records/${entityType}/${entityId}/timeline${query ? `?${query}` : ''}`,
  );
  return items.map(mapRecordTimelineItem);
}

export async function getManagementReportSummary(
  companyId: string,
): Promise<ManagementReportSummary | null> {
  if (!companyId) return null;
  const summary = await apiFetch<ManagementReportSummary>(
    `/companies/${companyId}/reports/management-summary`,
  );
  return mapManagementReportSummary(summary);
}

export async function downloadReportExport(
  companyId: string,
  dataset: 'management-kpis' | 'clients' | 'suppliers' | 'inventory-alerts' | 'activity-log',
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4005';
  const token = getStoredToken();
  const response = await fetch(`${baseUrl}/companies/${companyId}/reports/export/${dataset}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`Could not export ${dataset}.`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${dataset}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadFinanceExport(
  companyId: string,
  dataset:
    | 'invoices'
    | 'vendor-bills'
    | 'journal'
    | 'accounts'
    | 'aging'
    | 'trial-balance'
    | 'profit-and-loss',
  options?: { asOf?: Date; from?: Date; to?: Date },
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4005';
  const token = getStoredToken();
  const params = new URLSearchParams();
  if (options?.asOf) params.set('asOf', options.asOf.toISOString());
  if (options?.from) params.set('from', options.from.toISOString());
  if (options?.to) params.set('to', options.to.toISOString());
  const query = params.toString();
  const response = await fetch(
    `${baseUrl}/companies/${companyId}/finance/export/${dataset}${query ? `?${query}` : ''}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    },
  );
  if (!response.ok) {
    throw new Error(`Could not export ${dataset}.`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${dataset}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
