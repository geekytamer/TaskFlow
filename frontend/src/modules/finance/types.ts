import type { InventoryItem } from '@/modules/operations/types';

export interface Client {
  id: string;
  reference: string;
  name: string;
  email: string;
  address: string;
  companyId: string;
  contactName?: string;
  phone?: string;
  vatNumber?: string;
  creditLimit?: number;
  creditNumber?: string;
  paymentMethod?: string;
  status?: 'Lead' | 'Active' | 'At Risk' | 'Inactive';
  notes?: string;
}

export type NumberingEntityType =
  | 'client'
  | 'supplier'
  | 'inventory_item'
  | 'purchase_order'
  | 'sales_order'
  | 'sales_invoice'
  | 'vendor_invoice';

export interface CompanyNumberingSetting {
  companyId: string;
  entityType: NumberingEntityType;
  prefix: string;
  padLength: number;
  nextNumber: number;
  sample: string;
  updatedAt: Date;
}

export interface CompanyFinanceSettings {
  companyId: string;
  fiscalYearStartMonth: number;
  lockedThroughDate?: Date;
  currencyCode: string;
  poApprovalThreshold: number;
  updatedAt: Date;
}

export type InvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue';
export const invoiceStatuses: InvoiceStatus[] = ['Draft', 'Sent', 'Paid', 'Overdue'];

export type InvoiceLineItemType = 'Task' | 'Manual';

export type LineDiscountType = 'percent' | 'amount';

export interface InvoiceLineItem {
  taskId?: string;
  itemType: InvoiceLineItemType;
  sku?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  discountType?: LineDiscountType;
  amount: number;
  custom?: Record<string, string>;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  companyId: string;
  clientId: string;
  contactId?: string;
  salesOrderId?: string;
  templateId?: string;
  /** Frozen copy of the template captured at issue time; render prefers this over the live template. */
  templateSnapshot?: InvoiceTemplate;
  campaignId?: string;
  issueDate: Date;
  dueDate: Date;
  lineItems: InvoiceLineItem[];
  total: number;
  status: InvoiceStatus;
  notes?: string;
  currency?: string;
  taxRate?: number;
  sentAt?: Date;
  paidAt?: Date;
  paidAmount?: number;
  outstandingAmount?: number;
  creditedAmount?: number;
}

export interface CreditNoteLineItem {
  description: string;
  amount: number;
}

export interface CreditNote {
  id: string;
  companyId: string;
  invoiceId?: string;
  clientId: string;
  creditNoteNumber: string;
  issueDate: Date;
  lineItems: CreditNoteLineItem[];
  total: number;
  reason?: string;
  status: 'Issued' | 'Void';
  createdAt: Date;
}

export type SalesOrderStatus = 'Draft' | 'Confirmed' | 'Invoiced' | 'Cancelled';
export const salesOrderStatuses: SalesOrderStatus[] = ['Draft', 'Confirmed', 'Invoiced', 'Cancelled'];

export interface SalesOrderLineItem {
  inventoryItemId?: string;
  sku?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  discountType?: LineDiscountType;
  lineTotal: number;
}

export type SalesOrderFulfillmentStatus = 'Unfulfilled' | 'Partially Fulfilled' | 'Fulfilled';

export interface SalesOrder {
  id: string;
  companyId: string;
  orderNumber: string;
  clientId: string;
  contactId?: string;
  orderDate: Date;
  expectedDate?: Date;
  status: SalesOrderStatus;
  items: SalesOrderLineItem[];
  totalAmount: number;
  notes?: string;
  invoiceId?: string;
  fulfillmentStatus?: SalesOrderFulfillmentStatus;
  deliveredQuantityByLine?: number[];
}

export type DeliveryStatus = 'Pending' | 'Shipped' | 'Delivered' | 'Cancelled';
export const deliveryStatuses: DeliveryStatus[] = ['Pending', 'Shipped', 'Delivered', 'Cancelled'];

export interface DeliveryLineItem {
  salesOrderLineIndex: number;
  inventoryItemId?: string;
  sku?: string;
  description: string;
  quantity: number;
  location?: string;
}

export interface Delivery {
  id: string;
  companyId: string;
  deliveryNumber: string;
  salesOrderId: string;
  status: DeliveryStatus;
  items: DeliveryLineItem[];
  carrier?: string;
  trackingNumber?: string;
  notes?: string;
  scheduledFor?: Date;
  dispatchedAt?: Date;
  deliveredAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
}

