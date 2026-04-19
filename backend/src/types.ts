export type UserRole = 'Admin' | 'Manager' | 'Employee' | 'Accountant';

export interface Company {
  id: string;
  name: string;
  website?: string;
  address?: string;
}

export type NumberingEntityType =
  | 'client'
  | 'supplier'
  | 'inventory_item'
  | 'purchase_order'
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
  updatedAt: Date;
}

export interface Position {
  id: string;
  title: string;
  // Positions are global; companyId is kept only for backward compatibility during migration.
  companyId?: string;
}

export interface CompanyRoleAssignment {
  companyId: string;
  role: UserRole;
  positionId?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyIds: string[];
  positionId?: string;
  companyRoles?: CompanyRoleAssignment[];
  avatar: string;
  password: string;
}

export type TaskStatus = 'To Do' | 'In Progress' | 'Done';
export type TaskPriority = 'Low' | 'Medium' | 'High';
export type ProjectVisibility = 'Public' | 'Private';

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  companyId: string;
  visibility: ProjectVisibility;
  memberIds?: string[];
  clientId?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: Date;
  dueDate?: Date;
  assignedUserIds?: string[];
  tags: string[];
  companyId: string;
  projectId: string;
  color?: string;
  dependencies?: string[];
  parentTaskId?: string;
  invoiceImage?: string;
  invoiceVendor?: string;
  invoiceNumber?: string;
  invoiceAmount?: number;
  invoiceDate?: Date;
  generatedInvoiceId?: string;
}

export interface Comment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  createdAt: Date;
}

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

export interface Supplier {
  id: string;
  reference: string;
  companyId: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  paymentTermsDays?: number;
  notes?: string;
  isActive: boolean;
}

export interface InventoryItem {
  id: string;
  companyId: string;
  sku: string;
  barcode?: string;
  name: string;
  category: string;
  unit: string;
  vatApplicable: boolean;
  tracksInventory: boolean;
  onHand: number;
  reorderPoint: number;
  unitCost: number;
  salePrice?: number;
  preferredVendor?: string;
  preferredSupplierId?: string;
  location?: string;
}

export type PurchaseOrderStatus =
  | 'Draft'
  | 'Ordered'
  | 'Partially Received'
  | 'Received'
  | 'Cancelled';

export interface PurchaseOrderLineItem {
  inventoryItemId?: string;
  sku?: string;
  description: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface PurchaseOrder {
  id: string;
  companyId: string;
  orderNumber: string;
  supplierName: string;
  supplierId?: string;
  orderDate: Date;
  expectedDate?: Date;
  status: PurchaseOrderStatus;
  items: PurchaseOrderLineItem[];
  totalAmount: number;
  notes?: string;
  receivedAt?: Date;
}

export interface PurchaseReceiptLine {
  lineIndex: number;
  inventoryItemId?: string;
  sku?: string;
  description: string;
  quantity: number;
  unitCost: number;
}

export interface PurchaseReceipt {
  id: string;
  companyId: string;
  purchaseOrderId: string;
  receivedAt: Date;
  notes?: string;
  items: PurchaseReceiptLine[];
}

export interface InventoryLocationBalance {
  companyId: string;
  inventoryItemId: string;
  location: string;
  quantity: number;
}

export interface InventoryIssue {
  id: string;
  companyId: string;
  inventoryItemId: string;
  quantity: number;
  location: string;
  issuedAt: Date;
  issuedTo?: string;
  note?: string;
  projectId?: string;
  taskId?: string;
}

export interface InventoryTransfer {
  id: string;
  companyId: string;
  inventoryItemId: string;
  quantity: number;
  fromLocation: string;
  toLocation: string;
  transferredAt: Date;
  note?: string;
}

export type StockMovementType =
  | 'Opening'
  | 'Receipt'
  | 'Adjustment'
  | 'Issue'
  | 'Transfer Out'
  | 'Transfer In';

export interface StockMovement {
  id: string;
  companyId: string;
  inventoryItemId: string;
  movementType: StockMovementType;
  quantityChange: number;
  unitCost?: number;
  referenceType?:
    | 'opening'
    | 'purchase_order'
    | 'manual_adjustment'
    | 'inventory_issue'
    | 'inventory_transfer';
  referenceId?: string;
  note?: string;
  createdAt: Date;
}

export type InvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue';

export type InvoiceLineItemType = 'Task' | 'Manual';

export interface InvoiceLineItem {
  taskId?: string;
  itemType: InvoiceLineItemType;
  sku?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  companyId: string;
  clientId: string;
  templateId?: string;
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
}

export type InvoiceTemplateLayout = 'classic' | 'modern' | 'compact' | 'letterhead';

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
  paymentInstructions?: string;
  terms?: string;
  footerNote?: string;
  showCompanyAddress: boolean;
  showTaxId: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method?: string;
  note?: string;
  paidAt: Date;
}

export type LedgerAccountType =
  | 'Asset'
  | 'Liability'
  | 'Equity'
  | 'Revenue'
  | 'Expense';

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

export interface JournalEntry {
  id: string;
  companyId: string;
  sourceType: 'manual' | 'invoice' | 'invoice_payment' | 'vendor_bill' | 'vendor_bill_payment';
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
  sourceType: JournalEntry['sourceType'];
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
  orderStatus: PurchaseOrderStatus;
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

export type DashboardScope = 'personal' | 'company';
export type DashboardMetricFormat = 'number' | 'currency' | 'percent';
export type DashboardTone = 'default' | 'info' | 'success' | 'warning' | 'danger';
export type DashboardChartType = 'donut' | 'line' | 'bar' | 'stacked-bar';

export interface DashboardMetric {
  id: string;
  label: string;
  value: number;
  format: DashboardMetricFormat;
  tone?: DashboardTone;
  detail?: string;
}

export interface DashboardChartSeries {
  key: string;
  label: string;
  color: string;
}

export interface DashboardChartDatum {
  label: string;
  values: Record<string, number>;
}

export interface DashboardChart {
  id: string;
  title: string;
  description?: string;
  type: DashboardChartType;
  series: DashboardChartSeries[];
  data: DashboardChartDatum[];
}

export interface DashboardAlert {
  id: string;
  title: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
  entityType?: ActivityEvent['entityType'];
  entityId?: string;
  route?: string;
}

export interface DashboardActivityItem {
  id: string;
  title: string;
  detail: string;
  createdAt: Date;
  actorName?: string;
  entityType: ActivityEvent['entityType'];
  entityId: string;
}

export interface DashboardQuickAction {
  id: string;
  label: string;
  route: string;
}

export interface DashboardPayload {
  companyId: string;
  role: UserRole;
  scope: DashboardScope;
  metrics: DashboardMetric[];
  charts: DashboardChart[];
  alerts: DashboardAlert[];
  activity: DashboardActivityItem[];
  quickActions: DashboardQuickAction[];
}

export interface AgingBucket {
  bucket: 'current' | '1_30' | '31_60' | '61_90' | 'over_90';
  amount: number;
}

export interface FinanceOverview {
  openReceivables: number;
  openPayables: number;
  paidThisMonth: number;
  billedThisMonth: number;
  expenseReceiptsThisMonth: number;
}

export interface SanitizedUser extends Omit<User, 'password'> {}