export type InvoiceTemplateLayout = 'classic' | 'modern' | 'compact' | 'letterhead';

export type InvoiceColumnKey = 'sku' | 'description' | 'quantity' | 'unitPrice' | 'amount' | 'custom';
export type InvoiceColumnAlign = 'left' | 'center' | 'right';

export interface InvoiceColumn {
  id: string;
  key: InvoiceColumnKey;
  label: string;
  visible: boolean;
  width?: number;
  align?: InvoiceColumnAlign;
}

export interface InvoiceBankAccount {
  id: string;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  iban?: string;
  swift?: string;
  currency?: string;
}

export interface InvoiceTemplate {
  id: string;
  companyId: string;
  name: string;
  layout: InvoiceTemplateLayout;
  isDefault: boolean;
  primaryColor: string;
  accentColor: string;
  logoUrl?: string;
  headerImageUrl?: string;
  footerImageUrl?: string;
  letterheadPdfUrl?: string;
  letterheadImageUrl?: string;
  stampUrl?: string;
  signatureUrl?: string;
  signatureLabel?: string;
  paymentInstructions?: string;
  terms?: string;
  footerNote?: string;
  watermarkEnabled: boolean;
  watermarkText?: string;
  watermarkOpacity?: number;
  showCompanyAddress: boolean;
  showTaxId: boolean;
  columns?: InvoiceColumn[];
  bankAccounts?: InvoiceBankAccount[];
  qrEnabled?: boolean;
  qrPosition?: 'left' | 'center' | 'right';
  /** Section keys that should start on a new printed page. */
  sectionBreaks?: InvoiceSectionKey[];
  /** New document-builder model. When present, it drives rendering instead of
   *  the legacy fixed layout. */
  doc?: import('./doc/types').InvoiceDoc;
  createdAt: Date;
  updatedAt: Date;
}

export type InvoiceSectionKey = 'billing' | 'items' | 'payment' | 'terms' | 'notes' | 'signature' | 'qr';

export const invoiceSections: { key: InvoiceSectionKey; label: string }[] = [
  { key: 'billing', label: 'Bill to / dates' },
  { key: 'items', label: 'Line items' },
  { key: 'payment', label: 'Payment & bank details' },
  { key: 'terms', label: 'Terms' },
  { key: 'notes', label: 'Notes' },
  { key: 'signature', label: 'Stamp & signature' },
  { key: 'qr', label: 'QR code' },
];

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method?: string;
  note?: string;
  paidAt: Date;
}

export type LedgerAccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

export interface LedgerAccount {
  id: string;
  companyId: string;
  code: string;
  name: string;
  type: LedgerAccountType;
  detailType?: string;
  description?: string;
  isActive?: boolean;
  isSystem?: boolean;
}

export interface JournalEntryLine {
  id: string;
  accountId: string;
  description?: string;
  debit: number;
  credit: number;
}

export type JournalSourceType =
  | 'manual'
  | 'invoice'
  | 'invoice_payment'
  | 'vendor_bill'
  | 'vendor_bill_payment';

export interface JournalEntry {
  id: string;
  companyId: string;
  sourceType: JournalSourceType;
  sourceId?: string;
  memo?: string;
  entryDate: Date;
  createdAt: Date;
  lines: JournalEntryLine[];
}

export interface AccountActivityLine {
  entryId: string;
  lineId: string;
  entryDate: Date;
  sourceType: JournalSourceType;
  sourceId?: string;
  memo?: string;
  description?: string;
  debit: number;
  credit: number;
  movement: number;
  runningBalance: number;
}

export interface AccountActivityReport {
  companyId: string;
  account: LedgerAccount;
  from?: Date;
  to?: Date;
  openingBalance: number;
  closingBalance: number;
  debitTotal: number;
  creditTotal: number;
  lines: AccountActivityLine[];
}

export interface TrialBalanceLine {
  accountId: string;
  code: string;
  name: string;
  type: LedgerAccountType;
  debitTotal: number;
  creditTotal: number;
  debitBalance: number;
  creditBalance: number;
}

export interface TrialBalanceReport {
  companyId: string;
  asOf: Date;
  lines: TrialBalanceLine[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

export interface ProfitAndLossLine {
  accountId: string;
  code: string;
  name: string;
  amount: number;
}

export interface ProfitAndLossReport {
  companyId: string;
  from: Date;
  to: Date;
  revenue: ProfitAndLossLine[];
  expenses: ProfitAndLossLine[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

export type VendorBillStatus = 'Draft' | 'Approved' | 'Paid' | 'Overdue';
export const vendorBillStatuses: VendorBillStatus[] = ['Draft', 'Approved', 'Paid', 'Overdue'];

export interface VendorBill {
  id: string;
  companyId: string;
  vendorName: string;
  supplierId?: string;
  purchaseOrderId?: string;
  billNumber: string;
  referenceInvoiceNumber?: string;
  issueDate: Date;
  dueDate: Date;
  amount: number;
  status: VendorBillStatus;
  notes?: string;
  expenseAccountId?: string;
  paidAt?: Date;
  paidAmount?: number;
  outstandingAmount?: number;
}

export interface VendorBillPayment {
  id: string;
  billId: string;
  amount: number;
  method?: string;
  note?: string;
  paidAt: Date;
}

export interface PurchaseOrderPayableSummary {
  purchaseOrderId: string;
  companyId: string;
  orderNumber: string;
  supplierId?: string;
  supplierName: string;
  orderStatus: 'Draft' | 'Ordered' | 'Partially Received' | 'Received' | 'Cancelled';
  totalAmount: number;
  billedAmount: number;
  draftBillAmount: number;
  openPayableAmount: number;
  paidAmount: number;
  remainingToBill: number;
}

export interface SupplierPayablesSummary {
  supplierId: string;
  companyId: string;
  supplierName: string;
  purchaseOrderCount: number;
  vendorBillCount: number;
  totalOrderedAmount: number;
  totalBilledAmount: number;
  openPayables: number;
  paidAmount: number;
  draftBillAmount: number;
  remainingToBill: number;
}

export interface ActivityEvent {
  id: string;
  companyId: string;
  actorUserId?: string;
  actorName?: string;
  entityType:
    | 'client'
    | 'project'
    | 'task'
    | 'supplier'
    | 'inventory_item'
    | 'purchase_order'
    | 'sales_order'
    | 'invoice'
    | 'vendor_bill';
  entityId: string;
  action: string;
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export type RecordEntityType =
  | ActivityEvent['entityType']
  | 'company'
  | 'ledger_account'
  | 'journal_entry'
  | 'payment'
  | 'vendor_payment'
  | 'purchase_receipt'
  | 'stock_movement';

export interface RecordAttachment {
  id: string;
  companyId: string;
  entityType: RecordEntityType;
  entityId: string;
  fileName: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  note?: string;
  uploadedByUserId?: string;
  uploadedByName?: string;
  createdAt: Date;
}

export interface RecordTimelineItem {
  id: string;
  type: 'activity' | 'attachment';
  title: string;
  detail?: string;
  actorName?: string;
  createdAt: Date;
  entityType: RecordEntityType;
  entityId: string;
  activity?: ActivityEvent;
  attachment?: RecordAttachment;
}

export interface InventoryReportSummary {
  totalItems: number;
  stockValue: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export interface PurchaseReportSummary {
  openOrders: number;
  orderedSpend: number;
  awaitingReceiptUnits: number;
  unbilledValue: number;
}

export interface ClientRevenueSummary {
  clientId: string;
  clientName: string;
  invoiceCount: number;
  totalBilled: number;
  paidAmount: number;
  outstandingAmount: number;
}

export interface SupplierSpendSummary {
  supplierId: string;
  supplierName: string;
  purchaseOrderCount: number;
  totalOrderedAmount: number;
  totalBilledAmount: number;
  openPayables: number;
  remainingToBill: number;
}

export interface ManagementReportSummary {
  finance: FinanceOverview;
  inventory: InventoryReportSummary;
  purchases: PurchaseReportSummary;
  topClients: ClientRevenueSummary[];
  topSuppliers: SupplierSpendSummary[];
  lowStockItems: InventoryItem[];
  recentActivity: ActivityEvent[];
}

export interface AgingBucket {
  bucket: 'current' | '1_30' | '31_60' | '61_90' | 'over_90';
  amount: number;
}

export interface FinanceOverview {
  openReceivables: number;
  openPayables: number;
  paidThisMonth: number;
  paidPayablesThisMonth: number;
  billedThisMonth: number;
  expenseReceiptsThisMonth: number;
}
