import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { seedData } from './seed-data';
import {
  Company,
  Position,
  User,
  CompanyRoleAssignment,
	  Project,
	  ProjectVisibility,
	  Task,
  Comment,
  Contact,
	  ContactRole,
	  ContactRoleType,
	  ContactRoleSource,
	  LeadStatus,
	  Opportunity,
	  OpportunityStage,
	  CrmProposal,
	  ProposalLineItem,
	  ProposalStatus,
	  CrmCampaign,
	  CampaignStatus,
	  CampaignDeliverable,
	  CampaignDeliverableStatus,
	  CampaignFulfillment,
	  CampaignAssignment,
	  CampaignAssignmentStatus,
	  CampaignExpense,
	  CampaignExpenseStatus,
	  VendorRequest,
  VendorRequestStatus,
	  CommissionRule,
	  Commission,
	  CrmDashboardSummary,
	  CommissionBasis,
  CommissionRateType,
  CommissionStatus,
  Client,
  Supplier,
  InventoryItem,
  InventoryLot,
  InventoryLotStatus,
  InventoryIssue,
  PurchaseRequisition,
  PurchaseRequisitionStatus,
  PurchaseRequisitionLineItem,
  Expense,
  FollowUp,
  FollowUpAssignee,
  FollowUpStatus,
  FollowUpOutcome,
  FollowUpEntityType,
  FollowUpChannel,
  FollowUpPriority,
  InventoryLocationBalance,
  InventoryTransfer,
  PurchaseOrder,
  PurchaseReceipt,
  PurchaseOrderStatus,
  SalesOrder,
  SalesOrderStatus,
  SalesOrderFulfillmentStatus,
  Delivery,
  DeliveryStatus,
  DeliveryLineItem,
  WhatsAppInstance,
  WhatsAppInstanceState,
  WhatsAppMessage,
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
  WhatsAppMessageType,
  WhatsAppChatSettings,
  WhatsAppChatVisibility,
  Contribution,
  ContributionRole,
  ContributionSourceType,
  contributionRoles,
  Invoice,
  InvoiceTemplate,
  InvoiceTemplateLayout,
  InvoiceColumn,
  InvoiceBankAccount,
  InvoiceStatus,
  SanitizedUser,
  UserRole,
  Payment,
  VendorBill,
  VendorBillPayment,
  VendorBillStatus,
  PurchaseOrderPayableSummary,
  SupplierPayablesSummary,
  LedgerAccount,
  LedgerAccountType,
  JournalEntry,
  JournalEntryLine,
  FinanceOverview,
  AgingBucket,
  StockMovement,
  StockMovementType,
  ActivityEvent,
  ClientRevenueSummary,
  InventoryReportSummary,
  DashboardActivityItem,
  DashboardAlert,
  DashboardChart,
  DashboardChartDatum,
  DashboardMetric,
  DashboardPayload,
  DashboardQuickAction,
  ManagementReportSummary,
  PurchaseReportSummary,
  SupplierSpendSummary,
  NumberingEntityType,
  CompanyNumberingSetting,
  RecordAttachment,
  RecordEntityType,
  RecordTimelineItem,
  AccountActivityReport,
  TrialBalanceReport,
  ProfitAndLossReport,
  CompanyFinanceSettings,
  CustomFieldDefinition,
  CustomFieldEntityType,
  CustomFieldType,
  customFieldTypes,
  InfluencerAccount,
  Notification,
  NotificationType,
  NotificationPrefs,
  Warehouse,
  CreditNote,
  CreditNoteLineItem,
  TimeEntry,
  Department,
  Employee,
  LeaveType,
  LeaveRequest,
  LeaveBalance,
} from '../types';
import {
  NOTIFICATION_META,
  defaultNotificationPrefs,
  normalizeNotificationPrefs,
} from '../notifications';
import { hashPassword, isHashed } from '../password';

type CreateUserInput = Omit<User, 'id'> & { id?: string };
type CreateTaskInput = Omit<Task, 'id' | 'createdAt'> & { createdAt?: Date | string };
type UpdateTaskInput = Partial<Omit<Task, 'id'>>;
type CreateEmployeeInput = Omit<Employee, 'id' | 'status' | 'annualLeaveAllowance' | 'createdAt' | 'updatedAt'> & {
  status?: Employee['status'];
  annualLeaveAllowance?: number;
  hireDate?: Date | string;
  endDate?: Date | string;
};
type UpdateEmployeeInput = Partial<Omit<Employee, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>> & {
  hireDate?: Date | string;
  endDate?: Date | string;
};
type UpdateContactInput = Partial<
  Omit<Contact, 'id' | 'companyId' | 'createdAt' | 'nextFollowupDate' | 'convertedToClientAt'>
> & {
  nextFollowupDate?: Date | null;
  convertedToClientAt?: Date | null;
};
type CreateOpportunityInput = Omit<Opportunity, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};
type UpdateOpportunityInput = Partial<Omit<Opportunity, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>;
type CreateVendorRequestInput = Omit<
  VendorRequest,
  'id' | 'requestedByUserId' | 'requestedByName' | 'reviewedByUserId' | 'reviewedByName' | 'reviewedAt' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
  requestedByUserId?: string;
  requestedByName?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
	};
type UpdateVendorRequestInput = Partial<
  Omit<VendorRequest, 'id' | 'companyId' | 'requestedByUserId' | 'requestedByName' | 'reviewedByUserId' | 'reviewedByName' | 'reviewedAt' | 'createdAt' | 'updatedAt'>
>;
type CreateCrmProposalInput = Omit<
  CrmProposal,
  'id' | 'proposalNumber' | 'contactId' | 'totalAmount' | 'acceptedAt' | 'declinedAt' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
  proposalNumber?: string;
  contactId?: string;
  acceptedAt?: Date | string;
  declinedAt?: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};
type UpdateCrmProposalInput = Partial<
  Omit<CrmProposal, 'id' | 'companyId' | 'opportunityId' | 'contactId' | 'proposalNumber' | 'totalAmount' | 'acceptedAt' | 'declinedAt' | 'createdAt' | 'updatedAt'>
>;
type CreateCrmCampaignInput = Omit<CrmCampaign, 'id' | 'archivedAt' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  archivedAt?: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};
type UpdateCrmCampaignInput = Partial<
  Omit<CrmCampaign, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>
>;
type CreateCampaignDeliverableInput = Omit<CampaignDeliverable, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};
type UpdateCampaignDeliverableInput = Partial<Omit<CampaignDeliverable, 'id' | 'companyId' | 'campaignId' | 'createdAt' | 'updatedAt'>>;
type CreateCampaignAssignmentInput = Omit<CampaignAssignment, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};
type UpdateCampaignAssignmentInput = Partial<Omit<CampaignAssignment, 'id' | 'companyId' | 'campaignId' | 'contactId' | 'createdAt' | 'updatedAt'>>;
type CreateCampaignExpenseInput = Omit<CampaignExpense, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};
type UpdateCampaignExpenseInput = Partial<Omit<CampaignExpense, 'id' | 'companyId' | 'campaignId' | 'createdAt' | 'updatedAt'>>;
type CreateCommissionRuleInput = Omit<CommissionRule, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};
type CreateClientInput = Omit<Client, 'id' | 'reference'> & { reference?: string };
type CreateSupplierInput = Omit<Supplier, 'id' | 'reference'> & { reference?: string };
type CreateInventoryItemInput = Omit<InventoryItem, 'id' | 'sku'> & { sku?: string };
type CreateInventoryLotInput = {
  companyId: string;
  inventoryItemId: string;
  lotNumber: string;
  quantity: number;
  location?: string;
  unitCost?: number;
  expiryDate?: Date | string;
  manufactureDate?: Date | string;
  supplierId?: string;
  receivedAt?: Date | string;
  note?: string;
};
type CreateInventoryIssueInput = Omit<InventoryIssue, 'id' | 'issuedAt'> & {
  issuedAt?: Date | string;
};
type CreateInventoryTransferInput = Omit<InventoryTransfer, 'id' | 'transferredAt'> & {
  transferredAt?: Date | string;
};
type CreatePurchaseOrderInput = Omit<
  PurchaseOrder,
  'id' | 'orderNumber' | 'totalAmount' | 'receivedAt' | 'approvalStatus' | 'approvedBy' | 'approvedAt' | 'rejectionReason'
> & { orderNumber?: string };
type CreateSalesOrderInput = Omit<
  SalesOrder,
  'id' | 'orderNumber' | 'totalAmount' | 'invoiceId'
> & { orderNumber?: string };
type CreatePurchaseReceiptInput = Omit<PurchaseReceipt, 'id'>;
type CreatePurchaseRequisitionInput = {
  companyId: string;
  department?: string;
  items: PurchaseRequisitionLineItem[];
  neededBy?: Date | string;
  notes?: string;
  preferredSupplierId?: string;
};
type CreateExpenseInput = {
  companyId: string;
  expenseDate?: Date | string;
  category: string;
  vendor?: string;
  amount: number;
  description?: string;
  paymentMethod?: string;
  reference?: string;
  projectId?: string;
  attachmentUrl?: string;
};
type CreateAccountInput = Omit<LedgerAccount, 'id' | 'code'> & { code?: string };
type CreateJournalInput = Omit<JournalEntry, 'id' | 'createdAt'>;
type CreateVendorBillInput = Omit<VendorBill, 'id' | 'billNumber'> & { billNumber?: string };
type CreateVendorBillPaymentInput = Omit<VendorBillPayment, 'id'>;
type CreateInvoiceTemplateInput = Omit<InvoiceTemplate, 'id' | 'createdAt' | 'updatedAt'>;
type CreateRecordAttachmentInput = Omit<
  RecordAttachment,
  'id' | 'createdAt' | 'uploadedByUserId' | 'uploadedByName'
> & {
  createdAt?: Date | string;
  uploadedByUserId?: string;
  uploadedByName?: string;
};

const defaultLedgerAccounts: Array<
  Omit<LedgerAccount, 'id' | 'companyId'> & { code: string; name: string; type: LedgerAccountType }
> = [
  { code: '1000', name: 'Cash', type: 'Asset', detailType: 'Cash and cash equivalents', description: 'Cash on hand and petty cash.', isActive: true, isSystem: true },
  { code: '1010', name: 'Bank Accounts', type: 'Asset', detailType: 'Bank', description: 'Operating and settlement bank balances.', isActive: true, isSystem: true },
  { code: '1100', name: 'Accounts Receivable', type: 'Asset', detailType: 'Trade receivables', description: 'Outstanding customer invoice balances.', isActive: true, isSystem: true },
  { code: '1200', name: 'Inventory', type: 'Asset', detailType: 'Inventory asset', description: 'Tracked inventory on hand.', isActive: true, isSystem: true },
  { code: '1300', name: 'Prepaid Expenses', type: 'Asset', detailType: 'Prepayments', description: 'Advance payments for future periods.', isActive: true, isSystem: true },
  { code: '1500', name: 'Equipment', type: 'Asset', detailType: 'Fixed assets', description: 'Operational equipment and devices.', isActive: true, isSystem: true },
  { code: '1510', name: 'Furniture and Fixtures', type: 'Asset', detailType: 'Fixed assets', description: 'Office furniture and fixtures.', isActive: true, isSystem: true },
  { code: '2000', name: 'Accounts Payable', type: 'Liability', detailType: 'Trade payables', description: 'Outstanding supplier invoices.', isActive: true, isSystem: true },
  { code: '2100', name: 'Accrued Expenses', type: 'Liability', detailType: 'Accruals', description: 'Expenses incurred but not yet invoiced.', isActive: true, isSystem: true },
  { code: '2200', name: 'Sales Tax Payable', type: 'Liability', detailType: 'Tax liability', description: 'Collected VAT and sales tax payable.', isActive: true, isSystem: true },
  { code: '2300', name: 'Commissions Payable', type: 'Liability', detailType: 'Accrued payroll', description: 'Approved but unpaid sales commissions owed to staff.', isActive: true, isSystem: true },
  { code: '3000', name: "Owner's Capital", type: 'Equity', detailType: 'Capital', description: 'Owner invested capital.', isActive: true, isSystem: true },
  { code: '3100', name: 'Retained Earnings', type: 'Equity', detailType: 'Retained earnings', description: 'Accumulated prior-year earnings.', isActive: true, isSystem: true },
  { code: '3200', name: 'Current Year Earnings', type: 'Equity', detailType: 'Current earnings', description: 'Current period net earnings.', isActive: true, isSystem: true },
  { code: '4000', name: 'Sales Revenue', type: 'Revenue', detailType: 'Product revenue', description: 'Revenue from product and inventory sales.', isActive: true, isSystem: true },
  { code: '4100', name: 'Service Revenue', type: 'Revenue', detailType: 'Service revenue', description: 'Revenue from projects and services.', isActive: true, isSystem: true },
  { code: '4200', name: 'Other Revenue', type: 'Revenue', detailType: 'Other income', description: 'Non-core operating income.', isActive: true, isSystem: true },
  { code: '5000', name: 'Operating Expense', type: 'Expense', detailType: 'Operating expense', description: 'General operating expenses.', isActive: true, isSystem: true },
  { code: '5100', name: 'Cost of Goods Sold', type: 'Expense', detailType: 'Cost of sales', description: 'Direct cost of delivered goods.', isActive: true, isSystem: true },
  { code: '5200', name: 'Salaries Expense', type: 'Expense', detailType: 'Payroll expense', description: 'Employee compensation expense.', isActive: true, isSystem: true },
  { code: '5300', name: 'Utilities Expense', type: 'Expense', detailType: 'Utilities', description: 'Electricity, internet, and utilities.', isActive: true, isSystem: true },
  { code: '5400', name: 'Supplies Expense', type: 'Expense', detailType: 'Supplies', description: 'Consumables and office supplies.', isActive: true, isSystem: true },
  { code: '5500', name: 'Rent Expense', type: 'Expense', detailType: 'Facility costs', description: 'Office and warehouse rent.', isActive: true, isSystem: true },
  { code: '5600', name: 'Depreciation Expense', type: 'Expense', detailType: 'Depreciation', description: 'Periodic depreciation of fixed assets.', isActive: true, isSystem: true },
  { code: '5700', name: 'Marketing Expense', type: 'Expense', detailType: 'Marketing', description: 'Promotional and campaign spend.', isActive: true, isSystem: true },
  { code: '5800', name: 'Travel Expense', type: 'Expense', detailType: 'Travel', description: 'Business travel and related costs.', isActive: true, isSystem: true },
  { code: '5900', name: 'Commission Expense', type: 'Expense', detailType: 'Payroll expense', description: 'Sales commissions earned by staff (accrual basis).', isActive: true, isSystem: true },
];

const ledgerAccountCodeBases: Record<LedgerAccountType, number> = {
  Asset: 1000,
  Liability: 2000,
  Equity: 3000,
  Revenue: 4000,
  Expense: 5000,
};

const defaultNumberingSettings: Record<
  NumberingEntityType,
  { prefix: string; padLength: number }
> = {
  client: { prefix: 'AR-', padLength: 2 },
  supplier: { prefix: 'TP-', padLength: 2 },
  inventory_item: { prefix: 'SKU-', padLength: 4 },
  purchase_order: { prefix: 'PO-', padLength: 4 },
  purchase_requisition: { prefix: 'PR-', padLength: 4 },
  sales_order: { prefix: 'SO-', padLength: 4 },
  sales_invoice: { prefix: 'INV-', padLength: 4 },
  vendor_invoice: { prefix: 'VI-', padLength: 4 },
  delivery: { prefix: 'DL-', padLength: 4 },
};

const numberingEntityTypes = Object.keys(defaultNumberingSettings) as NumberingEntityType[];

const defaultInvoiceTemplates: Array<
  Omit<CreateInvoiceTemplateInput, 'companyId' | 'isDefault'> & { isDefault?: boolean }
> = [
  {
    name: 'Classic',
    layout: 'classic',
    isDefault: true,
    primaryColor: '#111827',
    accentColor: '#2563eb',
    paymentInstructions: 'Payment is due within 30 days.',
    terms: 'Thank you for your business.',
    footerNote: 'Generated by TaskFlow',
    watermarkEnabled: false,
    watermarkText: 'DRAFT',
    watermarkOpacity: 0.12,
    showCompanyAddress: true,
    showTaxId: true,
  },
  {
    name: 'Modern',
    layout: 'modern',
    primaryColor: '#0f766e',
    accentColor: '#f59e0b',
    paymentInstructions: 'Please include the invoice number with your payment.',
    terms: 'Payment terms are shown on the invoice.',
    footerNote: 'We appreciate your business.',
    watermarkEnabled: false,
    watermarkText: 'DRAFT',
    watermarkOpacity: 0.12,
    showCompanyAddress: true,
    showTaxId: true,
  },
  {
    name: 'Compact',
    layout: 'compact',
    primaryColor: '#374151',
    accentColor: '#16a34a',
    paymentInstructions: 'Payment due on receipt unless otherwise agreed.',
    terms: 'All amounts are shown in the invoice currency.',
    footerNote: 'TaskFlow invoice',
    watermarkEnabled: false,
    watermarkText: 'DRAFT',
    watermarkOpacity: 0.12,
    showCompanyAddress: true,
    showTaxId: false,
  },
];

const invoiceTemplateLayouts: InvoiceTemplateLayout[] = ['classic', 'modern', 'compact', 'letterhead'];

const activityEntityTypes: ActivityEvent['entityType'][] = [
  'contact',
  'opportunity',
  'vendor_request',
  'commission',
  'client',
  'project',
  'task',
  'supplier',
  'inventory_item',
  'purchase_order',
  'sales_order',
  'delivery',
  'invoice',
  'vendor_bill',
];
type CreateStockMovementInput = Omit<StockMovement, 'id' | 'createdAt'> & {
  createdAt?: Date | string;
};
type CreateActivityEventInput = Omit<ActivityEvent, 'id' | 'createdAt'> & {
  createdAt?: Date | string;
};

const defaultDbPath = path.resolve(
  process.env.TASKFLOW_DB_PATH || path.join(process.cwd(), 'taskflow.db')
);

const dashboardPalette = {
  slate: '#94a3b8',
  blue: '#3b82f6',
  cyan: '#06b6d4',
  green: '#22c55e',
  amber: '#f59e0b',
  orange: '#f97316',
  red: '#ef4444',
  violet: '#8b5cf6',
};

const getMonthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (date: Date, months: number) =>
  new Date(date.getFullYear(), date.getMonth() + months, 1);
const isBetween = (value: Date, start: Date, end: Date) => value >= start && value < end;

const buildMonthWindows = (count = 6, now = new Date()) =>
  Array.from({ length: count }, (_, index) => {
    const start = addMonths(getMonthStart(now), -(count - 1 - index));
    const end = addMonths(start, 1);
    return {
      label: start.toLocaleString('en-US', { month: 'short' }),
      start,
      end,
    };
  });

const makeDonutChart = (
  id: string,
  title: string,
  description: string,
  slices: Array<{ key: string; label: string; color: string; value: number }>,
): DashboardChart => ({
  id,
  title,
  description,
  type: 'donut',
  series: slices.map((slice) => ({
    key: slice.key,
    label: slice.label,
    color: slice.color,
  })),
  data: [
    {
      label: 'total',
      values: Object.fromEntries(slices.map((slice) => [slice.key, slice.value])),
    },
  ],
});

const makeLineChart = (
  id: string,
  title: string,
  description: string,
  series: Array<{ key: string; label: string; color: string }>,
  data: DashboardChartDatum[],
): DashboardChart => ({
  id,
  title,
  description,
  type: 'line',
  series,
  data,
});

const makeStackedBarChart = (
  id: string,
  title: string,
  description: string,
  series: Array<{ key: string; label: string; color: string }>,
  data: DashboardChartDatum[],
): DashboardChart => ({
  id,
  title,
  description,
  type: 'stacked-bar',
  series,
  data,
});

export interface DataStoreOptions {
  dbPath?: string;
  seedOnEmpty?: boolean;
  /** Called after notifications are created, so the server can dispatch emails. */
  onNotificationsCreated?: (notifications: Notification[]) => void;
}

/** In-app deep link for a task notification (project board, or the tasks page). */
function taskLink(projectId?: string | null): string {
  return projectId ? `/projects/${projectId}` : '/tasks';
}

export class DataStore {
  private db: Database.Database;
  private currentActor?: { userId?: string; name?: string };
  private onNotificationsCreated?: (notifications: Notification[]) => void;

  constructor(options: DataStoreOptions = {}) {
    this.db = new Database(options.dbPath ?? defaultDbPath);
    this.onNotificationsCreated = options.onNotificationsCreated;
    this.applyMigrations();
    if (options.seedOnEmpty ?? true) {
      this.seedIfEmpty();
    }
    this.ensureFinanceDefaults();
    this.ensureNumberingDefaults();
    this.ensureCompanyFinanceSettings();
    this.ensureWarehousesFromLocations();
    this.ensureBootstrapAdmin();
  }

  /**
   * Idempotent: register a warehouse for any location that currently holds stock
   * (or is an item's default) but has no warehouse row yet. Runs every startup
   * so existing data and freshly-seeded DBs both get managed warehouses under
   * the enforce rule. Only current placements are considered, so deleting an
   * empty warehouse won't resurrect it from historical issues/transfers.
   */
  private ensureWarehousesFromLocations() {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT companyId, location FROM (
           SELECT companyId, location FROM inventory_location_balances WHERE quantity != 0
           UNION SELECT companyId, location FROM inventory_items WHERE location IS NOT NULL
         ) WHERE location IS NOT NULL AND TRIM(location) != ''`,
      )
      .all() as Array<{ companyId: string; location: string }>;
    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO warehouses (id, companyId, name, code, address, isDefault, isActive, createdAt, updatedAt)
       VALUES (@id, @companyId, @name, NULL, NULL, 0, 1, @now, @now)`,
    );
    const tx = this.db.transaction(() => {
      for (const row of rows) {
        insert.run({ id: uuid(), companyId: row.companyId, name: row.location, now });
      }
    });
    tx();
  }

  /**
   * Production bootstrap: if env vars ADMIN_EMAIL / ADMIN_PASSWORD are set
   * AND no Admin user exists yet in the DB, create one. Idempotent — never
   * overwrites an existing admin. Safe to run on every startup.
   *
   * Set ADMIN_NAME to control the display name; defaults to "Administrator".
   * Auto-assigns the new admin to every existing company.
   */
  private ensureBootstrapAdmin() {
    const email = (process.env.ADMIN_EMAIL || '').trim();
    const password = process.env.ADMIN_PASSWORD || '';
    if (!email || !password) return; // not configured — nothing to do

    // Already have an admin? Don't touch it.
    const existingAdmin = this.db
      .prepare(`SELECT id FROM users WHERE role = 'Admin' LIMIT 1`)
      .get() as { id?: string } | undefined;
    if (existingAdmin?.id) return;

    // Already a user with this email? Don't overwrite.
    const byEmail = this.db
      .prepare(`SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`)
      .get(email) as { id?: string } | undefined;
    if (byEmail?.id) return;

    const name = (process.env.ADMIN_NAME || 'Administrator').trim();

    // If there are no companies yet, bootstrap one so the admin has somewhere
    // to log into. COMPANY_NAME / COMPANY_WEBSITE / COMPANY_ADDRESS env vars
    // configure it; otherwise sensible defaults are used.
    let companies = this.db
      .prepare(`SELECT id FROM companies`)
      .all() as Array<{ id: string }>;
    if (companies.length === 0) {
      const bootstrapCompany = this.createCompany({
        name: (process.env.COMPANY_NAME || 'My Company').trim(),
        website: process.env.COMPANY_WEBSITE || undefined,
        address: process.env.COMPANY_ADDRESS || undefined,
      });
      companies = [{ id: bootstrapCompany.id }];
      this.ensureFinanceDefaults();
      this.ensureNumberingDefaults();
      this.ensureCompanyFinanceSettings();
      console.log(`[bootstrap] Created initial company "${bootstrapCompany.name}"`);
    }
    const companyIds = companies.map((c) => c.id);
    const companyRoles: CompanyRoleAssignment[] = companyIds.map((cid) => ({
      companyId: cid,
      role: 'Admin' as UserRole,
    }));

    try {
      this.createUser({
        name,
        email,
        password,
        role: 'Admin' as UserRole,
        companyIds,
        companyRoles,
        avatar: undefined,
        isSuperAdmin: true,
        commissionEligible: false,
      });
      console.log(`[bootstrap] Created admin user ${email} on ${companyIds.length} company(ies)`);
    } catch (error) {
      console.error('[bootstrap] Failed to create admin user', error);
    }
  }

  private applyMigrations() {
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        appliedAt TEXT NOT NULL
      );
    `);

    const applied = new Set(
      (this.db.prepare('SELECT id FROM schema_migrations ORDER BY id ASC').all() as Array<{ id: string }>).map(
        (row) => row.id,
      ),
    );
    const markApplied = this.db.prepare(
      'INSERT INTO schema_migrations (id, appliedAt) VALUES (?, ?)',
    );

    const migrations: Array<{ id: string; run: () => void }> = [
      {
        id: '001_core_schema',
        run: () =>
          this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        website TEXT,
        address TEXT
      );
      CREATE TABLE IF NOT EXISTS positions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        companyId TEXT
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL,
        companyIds TEXT NOT NULL,
        positionId TEXT,
        companyRoles TEXT,
        avatar TEXT,
        password TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT,
        companyId TEXT NOT NULL,
        visibility TEXT NOT NULL,
        memberIds TEXT,
        clientId TEXT
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        dueDate TEXT,
        assignedUserIds TEXT,
        tags TEXT,
        companyId TEXT NOT NULL,
        projectId TEXT NOT NULL,
        color TEXT,
        dependencies TEXT,
        parentTaskId TEXT,
        invoiceImage TEXT,
        invoiceVendor TEXT,
        invoiceNumber TEXT,
        invoiceAmount REAL,
        invoiceDate TEXT,
        generatedInvoiceId TEXT
      );
      CREATE TABLE IF NOT EXISTS time_entries (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        taskId TEXT NOT NULL,
        userId TEXT NOT NULL,
        userName TEXT,
        minutes INTEGER NOT NULL,
        spentOn TEXT NOT NULL,
        note TEXT,
        cost REAL,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(taskId);
      CREATE INDEX IF NOT EXISTS idx_time_entries_company ON time_entries(companyId, spentOn);
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        userId TEXT NOT NULL,
        content TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        reference TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        address TEXT NOT NULL,
        companyId TEXT NOT NULL,
        contactName TEXT,
        phone TEXT,
        vatNumber TEXT,
        creditLimit REAL,
        creditNumber TEXT,
        paymentMethod TEXT,
        status TEXT,
        notes TEXT,
        UNIQUE(companyId, reference)
      );
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        reference TEXT NOT NULL,
        name TEXT NOT NULL,
        contactName TEXT,
        email TEXT,
        phone TEXT,
        paymentTermsDays REAL,
        notes TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        UNIQUE(companyId, reference)
      );
      CREATE TABLE IF NOT EXISTS inventory_items (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        sku TEXT NOT NULL,
        barcode TEXT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        unit TEXT NOT NULL,
        vatApplicable INTEGER NOT NULL DEFAULT 1,
        tracksInventory INTEGER NOT NULL DEFAULT 1,
        onHand REAL NOT NULL,
        reorderPoint REAL NOT NULL,
        unitCost REAL NOT NULL,
        salePrice REAL,
        preferredVendor TEXT,
        preferredSupplierId TEXT,
        location TEXT,
        UNIQUE(companyId, sku),
        UNIQUE(companyId, barcode)
      );
      CREATE TABLE IF NOT EXISTS inventory_location_balances (
        companyId TEXT NOT NULL,
        inventoryItemId TEXT NOT NULL,
        location TEXT NOT NULL,
        quantity REAL NOT NULL,
        PRIMARY KEY (companyId, inventoryItemId, location)
      );
      CREATE TABLE IF NOT EXISTS inventory_issues (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        inventoryItemId TEXT NOT NULL,
        quantity REAL NOT NULL,
        location TEXT NOT NULL,
        issuedAt TEXT NOT NULL,
        issuedTo TEXT,
        note TEXT,
        projectId TEXT,
        taskId TEXT
      );
      CREATE TABLE IF NOT EXISTS inventory_transfers (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        inventoryItemId TEXT NOT NULL,
        quantity REAL NOT NULL,
        fromLocation TEXT NOT NULL,
        toLocation TEXT NOT NULL,
        transferredAt TEXT NOT NULL,
        note TEXT
      );
      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        inventoryItemId TEXT NOT NULL,
        movementType TEXT NOT NULL,
        quantityChange REAL NOT NULL,
        unitCost REAL,
        referenceType TEXT,
        referenceId TEXT,
        note TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS warehouses (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT,
        address TEXT,
        isDefault INTEGER NOT NULL DEFAULT 0,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        UNIQUE(companyId, name)
      );
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        orderNumber TEXT NOT NULL,
        supplierName TEXT NOT NULL,
        supplierId TEXT,
        orderDate TEXT NOT NULL,
        expectedDate TEXT,
        status TEXT NOT NULL,
        items TEXT NOT NULL,
        totalAmount REAL NOT NULL,
        notes TEXT,
        receivedAt TEXT
      );
      CREATE TABLE IF NOT EXISTS purchase_receipts (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        purchaseOrderId TEXT NOT NULL,
        receivedAt TEXT NOT NULL,
        notes TEXT,
        items TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sales_orders (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        orderNumber TEXT NOT NULL,
        clientId TEXT NOT NULL,
        orderDate TEXT NOT NULL,
        expectedDate TEXT,
        status TEXT NOT NULL,
        items TEXT NOT NULL,
        totalAmount REAL NOT NULL,
        notes TEXT,
        invoiceId TEXT
      );
      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        deliveryNumber TEXT NOT NULL,
        salesOrderId TEXT NOT NULL,
        status TEXT NOT NULL,
        items TEXT NOT NULL,
        carrier TEXT,
        trackingNumber TEXT,
        notes TEXT,
        scheduledFor TEXT,
        dispatchedAt TEXT,
        deliveredAt TEXT,
        cancelledAt TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS whatsapp_instances (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL UNIQUE,
        idInstance TEXT NOT NULL,
        apiTokenEncrypted TEXT NOT NULL,
        apiHost TEXT,
        phoneNumber TEXT,
        displayName TEXT,
        state TEXT NOT NULL DEFAULT 'notAuthorized',
        webhookToken TEXT NOT NULL,
        lastSyncedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        instanceId TEXT NOT NULL,
        direction TEXT NOT NULL,
        externalId TEXT,
        chatId TEXT NOT NULL,
        phone TEXT NOT NULL,
        contactId TEXT,
        type TEXT NOT NULL,
        body TEXT,
        mediaUrl TEXT,
        fileName TEXT,
        status TEXT NOT NULL,
        error TEXT,
        contextEntityType TEXT,
        contextEntityId TEXT,
        actorUserId TEXT,
        actorName TEXT,
        sentAt TEXT,
        deliveredAt TEXT,
        readAt TEXT,
        receivedAt TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS contributions (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        userId TEXT NOT NULL,
        userName TEXT,
        sourceType TEXT NOT NULL,
        sourceId TEXT NOT NULL,
        role TEXT NOT NULL,
        roleNote TEXT,
        weightPercent REAL NOT NULL DEFAULT 100,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        UNIQUE(companyId, sourceType, sourceId, userId, role)
      );
      CREATE TABLE IF NOT EXISTS whatsapp_chat_settings (
        companyId TEXT NOT NULL,
        chatId TEXT NOT NULL,
        visibility TEXT NOT NULL DEFAULT 'shared',
        ownerUserId TEXT,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY (companyId, chatId)
      );
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        invoiceNumber TEXT NOT NULL,
        companyId TEXT NOT NULL,
        clientId TEXT NOT NULL,
        salesOrderId TEXT,
        templateId TEXT,
        templateSnapshot TEXT,
        issueDate TEXT NOT NULL,
        dueDate TEXT NOT NULL,
        lineItems TEXT NOT NULL,
        total REAL NOT NULL,
        status TEXT NOT NULL,
        notes TEXT,
        currency TEXT,
        taxRate REAL,
        sentAt TEXT,
        paidAt TEXT
      );
      CREATE TABLE IF NOT EXISTS credit_notes (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        invoiceId TEXT,
        clientId TEXT NOT NULL,
        creditNoteNumber TEXT NOT NULL,
        issueDate TEXT NOT NULL,
        lineItems TEXT NOT NULL,
        total REAL NOT NULL,
        reason TEXT,
        status TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_credit_notes_company ON credit_notes(companyId, issueDate);
      CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON credit_notes(invoiceId);
      CREATE TABLE IF NOT EXISTS invoice_templates (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        name TEXT NOT NULL,
        layout TEXT NOT NULL,
        isDefault INTEGER NOT NULL DEFAULT 0,
        primaryColor TEXT NOT NULL,
        accentColor TEXT NOT NULL,
        logoUrl TEXT,
        headerImageUrl TEXT,
        footerImageUrl TEXT,
        letterheadPdfUrl TEXT,
        paymentInstructions TEXT,
        terms TEXT,
        footerNote TEXT,
        watermarkEnabled INTEGER NOT NULL DEFAULT 0,
        watermarkText TEXT,
        watermarkOpacity REAL NOT NULL DEFAULT 0.12,
        showCompanyAddress INTEGER NOT NULL DEFAULT 1,
        showTaxId INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        invoiceId TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT,
        note TEXT,
        paidAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ledger_accounts (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        detailType TEXT,
        description TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        isSystem INTEGER NOT NULL DEFAULT 0,
        UNIQUE(companyId, code)
      );
      CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        sourceType TEXT NOT NULL,
        sourceId TEXT,
        memo TEXT,
        entryDate TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS journal_lines (
        id TEXT PRIMARY KEY,
        entryId TEXT NOT NULL,
        accountId TEXT NOT NULL,
        description TEXT,
        debit REAL NOT NULL,
        credit REAL NOT NULL,
        FOREIGN KEY(entryId) REFERENCES journal_entries(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS vendor_bills (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        vendorName TEXT NOT NULL,
        supplierId TEXT,
        purchaseOrderId TEXT,
        billNumber TEXT NOT NULL,
        referenceInvoiceNumber TEXT,
        issueDate TEXT NOT NULL,
        dueDate TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL,
        notes TEXT,
        expenseAccountId TEXT,
        paidAt TEXT
      );
      CREATE TABLE IF NOT EXISTS vendor_bill_payments (
        id TEXT PRIMARY KEY,
        billId TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT,
        note TEXT,
        paidAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS activity_events (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        actorUserId TEXT,
        actorName TEXT,
        entityType TEXT NOT NULL,
        entityId TEXT NOT NULL,
        action TEXT NOT NULL,
        summary TEXT NOT NULL,
        metadata TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tokens (
        token TEXT PRIMARY KEY,
        userId TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        userId TEXT NOT NULL,
        category TEXT NOT NULL,
        type TEXT NOT NULL,
        priority TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        link TEXT,
        entityType TEXT,
        entityId TEXT,
        readAt TEXT,
        emailedAt TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(userId, createdAt);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(userId, readAt);
      CREATE INDEX IF NOT EXISTS idx_notifications_dispatch ON notifications(priority, emailedAt);
    `),
      },
      {
        id: '002_legacy_columns',
        run: () => {
          const taskColumns = this.db.prepare(`PRAGMA table_info('tasks')`).all() as any[];
          if (!taskColumns.some((c) => c.name === 'parentTaskId')) {
            this.db.exec(`ALTER TABLE tasks ADD COLUMN parentTaskId TEXT;`);
          }

          const userColumns = this.db.prepare(`PRAGMA table_info('users')`).all() as any[];
          if (!userColumns.some((c) => c.name === 'companyRoles')) {
            this.db.exec(`ALTER TABLE users ADD COLUMN companyRoles TEXT;`);
          }
        },
      },
      {
        id: '003_operations_backbone',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS suppliers (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              name TEXT NOT NULL,
              contactName TEXT,
              email TEXT,
              phone TEXT,
              paymentTermsDays REAL,
              notes TEXT,
              isActive INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS stock_movements (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              inventoryItemId TEXT NOT NULL,
              movementType TEXT NOT NULL,
              quantityChange REAL NOT NULL,
              unitCost REAL,
              referenceType TEXT,
              referenceId TEXT,
              note TEXT,
              createdAt TEXT NOT NULL
            );
          `);

          const inventoryColumns = this.db.prepare(`PRAGMA table_info('inventory_items')`).all() as any[];
          if (!inventoryColumns.some((c) => c.name === 'preferredSupplierId')) {
            this.db.exec(`ALTER TABLE inventory_items ADD COLUMN preferredSupplierId TEXT;`);
          }

          const purchaseOrderColumns = this.db.prepare(`PRAGMA table_info('purchase_orders')`).all() as any[];
          if (!purchaseOrderColumns.some((c) => c.name === 'supplierId')) {
            this.db.exec(`ALTER TABLE purchase_orders ADD COLUMN supplierId TEXT;`);
          }
        },
      },
      {
        id: '004_purchase_receipts_and_supplier_payables',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS purchase_receipts (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              purchaseOrderId TEXT NOT NULL,
              receivedAt TEXT NOT NULL,
              notes TEXT,
              items TEXT NOT NULL
            );
          `);

          const vendorBillColumns = this.db.prepare(`PRAGMA table_info('vendor_bills')`).all() as any[];
          if (!vendorBillColumns.some((c) => c.name === 'supplierId')) {
            this.db.exec(`ALTER TABLE vendor_bills ADD COLUMN supplierId TEXT;`);
          }
          if (!vendorBillColumns.some((c) => c.name === 'purchaseOrderId')) {
            this.db.exec(`ALTER TABLE vendor_bills ADD COLUMN purchaseOrderId TEXT;`);
          }
        },
      },
      {
        id: '005_vendor_bill_payments',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS vendor_bill_payments (
              id TEXT PRIMARY KEY,
              billId TEXT NOT NULL,
              amount REAL NOT NULL,
              method TEXT,
              note TEXT,
              paidAt TEXT NOT NULL
            );
          `);
        },
      },
      {
        id: '006_client_backbone_and_activity',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS activity_events (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              actorUserId TEXT,
              actorName TEXT,
              entityType TEXT NOT NULL,
              entityId TEXT NOT NULL,
              action TEXT NOT NULL,
              summary TEXT NOT NULL,
              metadata TEXT,
              createdAt TEXT NOT NULL
            );
          `);

          const clientColumns = this.db.prepare(`PRAGMA table_info('clients')`).all() as any[];
          if (!clientColumns.some((c) => c.name === 'contactName')) {
            this.db.exec(`ALTER TABLE clients ADD COLUMN contactName TEXT;`);
          }
          if (!clientColumns.some((c) => c.name === 'phone')) {
            this.db.exec(`ALTER TABLE clients ADD COLUMN phone TEXT;`);
          }
          if (!clientColumns.some((c) => c.name === 'status')) {
            this.db.exec(`ALTER TABLE clients ADD COLUMN status TEXT;`);
          }
          if (!clientColumns.some((c) => c.name === 'notes')) {
            this.db.exec(`ALTER TABLE clients ADD COLUMN notes TEXT;`);
          }
        },
      },
      {
        id: '007_inventory_location_ledger',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS inventory_location_balances (
              companyId TEXT NOT NULL,
              inventoryItemId TEXT NOT NULL,
              location TEXT NOT NULL,
              quantity REAL NOT NULL,
              PRIMARY KEY (companyId, inventoryItemId, location)
            );
            CREATE TABLE IF NOT EXISTS inventory_issues (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              inventoryItemId TEXT NOT NULL,
              quantity REAL NOT NULL,
              location TEXT NOT NULL,
              issuedAt TEXT NOT NULL,
              issuedTo TEXT,
              note TEXT,
              projectId TEXT,
              taskId TEXT
            );
            CREATE TABLE IF NOT EXISTS inventory_transfers (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              inventoryItemId TEXT NOT NULL,
              quantity REAL NOT NULL,
              fromLocation TEXT NOT NULL,
              toLocation TEXT NOT NULL,
              transferredAt TEXT NOT NULL,
              note TEXT
            );
          `);

          const rows = this.db
            .prepare(
              'SELECT id, companyId, location, onHand FROM inventory_items WHERE COALESCE(onHand, 0) != 0',
            )
            .all() as Array<{ id: string; companyId: string; location: string | null; onHand: number }>;
          const insertBalance = this.db.prepare(
            'INSERT OR IGNORE INTO inventory_location_balances (companyId, inventoryItemId, location, quantity) VALUES (?, ?, ?, ?)',
          );
          rows.forEach((row) => {
            insertBalance.run(
              row.companyId,
              row.id,
              row.location || 'Unassigned',
              Number(row.onHand || 0),
            );
          });
        },
      },
      {
        id: '008_activity_actor_metadata',
        run: () => {
          const activityColumns = this.db.prepare(`PRAGMA table_info('activity_events')`).all() as any[];
          if (!activityColumns.some((c) => c.name === 'actorUserId')) {
            this.db.exec(`ALTER TABLE activity_events ADD COLUMN actorUserId TEXT;`);
          }
          if (!activityColumns.some((c) => c.name === 'actorName')) {
            this.db.exec(`ALTER TABLE activity_events ADD COLUMN actorName TEXT;`);
          }
        },
      },
      {
        id: '009_master_data_enhancements',
        run: () => {
          const clientColumns = this.db.prepare(`PRAGMA table_info('clients')`).all() as any[];
          if (!clientColumns.some((c) => c.name === 'reference')) {
            this.db.exec(`ALTER TABLE clients ADD COLUMN reference TEXT;`);
          }
          if (!clientColumns.some((c) => c.name === 'vatNumber')) {
            this.db.exec(`ALTER TABLE clients ADD COLUMN vatNumber TEXT;`);
          }
          if (!clientColumns.some((c) => c.name === 'creditLimit')) {
            this.db.exec(`ALTER TABLE clients ADD COLUMN creditLimit REAL;`);
          }
          if (!clientColumns.some((c) => c.name === 'creditNumber')) {
            this.db.exec(`ALTER TABLE clients ADD COLUMN creditNumber TEXT;`);
          }
          if (!clientColumns.some((c) => c.name === 'paymentMethod')) {
            this.db.exec(`ALTER TABLE clients ADD COLUMN paymentMethod TEXT;`);
          }

          const supplierColumns = this.db.prepare(`PRAGMA table_info('suppliers')`).all() as any[];
          if (!supplierColumns.some((c) => c.name === 'reference')) {
            this.db.exec(`ALTER TABLE suppliers ADD COLUMN reference TEXT;`);
          }

          const inventoryColumns = this.db.prepare(`PRAGMA table_info('inventory_items')`).all() as any[];
          if (!inventoryColumns.some((c) => c.name === 'barcode')) {
            this.db.exec(`ALTER TABLE inventory_items ADD COLUMN barcode TEXT;`);
          }
          if (!inventoryColumns.some((c) => c.name === 'vatApplicable')) {
            this.db.exec(`ALTER TABLE inventory_items ADD COLUMN vatApplicable INTEGER NOT NULL DEFAULT 1;`);
          }
          if (!inventoryColumns.some((c) => c.name === 'tracksInventory')) {
            this.db.exec(`ALTER TABLE inventory_items ADD COLUMN tracksInventory INTEGER NOT NULL DEFAULT 1;`);
          }

          const clientRows = this.db
            .prepare(`SELECT id, companyId FROM clients WHERE reference IS NULL OR TRIM(reference) = '' ORDER BY companyId ASC, name ASC, id ASC`)
            .all() as Array<{ id: string; companyId: string }>;
          const nextClientSeq = new Map<string, number>();
          clientRows.forEach((row) => {
            const next = (nextClientSeq.get(row.companyId) || 0) + 1;
            nextClientSeq.set(row.companyId, next);
            this.db
              .prepare(`UPDATE clients SET reference = ? WHERE id = ?`)
              .run(`AR-${String(next).padStart(2, '0')}`, row.id);
          });

          const supplierRows = this.db
            .prepare(`SELECT id, companyId FROM suppliers WHERE reference IS NULL OR TRIM(reference) = '' ORDER BY companyId ASC, name ASC, id ASC`)
            .all() as Array<{ id: string; companyId: string }>;
          const nextSupplierSeq = new Map<string, number>();
          supplierRows.forEach((row) => {
            const next = (nextSupplierSeq.get(row.companyId) || 0) + 1;
            nextSupplierSeq.set(row.companyId, next);
            this.db
              .prepare(`UPDATE suppliers SET reference = ? WHERE id = ?`)
              .run(`TP-${String(next).padStart(2, '0')}`, row.id);
          });

          this.db.exec(`
            UPDATE inventory_items SET vatApplicable = COALESCE(vatApplicable, 1);
            UPDATE inventory_items SET tracksInventory = COALESCE(tracksInventory, 1);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_company_reference ON clients (companyId, reference);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_company_reference ON suppliers (companyId, reference);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_company_barcode ON inventory_items (companyId, barcode);
          `);
        },
      },
      {
        id: '010_vendor_invoice_reference_number',
        run: () => {
          const vendorBillColumns = this.db.prepare(`PRAGMA table_info('vendor_bills')`).all() as any[];
          if (!vendorBillColumns.some((c) => c.name === 'referenceInvoiceNumber')) {
            this.db.exec(`ALTER TABLE vendor_bills ADD COLUMN referenceInvoiceNumber TEXT;`);
          }
        },
      },
      {
        id: '011_chart_of_accounts_enhancements',
        run: () => {
          const accountColumns = this.db.prepare(`PRAGMA table_info('ledger_accounts')`).all() as any[];
          if (!accountColumns.some((c) => c.name === 'detailType')) {
            this.db.exec(`ALTER TABLE ledger_accounts ADD COLUMN detailType TEXT;`);
          }
          if (!accountColumns.some((c) => c.name === 'description')) {
            this.db.exec(`ALTER TABLE ledger_accounts ADD COLUMN description TEXT;`);
          }
          if (!accountColumns.some((c) => c.name === 'isActive')) {
            this.db.exec(`ALTER TABLE ledger_accounts ADD COLUMN isActive INTEGER NOT NULL DEFAULT 1;`);
          }
          this.db.exec(`UPDATE ledger_accounts SET isActive = COALESCE(isActive, 1);`);
        },
      },
      {
        id: '012_record_support_and_numbering',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS record_attachments (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              entityType TEXT NOT NULL,
              entityId TEXT NOT NULL,
              fileName TEXT NOT NULL,
              url TEXT,
              mimeType TEXT,
              sizeBytes REAL,
              note TEXT,
              uploadedByUserId TEXT,
              uploadedByName TEXT,
              createdAt TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_record_attachments_entity
              ON record_attachments (companyId, entityType, entityId, createdAt);

            CREATE TABLE IF NOT EXISTS company_numbering_settings (
              companyId TEXT NOT NULL,
              entityType TEXT NOT NULL,
              prefix TEXT NOT NULL,
              padLength INTEGER NOT NULL,
              nextNumber INTEGER NOT NULL,
              updatedAt TEXT NOT NULL,
              PRIMARY KEY (companyId, entityType)
            );
          `);
        },
      },
      {
        id: '013_finance_period_controls',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS company_finance_settings (
              companyId TEXT PRIMARY KEY,
              fiscalYearStartMonth INTEGER NOT NULL DEFAULT 1,
              lockedThroughDate TEXT,
              currencyCode TEXT NOT NULL DEFAULT 'USD',
              updatedAt TEXT NOT NULL
            );
          `);
        },
      },
      {
        id: '014_invoice_templates',
        run: () => {
          const invoiceColumns = this.db.prepare(`PRAGMA table_info('invoices')`).all() as any[];
          if (!invoiceColumns.some((c) => c.name === 'templateId')) {
            this.db.exec(`ALTER TABLE invoices ADD COLUMN templateId TEXT;`);
          }
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS invoice_templates (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              name TEXT NOT NULL,
              layout TEXT NOT NULL,
              isDefault INTEGER NOT NULL DEFAULT 0,
              primaryColor TEXT NOT NULL,
              accentColor TEXT NOT NULL,
              logoUrl TEXT,
              headerImageUrl TEXT,
              footerImageUrl TEXT,
              letterheadPdfUrl TEXT,
              paymentInstructions TEXT,
              terms TEXT,
              footerNote TEXT,
              watermarkEnabled INTEGER NOT NULL DEFAULT 0,
              watermarkText TEXT,
              watermarkOpacity REAL NOT NULL DEFAULT 0.12,
              showCompanyAddress INTEGER NOT NULL DEFAULT 1,
              showTaxId INTEGER NOT NULL DEFAULT 1,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_invoice_templates_company ON invoice_templates (companyId, isDefault);
          `);
        },
      },
      {
        id: '015_invoice_template_watermark',
        run: () => {
          const templateColumns = this.db.prepare(`PRAGMA table_info('invoice_templates')`).all() as any[];
          if (!templateColumns.some((c) => c.name === 'watermarkEnabled')) {
            this.db.exec(`ALTER TABLE invoice_templates ADD COLUMN watermarkEnabled INTEGER NOT NULL DEFAULT 0;`);
          }
          if (!templateColumns.some((c) => c.name === 'watermarkText')) {
            this.db.exec(`ALTER TABLE invoice_templates ADD COLUMN watermarkText TEXT;`);
          }
          if (!templateColumns.some((c) => c.name === 'watermarkOpacity')) {
            this.db.exec(`ALTER TABLE invoice_templates ADD COLUMN watermarkOpacity REAL NOT NULL DEFAULT 0.12;`);
          }
          this.db.exec(`UPDATE invoice_templates SET watermarkOpacity = COALESCE(watermarkOpacity, 0.12);`);
        },
      },
      {
        id: '016_sales_orders',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS sales_orders (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              orderNumber TEXT NOT NULL,
              clientId TEXT NOT NULL,
              orderDate TEXT NOT NULL,
              expectedDate TEXT,
              status TEXT NOT NULL,
              items TEXT NOT NULL,
              totalAmount REAL NOT NULL,
              notes TEXT,
              invoiceId TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_orders_company_number
              ON sales_orders (companyId, orderNumber);
            CREATE INDEX IF NOT EXISTS idx_sales_orders_company_client
              ON sales_orders (companyId, clientId);
          `);
          const invoiceColumns = this.db.prepare(`PRAGMA table_info('invoices')`).all() as any[];
          if (!invoiceColumns.some((c) => c.name === 'salesOrderId')) {
            this.db.exec(`ALTER TABLE invoices ADD COLUMN salesOrderId TEXT;`);
          }
        },
      },
      {
        id: '017_company_currency_settings',
        run: () => {
          const financeColumns = this.db.prepare(`PRAGMA table_info('company_finance_settings')`).all() as any[];
          if (!financeColumns.some((c) => c.name === 'currencyCode')) {
            this.db.exec(`ALTER TABLE company_finance_settings ADD COLUMN currencyCode TEXT NOT NULL DEFAULT 'USD';`);
          }
          this.db.exec(`UPDATE company_finance_settings SET currencyCode = COALESCE(NULLIF(TRIM(currencyCode), ''), 'USD');`);
        },
      },
      {
        id: '018_contacts_master_data',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS contacts (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              kind TEXT NOT NULL DEFAULT 'Organization',
              name TEXT NOT NULL,
              legalName TEXT,
              contactPerson TEXT,
              email TEXT,
              phone TEXT,
              address TEXT,
              taxNumber TEXT,
              tags TEXT,
              notes TEXT,
              clientId TEXT,
              supplierId TEXT,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS contact_roles (
              id TEXT PRIMARY KEY,
              contactId TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
              companyId TEXT NOT NULL,
              role TEXT NOT NULL,
              source TEXT NOT NULL DEFAULT 'Manual',
              createdAt TEXT NOT NULL,
              UNIQUE(contactId, role)
            );

            CREATE INDEX IF NOT EXISTS idx_contacts_companyId ON contacts(companyId);
            CREATE INDEX IF NOT EXISTS idx_contact_roles_contactId ON contact_roles(contactId);
            CREATE INDEX IF NOT EXISTS idx_contact_roles_companyId_role ON contact_roles(companyId, role);
          `);

          // Backfill contacts from clients
          const clients = this.db.prepare('SELECT * FROM clients').all() as any[];
          const insertContact = this.db.prepare(
            `INSERT OR IGNORE INTO contacts (id, companyId, kind, name, legalName, contactPerson, email, phone, address, taxNumber, notes, clientId, createdAt, updatedAt)
             VALUES (@id, @companyId, 'Organization', @name, @name, @contactPerson, @email, @phone, @address, @vatNumber, @notes, @clientId, @now, @now)`,
          );
          const insertRole = this.db.prepare(
            `INSERT OR IGNORE INTO contact_roles (id, contactId, companyId, role, source, createdAt)
             VALUES (@id, @contactId, @companyId, @role, @source, @now)`,
          );
          const now = new Date().toISOString();
          clients.forEach((c) => {
            insertContact.run({
              id: uuid(),
              companyId: c.companyId,
              name: c.name,
              contactPerson: c.contactName ?? null,
              email: c.email ?? null,
              phone: c.phone ?? null,
              address: c.address ?? null,
              vatNumber: c.vatNumber ?? null,
              notes: c.notes ?? null,
              clientId: c.id,
              now,
            });
          });

          // Get newly created contacts for clients to add roles
          const clientContacts = this.db.prepare('SELECT id, companyId, clientId FROM contacts WHERE clientId IS NOT NULL').all() as any[];
          clientContacts.forEach((c) => {
            insertRole.run({ id: uuid(), contactId: c.id, companyId: c.companyId, role: 'Client', source: 'Manual', now });
          });

          // Backfill contacts from suppliers
          const suppliers = this.db.prepare('SELECT * FROM suppliers').all() as any[];
          const insertSupplierContact = this.db.prepare(
            `INSERT OR IGNORE INTO contacts (id, companyId, kind, name, legalName, contactPerson, email, phone, notes, supplierId, createdAt, updatedAt)
             VALUES (@id, @companyId, 'Organization', @name, @name, @contactPerson, @email, @phone, @notes, @supplierId, @now, @now)`,
          );
          suppliers.forEach((s) => {
            const contactId = uuid();
            insertSupplierContact.run({
              id: contactId,
              companyId: s.companyId,
              name: s.name,
              contactPerson: s.contactName ?? null,
              email: s.email ?? null,
              phone: s.phone ?? null,
              notes: s.notes ?? null,
              supplierId: s.id,
              now,
            });
            const contact = this.db.prepare('SELECT id FROM contacts WHERE supplierId = ?').get(s.id) as any;
            if (contact) {
              insertRole.run({ id: uuid(), contactId: contact.id, companyId: s.companyId, role: 'Vendor', source: 'Manual', now });
            }
          });
        },
      },
      {
        id: '019_contactid_on_transactions',
        run: () => {
          const invoiceCols = this.db.prepare(`PRAGMA table_info('invoices')`).all() as any[];
          if (!invoiceCols.some((c) => c.name === 'contactId')) {
            this.db.exec(`ALTER TABLE invoices ADD COLUMN contactId TEXT;`);
          }
          const salesOrderCols = this.db.prepare(`PRAGMA table_info('sales_orders')`).all() as any[];
          if (!salesOrderCols.some((c) => c.name === 'contactId')) {
            this.db.exec(`ALTER TABLE sales_orders ADD COLUMN contactId TEXT;`);
          }
          const purchaseOrderCols = this.db.prepare(`PRAGMA table_info('purchase_orders')`).all() as any[];
          if (!purchaseOrderCols.some((c) => c.name === 'contactId')) {
            this.db.exec(`ALTER TABLE purchase_orders ADD COLUMN contactId TEXT;`);
          }
          // Back-fill contactId from contacts.clientId → invoices and sales_orders
          this.db.exec(`
            UPDATE invoices SET contactId = (
              SELECT c.id FROM contacts c WHERE c.clientId = invoices.clientId LIMIT 1
            ) WHERE contactId IS NULL AND clientId IS NOT NULL;

            UPDATE sales_orders SET contactId = (
              SELECT c.id FROM contacts c WHERE c.clientId = sales_orders.clientId LIMIT 1
            ) WHERE contactId IS NULL AND clientId IS NOT NULL;

            UPDATE purchase_orders SET contactId = (
              SELECT c.id FROM contacts c WHERE c.supplierId = purchase_orders.supplierId LIMIT 1
            ) WHERE contactId IS NULL AND supplierId IS NOT NULL;
          `);
        },
      },
	      {
	        id: '020_crm_fields',
	        run: () => {
          // CRM fields on contacts
          const contactCols = this.db.prepare(`PRAGMA table_info('contacts')`).all() as any[];
          const contactColNames = contactCols.map((c) => c.name);
          if (!contactColNames.includes('leadStatus'))        this.db.exec(`ALTER TABLE contacts ADD COLUMN leadStatus TEXT;`);
          if (!contactColNames.includes('leadSource'))        this.db.exec(`ALTER TABLE contacts ADD COLUMN leadSource TEXT;`);
          if (!contactColNames.includes('priority'))          this.db.exec(`ALTER TABLE contacts ADD COLUMN priority TEXT;`);
          if (!contactColNames.includes('ownerUserId'))       this.db.exec(`ALTER TABLE contacts ADD COLUMN ownerUserId TEXT;`);
          if (!contactColNames.includes('ownerName'))         this.db.exec(`ALTER TABLE contacts ADD COLUMN ownerName TEXT;`);
          if (!contactColNames.includes('nextFollowupDate'))  this.db.exec(`ALTER TABLE contacts ADD COLUMN nextFollowupDate TEXT;`);
          if (!contactColNames.includes('nextFollowupNote'))  this.db.exec(`ALTER TABLE contacts ADD COLUMN nextFollowupNote TEXT;`);
          if (!contactColNames.includes('convertedToClientAt')) this.db.exec(`ALTER TABLE contacts ADD COLUMN convertedToClientAt TEXT;`);

          // CRM fields on activity_events
          const actCols = this.db.prepare(`PRAGMA table_info('activity_events')`).all() as any[];
          const actColNames = actCols.map((c) => c.name);
          if (!actColNames.includes('category'))          this.db.exec(`ALTER TABLE activity_events ADD COLUMN category TEXT;`);
          if (!actColNames.includes('outcome'))           this.db.exec(`ALTER TABLE activity_events ADD COLUMN outcome TEXT;`);
          if (!actColNames.includes('nextAction'))        this.db.exec(`ALTER TABLE activity_events ADD COLUMN nextAction TEXT;`);
          if (!actColNames.includes('nextActionDueDate')) this.db.exec(`ALTER TABLE activity_events ADD COLUMN nextActionDueDate TEXT;`);
          if (!actColNames.includes('durationMinutes'))   this.db.exec(`ALTER TABLE activity_events ADD COLUMN durationMinutes INTEGER;`);

          // Index for followup queries
          this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_activity_events_nextActionDueDate
              ON activity_events(companyId, nextActionDueDate)
              WHERE nextActionDueDate IS NOT NULL;
	          `);
	        },
	      },
	      {
	        id: '021_crm_pipeline_requests_commissions',
	        run: () => {
	          const contactCols = this.db.prepare(`PRAGMA table_info('contacts')`).all() as any[];
	          const contactColNames = contactCols.map((c) => c.name);
	          if (!contactColNames.includes('influencerPlatform')) this.db.exec(`ALTER TABLE contacts ADD COLUMN influencerPlatform TEXT;`);
	          if (!contactColNames.includes('influencerHandle')) this.db.exec(`ALTER TABLE contacts ADD COLUMN influencerHandle TEXT;`);
	          if (!contactColNames.includes('influencerNiche')) this.db.exec(`ALTER TABLE contacts ADD COLUMN influencerNiche TEXT;`);
	          if (!contactColNames.includes('followerCount')) this.db.exec(`ALTER TABLE contacts ADD COLUMN followerCount INTEGER;`);
	          if (!contactColNames.includes('engagementRate')) this.db.exec(`ALTER TABLE contacts ADD COLUMN engagementRate REAL;`);
	          if (!contactColNames.includes('rateCardAmount')) this.db.exec(`ALTER TABLE contacts ADD COLUMN rateCardAmount REAL;`);
	          if (!contactColNames.includes('location')) this.db.exec(`ALTER TABLE contacts ADD COLUMN location TEXT;`);
	          if (!contactColNames.includes('languages')) this.db.exec(`ALTER TABLE contacts ADD COLUMN languages TEXT;`);
	          if (!contactColNames.includes('availabilityStatus')) this.db.exec(`ALTER TABLE contacts ADD COLUMN availabilityStatus TEXT;`);

	          this.db.exec(`
	            CREATE TABLE IF NOT EXISTS opportunities (
	              id TEXT PRIMARY KEY,
	              companyId TEXT NOT NULL,
	              contactId TEXT NOT NULL,
	              ownerUserId TEXT,
	              ownerName TEXT,
	              title TEXT NOT NULL,
	              serviceType TEXT NOT NULL,
	              stage TEXT NOT NULL,
	              expectedRevenue REAL NOT NULL DEFAULT 0,
	              probability REAL NOT NULL DEFAULT 0,
	              expectedCloseDate TEXT,
	              notes TEXT,
	              wonSalesOrderId TEXT,
	              createdAt TEXT NOT NULL,
	              updatedAt TEXT NOT NULL
	            );
	            CREATE INDEX IF NOT EXISTS idx_opportunities_company_stage ON opportunities(companyId, stage);
	            CREATE INDEX IF NOT EXISTS idx_opportunities_contact ON opportunities(contactId);

	            CREATE TABLE IF NOT EXISTS vendor_requests (
	              id TEXT PRIMARY KEY,
	              companyId TEXT NOT NULL,
	              contactId TEXT,
	              requestedByUserId TEXT,
	              requestedByName TEXT,
		              name TEXT NOT NULL,
		              role TEXT NOT NULL,
		              requestType TEXT,
		              platform TEXT,
		              handle TEXT,
		              details TEXT,
		              dueDate TEXT,
		              cost REAL,
		              status TEXT NOT NULL,
	              notes TEXT,
	              reviewedByUserId TEXT,
	              reviewedByName TEXT,
	              reviewedAt TEXT,
	              createdAt TEXT NOT NULL,
	              updatedAt TEXT NOT NULL
	            );
		            CREATE INDEX IF NOT EXISTS idx_vendor_requests_company_status ON vendor_requests(companyId, status);

	            CREATE TABLE IF NOT EXISTS commission_rules (
	              id TEXT PRIMARY KEY,
	              companyId TEXT NOT NULL,
	              serviceType TEXT NOT NULL,
	              basis TEXT NOT NULL,
	              rateType TEXT NOT NULL,
	              rate REAL NOT NULL DEFAULT 0,
	              fixedAmount REAL,
	              isActive INTEGER NOT NULL DEFAULT 1,
	              createdAt TEXT NOT NULL,
	              updatedAt TEXT NOT NULL
	            );
	            CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_rules_company_service
	              ON commission_rules(companyId, serviceType);

	            CREATE TABLE IF NOT EXISTS commissions (
	              id TEXT PRIMARY KEY,
	              companyId TEXT NOT NULL,
	              opportunityId TEXT NOT NULL,
	              contactId TEXT NOT NULL,
	              userId TEXT,
	              userName TEXT,
	              serviceType TEXT NOT NULL,
	              basis TEXT NOT NULL,
	              basisAmount REAL NOT NULL DEFAULT 0,
	              amount REAL NOT NULL DEFAULT 0,
	              status TEXT NOT NULL,
	              calculatedAt TEXT NOT NULL,
	              UNIQUE(opportunityId, userId, serviceType)
	            );
	            CREATE INDEX IF NOT EXISTS idx_commissions_company_status ON commissions(companyId, status);
		          `);

		        },
		      },
		      {
		        id: '022_vendor_request_scheduling_costs',
		        run: () => {
		          const vendorRequestCols = this.db.prepare(`PRAGMA table_info('vendor_requests')`).all() as any[];
		          const vendorRequestColNames = vendorRequestCols.map((c) => c.name);
		          if (!vendorRequestColNames.includes('requestType')) this.db.exec(`ALTER TABLE vendor_requests ADD COLUMN requestType TEXT;`);
		          if (!vendorRequestColNames.includes('dueDate')) this.db.exec(`ALTER TABLE vendor_requests ADD COLUMN dueDate TEXT;`);
		          if (!vendorRequestColNames.includes('cost')) this.db.exec(`ALTER TABLE vendor_requests ADD COLUMN cost REAL;`);
		        },
		      },
		      {
		        id: '023_crm_proposals',
		        run: () => {
		          this.db.exec(`
		            CREATE TABLE IF NOT EXISTS crm_proposals (
		              id TEXT PRIMARY KEY,
		              companyId TEXT NOT NULL,
		              opportunityId TEXT NOT NULL,
		              contactId TEXT NOT NULL,
		              proposalNumber TEXT NOT NULL,
		              title TEXT NOT NULL,
		              status TEXT NOT NULL,
		              issueDate TEXT NOT NULL,
		              validUntil TEXT,
		              items TEXT NOT NULL,
		              totalAmount REAL NOT NULL DEFAULT 0,
		              notes TEXT,
		              acceptedAt TEXT,
		              declinedAt TEXT,
		              createdAt TEXT NOT NULL,
		              updatedAt TEXT NOT NULL,
		              UNIQUE(companyId, proposalNumber)
		            );
		            CREATE INDEX IF NOT EXISTS idx_crm_proposals_company_status ON crm_proposals(companyId, status);
		            CREATE INDEX IF NOT EXISTS idx_crm_proposals_opportunity ON crm_proposals(opportunityId);
		          `);
		        },
		      },
		      {
		        id: '024_crm_campaigns',
		        run: () => {
		          this.db.exec(`
		            CREATE TABLE IF NOT EXISTS crm_campaigns (
		              id TEXT PRIMARY KEY,
		              companyId TEXT NOT NULL,
		              proposalId TEXT,
		              opportunityId TEXT,
		              contactId TEXT NOT NULL,
		              projectId TEXT,
		              name TEXT NOT NULL,
		              status TEXT NOT NULL,
		              startDate TEXT,
		              endDate TEXT,
		              budget REAL,
		              ownerUserId TEXT,
		              ownerName TEXT,
		              visibility TEXT NOT NULL DEFAULT 'Public',
		              notes TEXT,
		              archivedAt TEXT,
		              createdAt TEXT NOT NULL,
		              updatedAt TEXT NOT NULL
		            );
		            CREATE INDEX IF NOT EXISTS idx_crm_campaigns_company_status ON crm_campaigns(companyId, status);
		            CREATE INDEX IF NOT EXISTS idx_crm_campaigns_proposal ON crm_campaigns(proposalId);
		            CREATE INDEX IF NOT EXISTS idx_crm_campaigns_opportunity ON crm_campaigns(opportunityId);
		          `);
		        },
		      },
		      {
        id: '025_campaigns_optional_contact',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS crm_campaigns_new (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              proposalId TEXT,
              opportunityId TEXT,
              contactId TEXT,
              projectId TEXT,
              name TEXT NOT NULL,
              status TEXT NOT NULL,
              startDate TEXT,
              endDate TEXT,
              budget REAL,
              ownerUserId TEXT,
              ownerName TEXT,
              visibility TEXT NOT NULL DEFAULT 'Public',
              notes TEXT,
              archivedAt TEXT,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL
            );
            INSERT OR IGNORE INTO crm_campaigns_new SELECT * FROM crm_campaigns;
            DROP TABLE crm_campaigns;
            ALTER TABLE crm_campaigns_new RENAME TO crm_campaigns;
            CREATE INDEX IF NOT EXISTS idx_crm_campaigns_company_status ON crm_campaigns(companyId, status);
            CREATE INDEX IF NOT EXISTS idx_crm_campaigns_proposal ON crm_campaigns(proposalId);
            CREATE INDEX IF NOT EXISTS idx_crm_campaigns_opportunity ON crm_campaigns(opportunityId);
          `);
        },
      },
      {
        id: '026_contact_visibility',
        run: () => {
          const cols = (this.db.prepare(`PRAGMA table_info(contacts)`).all() as any[]).map((c) => c.name);
          if (!cols.includes('visibility')) {
            this.db.exec(`ALTER TABLE contacts ADD COLUMN visibility TEXT NOT NULL DEFAULT 'Public';`);
          }
        },
      },
      {
        id: '027_campaign_execution',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS campaign_deliverables (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              campaignId TEXT NOT NULL,
              contactId TEXT,
              assignedUserId TEXT,
              assignedUserName TEXT,
              title TEXT NOT NULL,
              platform TEXT,
              dueDate TEXT,
              status TEXT NOT NULL,
              contentUrl TEXT,
              publishedAt TEXT,
              notes TEXT,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_campaign_deliverables_campaign ON campaign_deliverables(campaignId, status);

            CREATE TABLE IF NOT EXISTS campaign_assignments (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              campaignId TEXT NOT NULL,
              contactId TEXT NOT NULL,
              role TEXT NOT NULL,
              agreedRate REAL,
              status TEXT NOT NULL,
              notes TEXT,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_campaign_assignments_campaign ON campaign_assignments(campaignId, status);

            CREATE TABLE IF NOT EXISTS campaign_expenses (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              campaignId TEXT NOT NULL,
              contactId TEXT,
              vendorRequestId TEXT,
              description TEXT NOT NULL,
              amount REAL NOT NULL DEFAULT 0,
              expenseDate TEXT,
              status TEXT NOT NULL,
              billable INTEGER NOT NULL DEFAULT 0,
              notes TEXT,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_campaign_expenses_campaign ON campaign_expenses(campaignId, status);
          `);
        },
      },
      {
        id: '028_campaign_invoice_columns',
        run: () => {
          const deliverableCols = (this.db.prepare(`PRAGMA table_info(campaign_deliverables)`).all() as any[]).map((c) => c.name);
          if (!deliverableCols.includes('price')) {
            this.db.exec(`ALTER TABLE campaign_deliverables ADD COLUMN price REAL DEFAULT 0;`);
          }
          const invoiceCols = (this.db.prepare(`PRAGMA table_info(invoices)`).all() as any[]).map((c) => c.name);
          if (!invoiceCols.includes('campaignId')) {
            this.db.exec(`ALTER TABLE invoices ADD COLUMN campaignId TEXT;`);
          }
          const campaignCols = (this.db.prepare(`PRAGMA table_info(crm_campaigns)`).all() as any[]).map((c) => c.name);
          if (!campaignCols.includes('invoiceId')) {
            this.db.exec(`ALTER TABLE crm_campaigns ADD COLUMN invoiceId TEXT;`);
          }
        },
      },
      {
        id: '029_deliverable_vendor_bill',
        run: () => {
          const deliverableCols = (this.db.prepare(`PRAGMA table_info(campaign_deliverables)`).all() as any[]).map((c) => c.name);
          if (!deliverableCols.includes('cost')) {
            this.db.exec(`ALTER TABLE campaign_deliverables ADD COLUMN cost REAL DEFAULT 0;`);
          }
          if (!deliverableCols.includes('vendorContactId')) {
            this.db.exec(`ALTER TABLE campaign_deliverables ADD COLUMN vendorContactId TEXT;`);
          }
          if (!deliverableCols.includes('vendorBillId')) {
            this.db.exec(`ALTER TABLE campaign_deliverables ADD COLUMN vendorBillId TEXT;`);
          }
          const vendorBillCols = (this.db.prepare(`PRAGMA table_info(vendor_bills)`).all() as any[]).map((c) => c.name);
          if (!vendorBillCols.includes('campaignId')) {
            this.db.exec(`ALTER TABLE vendor_bills ADD COLUMN campaignId TEXT;`);
          }
        },
      },
      {
        id: '030_deliveries',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS deliveries (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              deliveryNumber TEXT NOT NULL,
              salesOrderId TEXT NOT NULL,
              status TEXT NOT NULL,
              items TEXT NOT NULL,
              carrier TEXT,
              trackingNumber TEXT,
              notes TEXT,
              scheduledFor TEXT,
              dispatchedAt TEXT,
              deliveredAt TEXT,
              cancelledAt TEXT,
              createdAt TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_deliveries_company_number
              ON deliveries (companyId, deliveryNumber);
            CREATE INDEX IF NOT EXISTS idx_deliveries_sales_order
              ON deliveries (salesOrderId);
            CREATE INDEX IF NOT EXISTS idx_deliveries_company_status
              ON deliveries (companyId, status);
          `);
        },
      },
      {
        id: '031_whatsapp_integration',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS whatsapp_instances (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL UNIQUE,
              idInstance TEXT NOT NULL,
              apiTokenEncrypted TEXT NOT NULL,
              apiHost TEXT,
              phoneNumber TEXT,
              displayName TEXT,
              state TEXT NOT NULL DEFAULT 'notAuthorized',
              webhookToken TEXT NOT NULL,
              lastSyncedAt TEXT,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_instances_webhook
              ON whatsapp_instances (webhookToken);
            CREATE TABLE IF NOT EXISTS whatsapp_messages (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              instanceId TEXT NOT NULL,
              direction TEXT NOT NULL,
              externalId TEXT,
              chatId TEXT NOT NULL,
              phone TEXT NOT NULL,
              contactId TEXT,
              type TEXT NOT NULL,
              body TEXT,
              mediaUrl TEXT,
              fileName TEXT,
              status TEXT NOT NULL,
              error TEXT,
              contextEntityType TEXT,
              contextEntityId TEXT,
              sentAt TEXT,
              deliveredAt TEXT,
              readAt TEXT,
              receivedAt TEXT,
              createdAt TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_company_created
              ON whatsapp_messages (companyId, createdAt);
            CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_external
              ON whatsapp_messages (externalId);
            CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_contact
              ON whatsapp_messages (companyId, contactId);
          `);
        },
      },
      {
        id: '032_whatsapp_actor_and_privacy',
        run: () => {
          const cols = (this.db.prepare(`PRAGMA table_info(whatsapp_messages)`).all() as any[]).map((c) => c.name);
          if (!cols.includes('actorUserId')) {
            this.db.exec(`ALTER TABLE whatsapp_messages ADD COLUMN actorUserId TEXT;`);
          }
          if (!cols.includes('actorName')) {
            this.db.exec(`ALTER TABLE whatsapp_messages ADD COLUMN actorName TEXT;`);
          }
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS whatsapp_chat_settings (
              companyId TEXT NOT NULL,
              chatId TEXT NOT NULL,
              visibility TEXT NOT NULL DEFAULT 'shared',
              ownerUserId TEXT,
              updatedAt TEXT NOT NULL,
              PRIMARY KEY (companyId, chatId)
            );
          `);
          this.db.exec(`
            UPDATE whatsapp_messages
               SET phone = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')
             WHERE phone IS NOT NULL;
          `);
        },
      },
      {
        id: '033_opportunity_closed_at',
        run: () => {
          const cols = (this.db.prepare(`PRAGMA table_info(opportunities)`).all() as any[]).map((c) => c.name);
          if (!cols.includes('closedAt')) {
            this.db.exec(`ALTER TABLE opportunities ADD COLUMN closedAt TEXT;`);
            this.db.exec(`
              UPDATE opportunities
                 SET closedAt = updatedAt
               WHERE stage IN ('Won','Lost','Cancelled') AND closedAt IS NULL;
            `);
          }
        },
      },
      {
        id: '035_commissions_v2_engine',
        run: () => {
          // commission_rules — add userId, role, priority, notes; make
          // serviceType optional (kept NOT NULL on legacy rows).
          const ruleCols = (this.db.prepare(`PRAGMA table_info(commission_rules)`).all() as any[]).map((c) => c.name);
          if (!ruleCols.includes('userId'))   this.db.exec(`ALTER TABLE commission_rules ADD COLUMN userId TEXT;`);
          if (!ruleCols.includes('role'))     this.db.exec(`ALTER TABLE commission_rules ADD COLUMN role TEXT;`);
          if (!ruleCols.includes('priority')) this.db.exec(`ALTER TABLE commission_rules ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;`);
          if (!ruleCols.includes('notes'))    this.db.exec(`ALTER TABLE commission_rules ADD COLUMN notes TEXT;`);

          // commissions — add v2 columns. Old columns (opportunityId,
          // contactId, serviceType) stay so existing rows are still valid.
          const comCols = (this.db.prepare(`PRAGMA table_info(commissions)`).all() as any[]).map((c) => c.name);
          if (!comCols.includes('contributionId')) this.db.exec(`ALTER TABLE commissions ADD COLUMN contributionId TEXT;`);
          if (!comCols.includes('sourceType'))     this.db.exec(`ALTER TABLE commissions ADD COLUMN sourceType TEXT;`);
          if (!comCols.includes('sourceId'))       this.db.exec(`ALTER TABLE commissions ADD COLUMN sourceId TEXT;`);
          if (!comCols.includes('sourceLabel'))    this.db.exec(`ALTER TABLE commissions ADD COLUMN sourceLabel TEXT;`);
          if (!comCols.includes('invoiceId'))      this.db.exec(`ALTER TABLE commissions ADD COLUMN invoiceId TEXT;`);
          if (!comCols.includes('role'))           this.db.exec(`ALTER TABLE commissions ADD COLUMN role TEXT;`);
          if (!comCols.includes('ruleId'))         this.db.exec(`ALTER TABLE commissions ADD COLUMN ruleId TEXT;`);
          if (!comCols.includes('weightPercent'))  this.db.exec(`ALTER TABLE commissions ADD COLUMN weightPercent REAL;`);
          if (!comCols.includes('ratePercent'))    this.db.exec(`ALTER TABLE commissions ADD COLUMN ratePercent REAL;`);
          if (!comCols.includes('fixedAmount'))    this.db.exec(`ALTER TABLE commissions ADD COLUMN fixedAmount REAL;`);
          if (!comCols.includes('approvedAt'))     this.db.exec(`ALTER TABLE commissions ADD COLUMN approvedAt TEXT;`);
          if (!comCols.includes('paidAt'))         this.db.exec(`ALTER TABLE commissions ADD COLUMN paidAt TEXT;`);
          if (!comCols.includes('voidedAt'))       this.db.exec(`ALTER TABLE commissions ADD COLUMN voidedAt TEXT;`);
          if (!comCols.includes('approvedByUserId'))
            this.db.exec(`ALTER TABLE commissions ADD COLUMN approvedByUserId TEXT;`);
          if (!comCols.includes('paidByUserId'))
            this.db.exec(`ALTER TABLE commissions ADD COLUMN paidByUserId TEXT;`);

          this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_commissions_invoice
              ON commissions(invoiceId);
            CREATE INDEX IF NOT EXISTS idx_commissions_contribution
              ON commissions(contributionId);
            CREATE INDEX IF NOT EXISTS idx_commissions_company_user
              ON commissions(companyId, userId);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_v2_dedup
              ON commissions(companyId, contributionId, invoiceId)
              WHERE contributionId IS NOT NULL AND invoiceId IS NOT NULL;
          `);

          // commission_rules used to allow one rule per (companyId, serviceType).
          // v2 wants multiple rules differentiated by (userId, role, serviceType).
          this.db.exec(`DROP INDEX IF EXISTS idx_commission_rules_company_service;`);
          this.db.exec(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_rules_v2
              ON commission_rules(
                companyId,
                COALESCE(userId, ''),
                COALESCE(role, ''),
                COALESCE(serviceType, '')
              );
          `);
        },
      },
      {
        id: '034_commissions_v2_foundation',
        run: () => {
          // 1. Per-user commission profile fields
          const userCols = (this.db.prepare(`PRAGMA table_info(users)`).all() as any[]).map((c) => c.name);
          if (!userCols.includes('commissionEligible')) {
            this.db.exec(`ALTER TABLE users ADD COLUMN commissionEligible INTEGER NOT NULL DEFAULT 0;`);
          }
          if (!userCols.includes('defaultCommissionRate')) {
            this.db.exec(`ALTER TABLE users ADD COLUMN defaultCommissionRate REAL;`);
          }
          if (!userCols.includes('defaultCommissionBasis')) {
            this.db.exec(`ALTER TABLE users ADD COLUMN defaultCommissionBasis TEXT;`);
          }
          if (!userCols.includes('costRatePerHour')) {
            this.db.exec(`ALTER TABLE users ADD COLUMN costRatePerHour REAL;`);
          }

          // 2. Contributions table — source-agnostic revenue attribution
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS contributions (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              userId TEXT NOT NULL,
              userName TEXT,
              sourceType TEXT NOT NULL,
              sourceId TEXT NOT NULL,
              role TEXT NOT NULL,
              roleNote TEXT,
              weightPercent REAL NOT NULL DEFAULT 100,
              notes TEXT,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL,
              UNIQUE(companyId, sourceType, sourceId, userId, role)
            );
            CREATE INDEX IF NOT EXISTS idx_contributions_company_source
              ON contributions(companyId, sourceType, sourceId);
            CREATE INDEX IF NOT EXISTS idx_contributions_company_user
              ON contributions(companyId, userId);
          `);

          // 3. Backfill: every existing opportunity with an ownerUserId gets a
          // Sales contribution at 100% so legacy commissions resolve cleanly.
          const opps = this.db
            .prepare(`SELECT id, companyId, ownerUserId, ownerName FROM opportunities WHERE ownerUserId IS NOT NULL`)
            .all() as Array<{ id: string; companyId: string; ownerUserId: string; ownerName: string | null }>;
          const nowIso = new Date().toISOString();
          const insertContribution = this.db.prepare(
            `INSERT OR IGNORE INTO contributions
               (id, companyId, userId, userName, sourceType, sourceId, role, weightPercent, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, 'opportunity', ?, 'Sales', 100, ?, ?)`,
          );
          opps.forEach((opp) => {
            insertContribution.run(
              uuid(),
              opp.companyId,
              opp.ownerUserId,
              opp.ownerName ?? null,
              opp.id,
              nowIso,
              nowIso,
            );
          });

          // 4. Also backfill projects: clientId-less projects with a memberIds[0]
          // become Project Lead contributors. Skip if memberIds JSON is empty.
          const projects = this.db
            .prepare(`SELECT id, companyId, memberIds FROM projects`)
            .all() as Array<{ id: string; companyId: string; memberIds: string | null }>;
          projects.forEach((project) => {
            try {
              const members = project.memberIds ? JSON.parse(project.memberIds) : [];
              if (Array.isArray(members) && members.length > 0 && members[0]) {
                insertContribution.run(
                  uuid(),
                  project.companyId,
                  members[0],
                  null,
                  project.id,
                  nowIso,
                  nowIso,
                );
                // Adjust to 'Project Lead' role for project contributions
                this.db
                  .prepare(
                    `UPDATE contributions SET role = 'Project Lead'
                       WHERE companyId = ? AND sourceType = 'project' AND sourceId = ? AND userId = ?`,
                  )
                  .run(project.companyId, project.id, members[0]);
              }
            } catch {
              /* skip malformed memberIds */
            }
          });
        },
      },
      {
        id: '036_user_super_admin',
        run: () => {
          const cols = (this.db.prepare(`PRAGMA table_info(users)`).all() as any[]).map((c) => c.name);
          if (!cols.includes('isSuperAdmin')) {
            this.db.exec(`ALTER TABLE users ADD COLUMN isSuperAdmin INTEGER NOT NULL DEFAULT 0;`);
          }
          // Backfill: the bootstrap admin (if any) inherits SuperAdmin so we
          // don't lose access. Any other existing user remains a regular
          // company-Admin only. Future Super Admins must be explicitly granted.
          const bootstrapEmail = (process.env.ADMIN_EMAIL || '').trim();
          if (bootstrapEmail) {
            this.db
              .prepare(`UPDATE users SET isSuperAdmin = 1 WHERE LOWER(email) = LOWER(?)`)
              .run(bootstrapEmail);
          }
        },
      },
      {
        id: '037_campaign_deliverable_fulfillment',
        run: () => {
          const cols = (this.db.prepare(`PRAGMA table_info(campaign_deliverables)`).all() as any[]).map((c) => c.name);
          if (!cols.includes('fulfillment')) {
            this.db.exec(`ALTER TABLE campaign_deliverables ADD COLUMN fulfillment TEXT;`);
          }
          // Backfill: a deliverable that already has a vendor contact was the
          // "external" case; everything else becomes "Internal".
          this.db.exec(`
            UPDATE campaign_deliverables
              SET fulfillment = CASE
                WHEN vendorContactId IS NOT NULL AND vendorContactId != '' THEN 'External'
                ELSE 'Internal'
              END
            WHERE fulfillment IS NULL;
          `);
        },
      },
      {
        id: '038_influencer_accounts',
        run: () => {
          const cols = (this.db.prepare(`PRAGMA table_info(contacts)`).all() as any[]).map((c) => c.name);
          if (!cols.includes('influencerAccounts')) {
            this.db.exec(`ALTER TABLE contacts ADD COLUMN influencerAccounts TEXT;`);
          }
        },
      },
      {
        id: '039_company_logo_and_avatar_cleanup',
        run: () => {
          const companyColumns = this.db.prepare(`PRAGMA table_info('companies')`).all() as any[];
          if (!companyColumns.some((column) => column.name === 'logoUrl')) {
            this.db.exec(`ALTER TABLE companies ADD COLUMN logoUrl TEXT;`);
          }
          this.db.exec(`
            UPDATE users
            SET avatar = NULL
            WHERE avatar LIKE 'https://i.pravatar.cc/%';
          `);
        },
      },
      {
        id: '040_invoice_template_customization',
        run: () => {
          const cols = (this.db.prepare(`PRAGMA table_info('invoice_templates')`).all() as any[]).map((c) => c.name);
          const add = (name: string) => {
            if (!cols.includes(name)) this.db.exec(`ALTER TABLE invoice_templates ADD COLUMN ${name} TEXT;`);
          };
          add('stampUrl');
          add('signatureUrl');
          add('signatureLabel');
          add('invoiceColumns');
          add('bankAccounts');
        },
      },
      {
        id: '041_invoice_template_qr',
        run: () => {
          const cols = (this.db.prepare(`PRAGMA table_info('invoice_templates')`).all() as any[]).map((c) => c.name);
          if (!cols.includes('qrEnabled')) {
            this.db.exec(`ALTER TABLE invoice_templates ADD COLUMN qrEnabled INTEGER NOT NULL DEFAULT 1;`);
          }
          if (!cols.includes('qrPosition')) {
            this.db.exec(`ALTER TABLE invoice_templates ADD COLUMN qrPosition TEXT NOT NULL DEFAULT 'center';`);
          }
        },
      },
      {
        id: '042_invoice_template_section_breaks',
        run: () => {
          const cols = (this.db.prepare(`PRAGMA table_info('invoice_templates')`).all() as any[]).map((c) => c.name);
          if (!cols.includes('sectionBreaks')) {
            this.db.exec(`ALTER TABLE invoice_templates ADD COLUMN sectionBreaks TEXT;`);
          }
        },
      },
      {
        id: '043_invoice_template_doc',
        run: () => {
          const cols = (this.db.prepare(`PRAGMA table_info('invoice_templates')`).all() as any[]).map((c) => c.name);
          if (!cols.includes('doc')) {
            this.db.exec(`ALTER TABLE invoice_templates ADD COLUMN doc TEXT;`);
          }
        },
      },
      {
        id: '044_commission_nullable_source_links',
        run: () => {
          this.db.exec(`
            CREATE TABLE commissions_rebuilt (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              opportunityId TEXT,
              contactId TEXT,
              userId TEXT,
              userName TEXT,
              serviceType TEXT NOT NULL,
              basis TEXT NOT NULL,
              basisAmount REAL NOT NULL DEFAULT 0,
              amount REAL NOT NULL DEFAULT 0,
              status TEXT NOT NULL,
              calculatedAt TEXT NOT NULL,
              contributionId TEXT,
              sourceType TEXT,
              sourceId TEXT,
              sourceLabel TEXT,
              invoiceId TEXT,
              role TEXT,
              ruleId TEXT,
              weightPercent REAL,
              ratePercent REAL,
              fixedAmount REAL,
              approvedAt TEXT,
              paidAt TEXT,
              voidedAt TEXT,
              approvedByUserId TEXT,
              paidByUserId TEXT,
              UNIQUE(opportunityId, userId, serviceType)
            );
            INSERT INTO commissions_rebuilt (
              id, companyId, opportunityId, contactId, userId, userName, serviceType,
              basis, basisAmount, amount, status, calculatedAt, contributionId,
              sourceType, sourceId, sourceLabel, invoiceId, role, ruleId,
              weightPercent, ratePercent, fixedAmount, approvedAt, paidAt, voidedAt,
              approvedByUserId, paidByUserId
            )
            SELECT
              id, companyId, opportunityId, contactId, userId, userName, serviceType,
              basis, basisAmount, amount, status, calculatedAt, contributionId,
              sourceType, sourceId, sourceLabel, invoiceId, role, ruleId,
              weightPercent, ratePercent, fixedAmount, approvedAt, paidAt, voidedAt,
              approvedByUserId, paidByUserId
            FROM commissions;
            DROP TABLE commissions;
            ALTER TABLE commissions_rebuilt RENAME TO commissions;
            CREATE INDEX idx_commissions_company_status ON commissions(companyId, status);
            CREATE INDEX idx_commissions_invoice ON commissions(invoiceId);
            CREATE INDEX idx_commissions_contribution ON commissions(contributionId);
            CREATE INDEX idx_commissions_company_user ON commissions(companyId, userId);
          `);
        },
      },
      {
        id: '045_invoice_template_snapshot',
        run: () => {
          const cols = (this.db.prepare(`PRAGMA table_info('invoices')`).all() as any[]).map((c) => c.name);
          if (!cols.includes('templateSnapshot')) {
            this.db.exec(`ALTER TABLE invoices ADD COLUMN templateSnapshot TEXT;`);
          }
        },
      },
      {
        id: '046_notifications',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS notifications (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              userId TEXT NOT NULL,
              category TEXT NOT NULL,
              type TEXT NOT NULL,
              priority TEXT NOT NULL,
              title TEXT NOT NULL,
              body TEXT,
              link TEXT,
              entityType TEXT,
              entityId TEXT,
              readAt TEXT,
              emailedAt TEXT,
              createdAt TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(userId, createdAt);
            CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(userId, readAt);
            CREATE INDEX IF NOT EXISTS idx_notifications_dispatch ON notifications(priority, emailedAt);
          `);
          const userColumns = (this.db.prepare(`PRAGMA table_info('users')`).all() as any[]).map((c) => c.name);
          if (!userColumns.includes('notificationPrefs')) {
            this.db.exec(`ALTER TABLE users ADD COLUMN notificationPrefs TEXT;`);
          }
        },
      },
      {
        id: '047_warehouses',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS warehouses (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              name TEXT NOT NULL,
              code TEXT,
              address TEXT,
              isDefault INTEGER NOT NULL DEFAULT 0,
              isActive INTEGER NOT NULL DEFAULT 1,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL,
              UNIQUE(companyId, name)
            );
          `);
          // Auto-import happens via ensureWarehousesFromLocations() at startup,
          // which runs after seeding so fresh DBs are covered too.
        },
      },
      {
        id: '048_credit_notes',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS credit_notes (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              invoiceId TEXT,
              clientId TEXT NOT NULL,
              creditNoteNumber TEXT NOT NULL,
              issueDate TEXT NOT NULL,
              lineItems TEXT NOT NULL,
              total REAL NOT NULL,
              reason TEXT,
              status TEXT NOT NULL,
              createdAt TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_credit_notes_company ON credit_notes(companyId, issueDate);
            CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON credit_notes(invoiceId);
          `);
        },
      },
      {
        id: '049_time_entries',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS time_entries (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              taskId TEXT NOT NULL,
              userId TEXT NOT NULL,
              userName TEXT,
              minutes INTEGER NOT NULL,
              spentOn TEXT NOT NULL,
              note TEXT,
              cost REAL,
              createdAt TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(taskId);
            CREATE INDEX IF NOT EXISTS idx_time_entries_company ON time_entries(companyId, spentOn);
          `);
        },
      },
      {
        id: '050_po_approvals',
        run: () => {
          const poCols = this.db.prepare(`PRAGMA table_info('purchase_orders')`).all() as any[];
          if (!poCols.some((c) => c.name === 'approvalStatus')) {
            this.db.exec(`ALTER TABLE purchase_orders ADD COLUMN approvalStatus TEXT NOT NULL DEFAULT 'not_required';`);
          }
          if (!poCols.some((c) => c.name === 'approvedBy')) {
            this.db.exec(`ALTER TABLE purchase_orders ADD COLUMN approvedBy TEXT;`);
          }
          if (!poCols.some((c) => c.name === 'approvedAt')) {
            this.db.exec(`ALTER TABLE purchase_orders ADD COLUMN approvedAt TEXT;`);
          }
          if (!poCols.some((c) => c.name === 'rejectionReason')) {
            this.db.exec(`ALTER TABLE purchase_orders ADD COLUMN rejectionReason TEXT;`);
          }
          const finCols = this.db.prepare(`PRAGMA table_info('company_finance_settings')`).all() as any[];
          if (!finCols.some((c) => c.name === 'poApprovalThreshold')) {
            this.db.exec(`ALTER TABLE company_finance_settings ADD COLUMN poApprovalThreshold REAL NOT NULL DEFAULT 0;`);
          }
        },
      },
      {
        id: '051_custom_fields',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS custom_field_definitions (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              entityType TEXT NOT NULL,
              key TEXT NOT NULL,
              label TEXT NOT NULL,
              fieldType TEXT NOT NULL,
              options TEXT,
              required INTEGER NOT NULL DEFAULT 0,
              sortOrder INTEGER NOT NULL DEFAULT 0,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_field_defs_key
              ON custom_field_definitions(companyId, entityType, key);
          `);
          const contactCols = this.db.prepare(`PRAGMA table_info('contacts')`).all() as any[];
          if (!contactCols.some((c) => c.name === 'customFields')) {
            this.db.exec(`ALTER TABLE contacts ADD COLUMN customFields TEXT;`);
          }
          const itemCols = this.db.prepare(`PRAGMA table_info('inventory_items')`).all() as any[];
          if (!itemCols.some((c) => c.name === 'customFields')) {
            this.db.exec(`ALTER TABLE inventory_items ADD COLUMN customFields TEXT;`);
          }
        },
      },
      {
        id: '052_hr_module',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS departments (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              name TEXT NOT NULL,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS employees (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              userId TEXT,
              name TEXT NOT NULL,
              email TEXT,
              phone TEXT,
              jobTitle TEXT,
              departmentId TEXT,
              managerId TEXT,
              employmentType TEXT,
              status TEXT NOT NULL DEFAULT 'Active',
              hireDate TEXT,
              endDate TEXT,
              annualLeaveAllowance REAL NOT NULL DEFAULT 21,
              notes TEXT,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS leave_types (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              name TEXT NOT NULL,
              paid INTEGER NOT NULL DEFAULT 1,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS leave_requests (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              employeeId TEXT NOT NULL,
              leaveTypeId TEXT,
              startDate TEXT NOT NULL,
              endDate TEXT NOT NULL,
              days REAL NOT NULL,
              reason TEXT,
              status TEXT NOT NULL DEFAULT 'Pending',
              reviewedByUserId TEXT,
              reviewedByName TEXT,
              reviewedAt TEXT,
              reviewNote TEXT,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(companyId);
            CREATE INDEX IF NOT EXISTS idx_leave_requests_company ON leave_requests(companyId, status);
            CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employeeId);
          `);
        },
      },
      {
        id: '053_company_details',
        run: () => {
          const cols = this.db.prepare(`PRAGMA table_info('companies')`).all() as Array<{ name: string }>;
          const add = (name: string) => {
            if (!cols.some((c) => c.name === name)) {
              this.db.exec(`ALTER TABLE companies ADD COLUMN ${name} TEXT;`);
            }
          };
          ['legalName', 'taxNumber', 'registrationNumber', 'phone', 'email', 'city', 'country', 'taxDetails'].forEach(add);
        },
      },
      {
        id: '054_template_letterhead_image',
        run: () => {
          const cols = this.db.prepare(`PRAGMA table_info('invoice_templates')`).all() as Array<{ name: string }>;
          if (!cols.some((c) => c.name === 'letterheadImageUrl')) {
            this.db.exec(`ALTER TABLE invoice_templates ADD COLUMN letterheadImageUrl TEXT;`);
          }
        },
      },
      {
        id: '055_template_doc_type',
        run: () => {
          const cols = this.db.prepare(`PRAGMA table_info('invoice_templates')`).all() as Array<{ name: string }>;
          if (!cols.some((c) => c.name === 'docType')) {
            this.db.exec(`ALTER TABLE invoice_templates ADD COLUMN docType TEXT NOT NULL DEFAULT 'invoice';`);
          }
        },
      },
      {
        id: '056_inventory_lots',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS inventory_lots (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              inventoryItemId TEXT NOT NULL,
              lotNumber TEXT NOT NULL,
              location TEXT NOT NULL,
              quantity REAL NOT NULL DEFAULT 0,
              initialQuantity REAL NOT NULL DEFAULT 0,
              unitCost REAL NOT NULL DEFAULT 0,
              expiryDate TEXT,
              manufactureDate TEXT,
              supplierId TEXT,
              receivedAt TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'Active',
              note TEXT,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL,
              FOREIGN KEY(inventoryItemId) REFERENCES inventory_items(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_inventory_lots_item ON inventory_lots(inventoryItemId, status);
            CREATE INDEX IF NOT EXISTS idx_inventory_lots_expiry ON inventory_lots(companyId, expiryDate);
          `);
          const cols = this.db.prepare(`PRAGMA table_info('stock_movements')`).all() as Array<{ name: string }>;
          if (!cols.some((c) => c.name === 'lotId')) {
            this.db.exec(`ALTER TABLE stock_movements ADD COLUMN lotId TEXT;`);
          }
        },
      },
      {
        id: '057_purchase_requisitions',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS purchase_requisitions (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              requisitionNumber TEXT NOT NULL,
              requestedByUserId TEXT,
              department TEXT,
              status TEXT NOT NULL DEFAULT 'Draft',
              items TEXT NOT NULL,
              neededBy TEXT,
              notes TEXT,
              preferredSupplierId TEXT,
              approvedByUserId TEXT,
              approvedAt TEXT,
              rejectionReason TEXT,
              purchaseOrderId TEXT,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_company ON purchase_requisitions(companyId, status);
          `);
        },
      },
      {
        id: '058_expenses',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS expenses (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              expenseDate TEXT NOT NULL,
              category TEXT NOT NULL,
              vendor TEXT,
              amount REAL NOT NULL DEFAULT 0,
              description TEXT,
              paymentMethod TEXT,
              reference TEXT,
              projectId TEXT,
              attachmentUrl TEXT,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_expenses_company_date ON expenses(companyId, expenseDate);
          `);
        },
      },
      {
        id: '059_followups',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS follow_ups (
              id TEXT PRIMARY KEY,
              companyId TEXT NOT NULL,
              ownerUserId TEXT,
              ownerName TEXT,
              entityType TEXT NOT NULL,
              entityId TEXT NOT NULL,
              title TEXT,
              type TEXT NOT NULL DEFAULT 'Follow-up',
              channel TEXT,
              status TEXT NOT NULL DEFAULT 'open',
              priority TEXT NOT NULL DEFAULT 'normal',
              dueAt TEXT,
              reminderAt TEXT,
              snoozedUntil TEXT,
              completedAt TEXT,
              completedByUserId TEXT,
              outcome TEXT,
              outcomeNote TEXT,
              notes TEXT,
              sourceTrigger TEXT,
              sourceType TEXT,
              sourceId TEXT,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_followups_owner_due ON follow_ups(companyId, ownerUserId, status, dueAt);
            CREATE INDEX IF NOT EXISTS idx_followups_entity ON follow_ups(entityType, entityId, status);
            CREATE INDEX IF NOT EXISTS idx_followups_company_due ON follow_ups(companyId, status, dueAt);
            CREATE INDEX IF NOT EXISTS idx_followups_sweep ON follow_ups(status, reminderAt);
            CREATE INDEX IF NOT EXISTS idx_followups_snooze ON follow_ups(status, snoozedUntil);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_followups_idem
              ON follow_ups(companyId, entityType, entityId, sourceTrigger, sourceId)
              WHERE sourceId IS NOT NULL;
          `);

          const nowIso = new Date().toISOString();
          const insert = this.db.prepare(
            `INSERT OR IGNORE INTO follow_ups
               (id, companyId, ownerUserId, ownerName, entityType, entityId, title, type, channel,
                status, priority, dueAt, reminderAt, snoozedUntil, outcome, notes,
                sourceTrigger, sourceType, sourceId, createdAt, updatedAt)
             VALUES
               (@id, @companyId, @ownerUserId, @ownerName, @entityType, @entityId, @title, @type, @channel,
                'open', 'normal', @dueAt, @dueAt, NULL, NULL, @notes,
                @sourceTrigger, @sourceType, @sourceId, @createdAt, @updatedAt)`,
          );
          const channelForCategory = (c?: string): string | null => {
            switch (c) {
              case 'Call': return 'Call';
              case 'WhatsApp': return 'WhatsApp';
              case 'Email': return 'Email';
              case 'Meeting': return 'Meeting';
              default: return null;
            }
          };

          // Backfill 1: every open activity-event follow-up (nextActionDueDate set).
          const seen = new Set<string>(); // entityId keys already covered
          const actRows = this.db
            .prepare(`SELECT * FROM activity_events WHERE nextActionDueDate IS NOT NULL`)
            .all() as any[];
          for (const r of actRows) {
            let meta: any = null;
            try { meta = r.metadata ? JSON.parse(r.metadata) : null; } catch { meta = null; }
            const et = (r.entityType === 'opportunity' || r.entityType === 'invoice') ? r.entityType : 'contact';
            insert.run({
              id: uuid(),
              companyId: r.companyId,
              ownerUserId: r.actorUserId ?? null,
              ownerName: r.actorName ?? null,
              entityType: et,
              entityId: r.entityId,
              title: r.nextAction ?? r.summary ?? null,
              type: 'Follow-up',
              channel: channelForCategory(r.category),
              dueAt: r.nextActionDueDate,
              notes: r.summary ?? null,
              sourceTrigger: meta?.trigger ?? (r.action === 'auto_followup' ? 'auto' : 'legacy_activity'),
              sourceType: meta?.sourceType ?? null,
              sourceId: meta?.sourceId ?? null,
              createdAt: r.createdAt ?? nowIso,
              updatedAt: nowIso,
            });
            seen.add(`${r.companyId}:${r.entityId}`);
          }

          // Backfill 2: contact-level follow-ups (contact.nextFollowupDate) not
          // already represented by an activity follow-up for that contact.
          const contactRows = this.db
            .prepare(`SELECT * FROM contacts WHERE nextFollowupDate IS NOT NULL`)
            .all() as any[];
          for (const c of contactRows) {
            if (seen.has(`${c.companyId}:${c.id}`)) continue;
            insert.run({
              id: uuid(),
              companyId: c.companyId,
              ownerUserId: c.ownerUserId ?? null,
              ownerName: c.ownerName ?? null,
              entityType: 'contact',
              entityId: c.id,
              title: c.nextFollowupNote ?? null,
              type: 'Follow-up',
              channel: null,
              dueAt: c.nextFollowupDate,
              notes: null,
              sourceTrigger: 'legacy_contact',
              sourceType: 'contact',
              sourceId: c.id,
              createdAt: c.updatedAt ?? nowIso,
              updatedAt: nowIso,
            });
          }
        },
      },
      {
        // Collaborators on a follow-up: inviting a teammate ADDS them here, it
        // does not transfer the owner. "Mine" then means owned-by-me OR I'm a
        // collaborator. Composite PK keeps a person on a follow-up at most once.
        id: '060_followup_assignees',
        run: () => {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS follow_up_assignees (
              followUpId TEXT NOT NULL,
              userId TEXT NOT NULL,
              addedByUserId TEXT,
              createdAt TEXT NOT NULL,
              PRIMARY KEY (followUpId, userId)
            );
            CREATE INDEX IF NOT EXISTS idx_followup_assignees_user ON follow_up_assignees(userId);
          `);
        },
      },
    ];

    migrations.forEach((migration) => {
      if (applied.has(migration.id)) return;
      const trx = this.db.transaction(() => {
        migration.run();
        markApplied.run(migration.id, new Date().toISOString());
      });
      trx();
    });
  }

  private seedIfEmpty() {
    const existing = this.db.prepare('SELECT COUNT(*) as count FROM companies').get() as { count: number };
    if (existing.count === 0) {
      this.reset();
    }
  }

  private ensureFinanceDefaults() {
    const companies = this.db.prepare('SELECT id FROM companies').all() as Array<{ id: string }>;
    const insertLedgerAccount = this.db.prepare(
      'INSERT INTO ledger_accounts (id, companyId, code, name, type, detailType, description, isActive, isSystem) VALUES (@id, @companyId, @code, @name, @type, @detailType, @description, @isActive, @isSystem)',
    );
    const accountExists = this.db.prepare(
      'SELECT 1 FROM ledger_accounts WHERE companyId = ? AND code = ? LIMIT 1',
    );

    const trx = this.db.transaction(() => {
      companies.forEach((company) => {
        defaultLedgerAccounts.forEach((account) => {
          const exists = accountExists.get(company.id, account.code);
          if (exists) return;
          insertLedgerAccount.run({
            id: uuid(),
            companyId: company.id,
            code: account.code,
            name: account.name,
            type: account.type,
            detailType: account.detailType ?? null,
            description: account.description ?? null,
            isActive: account.isActive === false ? 0 : 1,
            isSystem: account.isSystem ? 1 : 0,
          });
        });
      });
    });

    trx();
    this.ensureNumberingDefaults();
    this.ensureCompanyFinanceSettings();
    this.ensureInvoiceTemplateDefaults();
  }

  private ensureNumberingDefaults() {
    const companies = this.db.prepare('SELECT id FROM companies').all() as Array<{ id: string }>;
    const insertSetting = this.db.prepare(
      'INSERT OR IGNORE INTO company_numbering_settings (companyId, entityType, prefix, padLength, nextNumber, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const nowIso = new Date().toISOString();

    const trx = this.db.transaction(() => {
      companies.forEach((company) => {
        numberingEntityTypes.forEach((entityType) => {
          const defaults = defaultNumberingSettings[entityType];
          insertSetting.run(company.id, entityType, defaults.prefix, defaults.padLength, 1, nowIso);
        });
      });
    });

    trx();
  }

  private ensureCompanyFinanceSettings() {
    const companies = this.db.prepare('SELECT id FROM companies').all() as Array<{ id: string }>;
    const insertSetting = this.db.prepare(
      'INSERT OR IGNORE INTO company_finance_settings (companyId, fiscalYearStartMonth, lockedThroughDate, currencyCode, updatedAt) VALUES (?, ?, ?, ?, ?)',
    );
    const nowIso = new Date().toISOString();

    const trx = this.db.transaction(() => {
      companies.forEach((company) => {
        insertSetting.run(company.id, 1, null, 'USD', nowIso);
      });
    });

    trx();
  }

  private ensureInvoiceTemplateDefaults() {
    const companies = this.db.prepare('SELECT id FROM companies').all() as Array<{ id: string }>;
    const templateCount = this.db.prepare(
      'SELECT COUNT(*) as count FROM invoice_templates WHERE companyId = ?',
    );
    const insertTemplate = this.db.prepare(
      `INSERT INTO invoice_templates (
        id, companyId, name, layout, isDefault, primaryColor, accentColor,
        logoUrl, headerImageUrl, footerImageUrl, letterheadPdfUrl,
        paymentInstructions, terms, footerNote, watermarkEnabled, watermarkText, watermarkOpacity, showCompanyAddress, showTaxId,
        createdAt, updatedAt
      ) VALUES (
        @id, @companyId, @name, @layout, @isDefault, @primaryColor, @accentColor,
        @logoUrl, @headerImageUrl, @footerImageUrl, @letterheadPdfUrl,
        @paymentInstructions, @terms, @footerNote, @watermarkEnabled, @watermarkText, @watermarkOpacity, @showCompanyAddress, @showTaxId,
        @createdAt, @updatedAt
      )`,
    );

    const trx = this.db.transaction(() => {
      companies.forEach((company) => {
        const existing = templateCount.get(company.id) as { count: number };
        if (existing.count > 0) return;
        const nowIso = new Date().toISOString();
        defaultInvoiceTemplates.forEach((template) => {
          insertTemplate.run({
            id: uuid(),
            companyId: company.id,
            name: template.name,
            layout: template.layout,
            isDefault: template.isDefault ? 1 : 0,
            primaryColor: template.primaryColor,
            accentColor: template.accentColor,
            logoUrl: template.logoUrl ?? null,
            headerImageUrl: template.headerImageUrl ?? null,
            footerImageUrl: template.footerImageUrl ?? null,
            letterheadPdfUrl: template.letterheadPdfUrl ?? null,
            paymentInstructions: template.paymentInstructions ?? null,
            terms: template.terms ?? null,
            footerNote: template.footerNote ?? null,
            watermarkEnabled: template.watermarkEnabled ? 1 : 0,
            watermarkText: template.watermarkText ?? null,
            watermarkOpacity: template.watermarkOpacity ?? 0.12,
            showCompanyAddress: template.showCompanyAddress === false ? 0 : 1,
            showTaxId: template.showTaxId === false ? 0 : 1,
            createdAt: nowIso,
            updatedAt: nowIso,
          });
        });
      });
    });

    trx();
  }

  reset() {
    const trx = this.db.transaction(() => {
      this.db.exec(`
        DELETE FROM tokens;
        DELETE FROM record_attachments;
        DELETE FROM company_numbering_settings;
        DELETE FROM company_finance_settings;
        DELETE FROM invoice_templates;
        DELETE FROM stock_movements;
        DELETE FROM inventory_transfers;
        DELETE FROM inventory_issues;
        DELETE FROM inventory_location_balances;
        DELETE FROM purchase_receipts;
        DELETE FROM vendor_bill_payments;
        DELETE FROM activity_events;
        DELETE FROM journal_lines;
        DELETE FROM journal_entries;
        DELETE FROM vendor_bills;
        DELETE FROM ledger_accounts;
        DELETE FROM payments;
        DELETE FROM invoices;
        DELETE FROM contributions;
        DELETE FROM whatsapp_chat_settings;
        DELETE FROM whatsapp_messages;
        DELETE FROM whatsapp_instances;
        DELETE FROM deliveries;
        DELETE FROM sales_orders;
        DELETE FROM purchase_orders;
        DELETE FROM inventory_items;
        DELETE FROM suppliers;
        DELETE FROM clients;
        DELETE FROM comments;
        DELETE FROM tasks;
        DELETE FROM projects;
        DELETE FROM users;
        DELETE FROM positions;
        DELETE FROM companies;
      `);

      const insertCompany = this.db.prepare(
        'INSERT INTO companies (id, name, website, address) VALUES (@id, @name, @website, @address)',
      );
      const insertPosition = this.db.prepare(
        'INSERT INTO positions (id, title, companyId) VALUES (@id, @title, @companyId)',
      );
      const insertUser = this.db.prepare(
        'INSERT INTO users (id, name, email, role, companyIds, positionId, companyRoles, avatar, password) VALUES (@id, @name, @email, @role, @companyIds, @positionId, @companyRoles, @avatar, @password)',
      );
      const insertProject = this.db.prepare(
        'INSERT INTO projects (id, name, description, color, companyId, visibility, memberIds, clientId) VALUES (@id, @name, @description, @color, @companyId, @visibility, @memberIds, @clientId)',
      );
      const insertTask = this.db.prepare(
        'INSERT INTO tasks (id, title, description, status, priority, createdAt, dueDate, assignedUserIds, tags, companyId, projectId, color, dependencies, parentTaskId, invoiceImage, invoiceVendor, invoiceNumber, invoiceAmount, invoiceDate, generatedInvoiceId) VALUES (@id, @title, @description, @status, @priority, @createdAt, @dueDate, @assignedUserIds, @tags, @companyId, @projectId, @color, @dependencies, @parentTaskId, @invoiceImage, @invoiceVendor, @invoiceNumber, @invoiceAmount, @invoiceDate, @generatedInvoiceId)',
      );
      const insertComment = this.db.prepare(
        'INSERT INTO comments (id, taskId, userId, content, createdAt) VALUES (@id, @taskId, @userId, @content, @createdAt)',
      );
      const insertClient = this.db.prepare(
        'INSERT INTO clients (id, reference, name, email, address, companyId, contactName, phone, vatNumber, creditLimit, creditNumber, paymentMethod, status, notes) VALUES (@id, @reference, @name, @email, @address, @companyId, @contactName, @phone, @vatNumber, @creditLimit, @creditNumber, @paymentMethod, @status, @notes)',
      );
      const insertSupplier = this.db.prepare(
        'INSERT INTO suppliers (id, companyId, reference, name, contactName, email, phone, paymentTermsDays, notes, isActive) VALUES (@id, @companyId, @reference, @name, @contactName, @email, @phone, @paymentTermsDays, @notes, @isActive)',
      );
      const insertInventoryItem = this.db.prepare(
        'INSERT INTO inventory_items (id, companyId, sku, barcode, name, category, unit, vatApplicable, tracksInventory, onHand, reorderPoint, unitCost, salePrice, preferredVendor, preferredSupplierId, location) VALUES (@id, @companyId, @sku, @barcode, @name, @category, @unit, @vatApplicable, @tracksInventory, @onHand, @reorderPoint, @unitCost, @salePrice, @preferredVendor, @preferredSupplierId, @location)',
      );
      const insertLocationBalance = this.db.prepare(
        'INSERT INTO inventory_location_balances (companyId, inventoryItemId, location, quantity) VALUES (@companyId, @inventoryItemId, @location, @quantity)',
      );
      const insertPurchaseOrder = this.db.prepare(
        'INSERT INTO purchase_orders (id, companyId, orderNumber, supplierName, supplierId, orderDate, expectedDate, status, items, totalAmount, notes, receivedAt) VALUES (@id, @companyId, @orderNumber, @supplierName, @supplierId, @orderDate, @expectedDate, @status, @items, @totalAmount, @notes, @receivedAt)',
      );
      const insertInvoice = this.db.prepare(
        'INSERT INTO invoices (id, invoiceNumber, companyId, clientId, issueDate, dueDate, lineItems, total, status, notes, currency, taxRate, sentAt, paidAt) VALUES (@id, @invoiceNumber, @companyId, @clientId, @issueDate, @dueDate, @lineItems, @total, @status, @notes, @currency, @taxRate, @sentAt, @paidAt)',
      );
      const insertLedgerAccount = this.db.prepare(
        'INSERT INTO ledger_accounts (id, companyId, code, name, type, detailType, description, isActive, isSystem) VALUES (@id, @companyId, @code, @name, @type, @detailType, @description, @isActive, @isSystem)',
      );

      seedData.companies.forEach((c) => insertCompany.run(c));
      seedData.positions.forEach((p) =>
        insertPosition.run({ ...p, companyId: p.companyId ?? null }),
      );
      seedData.users.forEach((u) =>
        insertUser.run({
          ...u,
          companyIds: JSON.stringify(u.companyIds),
          companyRoles: JSON.stringify(u.companyRoles || []),
          positionId: u.positionId ?? null,
        }),
      );
      seedData.projects.forEach((p) =>
        insertProject.run({
          ...p,
          memberIds: JSON.stringify(p.memberIds || []),
        }),
      );
      seedData.tasks.forEach((t) =>
        insertTask.run({
          id: t.id,
          title: t.title,
          description: t.description ?? null,
          status: t.status,
          priority: t.priority,
          createdAt: new Date(t.createdAt).toISOString(),
          dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
          assignedUserIds: JSON.stringify(t.assignedUserIds || []),
          tags: JSON.stringify(t.tags || []),
          companyId: t.companyId,
          projectId: t.projectId,
          color: t.color ?? null,
          dependencies: JSON.stringify(t.dependencies || []),
          parentTaskId: t.parentTaskId ?? null,
          invoiceImage: t.invoiceImage ?? null,
          invoiceVendor: t.invoiceVendor ?? null,
          invoiceNumber: t.invoiceNumber ?? null,
          invoiceAmount: t.invoiceAmount ?? null,
          invoiceDate: t.invoiceDate ? new Date(t.invoiceDate).toISOString() : null,
          generatedInvoiceId: t.generatedInvoiceId ?? null,
        }),
      );
      seedData.comments.forEach((c) =>
        insertComment.run({
          ...c,
          createdAt: new Date(c.createdAt).toISOString(),
        }),
      );
      seedData.clients.forEach((c) =>
        insertClient.run({
          ...c,
          contactName: c.contactName ?? null,
          phone: c.phone ?? null,
          vatNumber: c.vatNumber ?? null,
          creditLimit: c.creditLimit ?? null,
          creditNumber: c.creditNumber ?? null,
          paymentMethod: c.paymentMethod ?? null,
          status: c.status ?? null,
          notes: c.notes ?? null,
        }),
      );
      seedData.suppliers.forEach((supplier) =>
        insertSupplier.run({
          ...supplier,
          contactName: supplier.contactName ?? null,
          email: supplier.email ?? null,
          phone: supplier.phone ?? null,
          paymentTermsDays: supplier.paymentTermsDays ?? null,
          notes: supplier.notes ?? null,
          isActive: supplier.isActive ? 1 : 0,
        }),
      );
      seedData.inventoryItems.forEach((item) =>
        insertInventoryItem.run({
          ...item,
          barcode: item.barcode ?? null,
          vatApplicable: item.vatApplicable ? 1 : 0,
          tracksInventory: item.tracksInventory ? 1 : 0,
          salePrice: item.salePrice ?? null,
          preferredVendor: item.preferredVendor ?? null,
          preferredSupplierId: item.preferredSupplierId ?? null,
          location: item.location ?? null,
        }),
      );
      seedData.inventoryItems.forEach((item) => {
        if (!item.tracksInventory || (item.onHand || 0) === 0) return;
        insertLocationBalance.run({
          companyId: item.companyId,
          inventoryItemId: item.id,
          location: item.location || 'Unassigned',
          quantity: item.onHand,
        });
      });
      seedData.purchaseOrders.forEach((order) =>
        insertPurchaseOrder.run({
          ...order,
          supplierId: order.supplierId ?? null,
          orderDate: new Date(order.orderDate).toISOString(),
          expectedDate: order.expectedDate ? new Date(order.expectedDate).toISOString() : null,
          items: JSON.stringify(order.items),
          notes: order.notes ?? null,
          receivedAt: order.receivedAt ? new Date(order.receivedAt).toISOString() : null,
        }),
      );

      seedData.inventoryItems.forEach((item) => {
        if (!item.tracksInventory || (item.onHand || 0) === 0) return;
        this.createStockMovement({
          companyId: item.companyId,
          inventoryItemId: item.id,
          movementType: 'Opening',
          quantityChange: item.onHand,
          unitCost: item.unitCost,
          referenceType: 'opening',
          note: 'Seeded opening balance',
        });
      });
      seedData.invoices.forEach((i) =>
        insertInvoice.run({
          ...i,
          issueDate: new Date(i.issueDate).toISOString(),
          dueDate: new Date(i.dueDate).toISOString(),
          lineItems: JSON.stringify(i.lineItems),
          notes: i.notes ?? null,
          currency: i.currency ?? 'USD',
          taxRate: i.taxRate ?? 0,
          sentAt: i.sentAt ? new Date(i.sentAt).toISOString() : null,
          paidAt: i.paidAt ? new Date(i.paidAt).toISOString() : null,
        }),
      );

      seedData.companies.forEach((company) => {
        defaultLedgerAccounts.forEach((account) => {
          insertLedgerAccount.run({
            id: uuid(),
            companyId: company.id,
            code: account.code,
            name: account.name,
            type: account.type,
            detailType: account.detailType ?? null,
            description: account.description ?? null,
            isActive: account.isActive === false ? 0 : 1,
            isSystem: account.isSystem ? 1 : 0,
          });
        });
      });
    });

    trx();
    this.ensureNumberingDefaults();
  }

  runAsActor<T>(
    actor: { userId?: string; name?: string } | undefined,
    fn: () => T,
  ): T {
    const previousActor = this.currentActor;
    this.currentActor = actor;
    try {
      return fn();
    } finally {
      this.currentActor = previousActor;
    }
  }

  // Token helpers
  issueToken(userId: string) {
    const token = uuid();
    this.db
      .prepare('INSERT INTO tokens (token, userId) VALUES (?, ?)')
      .run(token, userId);
    return token;
  }

  // ─── Admin / system-wide ─────────────────────────────────────────────────

  /** Cross-company KPI snapshot for the /admin overview tab. */
  getAdminOverview() {
    const row = <T>(sql: string, ...params: any[]): T =>
      this.db.prepare(sql).get(...params) as T;
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString();

    return {
      companies: (row<{ c: number }>('SELECT COUNT(*) AS c FROM companies')).c,
      users: (row<{ c: number }>('SELECT COUNT(*) AS c FROM users')).c,
      usersByRole: this.db
        .prepare(`SELECT role, COUNT(*) AS c FROM users GROUP BY role`)
        .all() as Array<{ role: string; c: number }>,
      contacts: (row<{ c: number }>('SELECT COUNT(*) AS c FROM contacts')).c,
      openOpportunities: (row<{ c: number }>(
        `SELECT COUNT(*) AS c FROM opportunities WHERE stage NOT IN ('Won','Lost','Cancelled')`,
      )).c,
      invoices: (row<{ c: number }>('SELECT COUNT(*) AS c FROM invoices')).c,
      openReceivables: (row<{ s: number }>(
        `SELECT COALESCE(SUM(total),0) AS s FROM invoices WHERE status != 'Paid' AND status != 'Draft'`,
      )).s,
      openPayables: (row<{ s: number }>(
        `SELECT COALESCE(SUM(amount),0) AS s FROM vendor_bills WHERE status != 'Paid' AND status != 'Draft'`,
      )).s,
      revenueMtd: (row<{ s: number }>(
        `SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE paidAt >= ?`,
        startOfMonth,
      )).s,
      revenueYtd: (row<{ s: number }>(
        `SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE paidAt >= ?`,
        startOfYear,
      )).s,
      whatsappInstances: (row<{ c: number }>('SELECT COUNT(*) AS c FROM whatsapp_instances')).c,
      whatsappActive: (row<{ c: number }>(
        `SELECT COUNT(*) AS c FROM whatsapp_instances WHERE state = 'authorized'`,
      )).c,
      tasksOpen: (row<{ c: number }>(
        `SELECT COUNT(*) AS c FROM tasks WHERE status != 'Done'`,
      )).c,
      followupsOpen: (row<{ c: number }>(
        `SELECT COUNT(*) AS c FROM activity_events WHERE nextActionDueDate IS NOT NULL`,
      )).c,
      followupsOverdue: (row<{ c: number }>(
        `SELECT COUNT(*) AS c FROM activity_events WHERE nextActionDueDate IS NOT NULL AND nextActionDueDate < ?`,
        new Date().toISOString(),
      )).c,
      commissionsDraft: (row<{ s: number }>(
        `SELECT COALESCE(SUM(amount),0) AS s FROM commissions WHERE status = 'Draft'`,
      )).s,
      commissionsApproved: (row<{ s: number }>(
        `SELECT COALESCE(SUM(amount),0) AS s FROM commissions WHERE status = 'Approved'`,
      )).s,
      commissionsPaid: (row<{ s: number }>(
        `SELECT COALESCE(SUM(amount),0) AS s FROM commissions WHERE status = 'Paid'`,
      )).s,
    };
  }

  /** Per-company rollups for the Companies tab. */
  listAdminCompanies() {
    const companies = this.db.prepare('SELECT * FROM companies').all() as Array<{ id: string; name: string; website?: string; address?: string }>;
    return companies.map((c) => {
      const stats = this.db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM users WHERE companyIds LIKE ?) AS users,
             (SELECT COUNT(*) FROM contacts WHERE companyId = ?) AS contacts,
             (SELECT COUNT(*) FROM invoices WHERE companyId = ?) AS invoices,
             (SELECT COALESCE(SUM(total),0) FROM invoices WHERE companyId = ?) AS revenue,
             (SELECT COUNT(*) FROM tasks WHERE companyId = ?) AS tasks,
             (SELECT MAX(createdAt) FROM activity_events WHERE companyId = ?) AS lastActivity,
             (SELECT COUNT(*) FROM whatsapp_instances WHERE companyId = ?) AS whatsappLinked`,
        )
        .get(`%"${c.id}"%`, c.id, c.id, c.id, c.id, c.id, c.id) as any;
      return {
        id: c.id,
        name: c.name,
        website: c.website ?? null,
        address: c.address ?? null,
        userCount: Number(stats.users) || 0,
        contactCount: Number(stats.contacts) || 0,
        invoiceCount: Number(stats.invoices) || 0,
        revenue: Number(stats.revenue) || 0,
        taskCount: Number(stats.tasks) || 0,
        lastActivityAt: stats.lastActivity ?? null,
        whatsappLinked: Number(stats.whatsappLinked) > 0,
      };
    });
  }

  /** All users system-wide with simple rollups. */
  listAdminUsers() {
    const users = this.listUsers();
    return users.map((u) => {
      const lastActivity = this.db
        .prepare(
          `SELECT MAX(createdAt) AS t FROM activity_events WHERE actorUserId = ?`,
        )
        .get(u.id) as { t?: string };
      return {
        ...u,
        lastActivityAt: lastActivity?.t ?? null,
      };
    });
  }

  /** Paginated cross-company activity feed for the Activity tab. */
  listAdminActivity(options: {
    companyId?: string;
    entityType?: string;
    actorUserId?: string;
    action?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  } = {}) {
    const where: string[] = [];
    const params: any[] = [];
    if (options.companyId)    { where.push('companyId = ?');    params.push(options.companyId); }
    if (options.entityType)   { where.push('entityType = ?');   params.push(options.entityType); }
    if (options.actorUserId)  { where.push('actorUserId = ?');  params.push(options.actorUserId); }
    if (options.action)       { where.push('action = ?');       params.push(options.action); }
    if (options.from)         { where.push('createdAt >= ?');   params.push(options.from.toISOString()); }
    if (options.to)           { where.push('createdAt <= ?');   params.push(options.to.toISOString()); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000);
    const offset = Math.max(options.offset ?? 0, 0);
    const rows = this.db
      .prepare(`SELECT * FROM activity_events ${clause} ORDER BY createdAt DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as any[];
    const total = (this.db
      .prepare(`SELECT COUNT(*) AS c FROM activity_events ${clause}`)
      .get(...params) as { c: number }).c;
    return {
      total,
      offset,
      limit,
      rows: rows.map((r) => this.decodeActivityEvent(r)),
    };
  }

  /** System health snapshot — version, uptime, DB stats, sweep timestamps. */
  getAdminHealth() {
    const tables = ['companies', 'users', 'contacts', 'projects', 'tasks', 'invoices',
      'vendor_bills', 'payments', 'commissions', 'opportunities', 'whatsapp_messages',
      'activity_events', 'journal_entries', 'deliveries'];
    const rowCounts = tables.map((t) => {
      try {
        const c = (this.db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c;
        return { table: t, rows: c };
      } catch {
        return { table: t, rows: 0 };
      }
    });
    let dbSize = 0;
    try {
      const fs = require('fs') as typeof import('fs');
      const path = (this.db as any).name as string | undefined;
      if (path) dbSize = fs.statSync(path).size;
    } catch { /* ignore */ }
    return {
      version: process.env.npm_package_version || 'unknown',
      nodeVersion: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      dbSizeBytes: dbSize,
      migrationsApplied: this.getAppliedMigrationIds(),
      rowCounts,
    };
  }

  /** Run sweep for every company. Returns total created across all. */
  sweepOverdueInvoiceFollowupsAll(): number {
    return this.sweepOverdueInvoiceFollowups();
  }

  /** Recompute Draft commissions across every company. */
  recomputeCommissionsAll(): number {
    const companyRows = this.db.prepare('SELECT id FROM companies').all() as Array<{ id: string }>;
    let touched = 0;
    for (const row of companyRows) {
      touched += this.recomputeCommissionsForCompany(row.id);
    }
    return touched;
  }

  /** Recompute paid/overdue status for every invoice in every company. */
  refreshAllInvoiceStatuses(): number {
    const rows = this.db.prepare(`SELECT id FROM invoices WHERE status != 'Paid' AND status != 'Draft'`).all() as Array<{ id: string }>;
    rows.forEach((r) => this.refreshInvoicePaymentStatus(r.id));
    return rows.length;
  }

  /** Used by /admin/tools/backup — returns the raw bytes of the SQLite file. */
  readDatabaseFile(): Buffer | undefined {
    try {
      const fs = require('fs') as typeof import('fs');
      const path = (this.db as any).name as string | undefined;
      if (!path) return undefined;
      return fs.readFileSync(path);
    } catch {
      return undefined;
    }
  }

  revokeToken(token: string) {
    this.db.prepare('DELETE FROM tokens WHERE token = ?').run(token);
  }

  getAppliedMigrationIds(): string[] {
    return (this.db.prepare('SELECT id FROM schema_migrations ORDER BY id ASC').all() as Array<{ id: string }>).map(
      (row) => row.id,
    );
  }

  getUserByToken(token: string): SanitizedUser | undefined {
    const row = this.db.prepare('SELECT userId FROM tokens WHERE token = ?').get(token) as { userId?: string } | undefined;
    if (!row?.userId) return undefined;
    return this.getUserById(row.userId);
  }

  private parseJson<T>(value: any): T | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') return value as T;
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }

  sanitizeUser(row: any): SanitizedUser {
    const parsedCompanyRoles = this.parseJson<CompanyRoleAssignment[]>(row.companyRoles);
    const companyRoles = Array.isArray(parsedCompanyRoles) ? parsedCompanyRoles : [];
    const parsedCompanyIds = this.parseJson<string[]>(row.companyIds);
    const companyIdsFromRow = Array.isArray(parsedCompanyIds) ? parsedCompanyIds : [];
    const companyIds =
      companyRoles.length > 0
        ? Array.from(new Set(companyRoles.map((c) => c.companyId)))
        : companyIdsFromRow;

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role as UserRole,
      companyIds,
      positionId: row.positionId || undefined,
      companyRoles,
      avatar: row.avatar || undefined,
      isSuperAdmin: Boolean(row.isSuperAdmin),
      commissionEligible: Boolean(row.commissionEligible),
      defaultCommissionRate:
        row.defaultCommissionRate === null || row.defaultCommissionRate === undefined
          ? undefined
          : Number(row.defaultCommissionRate),
      defaultCommissionBasis: row.defaultCommissionBasis ?? undefined,
      costRatePerHour:
        row.costRatePerHour === null || row.costRatePerHour === undefined
          ? undefined
          : Number(row.costRatePerHour),
    };
  }

  listCompanies(): Company[] {
    return this.db.prepare('SELECT * FROM companies').all() as Company[];
  }

  getCompanyById(id: string): Company | undefined {
    return this.db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as Company | undefined;
  }

  createCompany(company: Omit<Company, 'id'>): Company {
    const newCompany = { ...company, id: uuid() };
    this.db
      .prepare(
        `INSERT INTO companies (id, name, website, address, logoUrl, legalName, taxNumber, registrationNumber, phone, email, city, country, taxDetails)
         VALUES (@id, @name, @website, @address, @logoUrl, @legalName, @taxNumber, @registrationNumber, @phone, @email, @city, @country, @taxDetails)`,
      )
      .run({
        ...newCompany,
        website: newCompany.website ?? null,
        address: newCompany.address ?? null,
        logoUrl: newCompany.logoUrl ?? null,
        legalName: newCompany.legalName ?? null,
        taxNumber: newCompany.taxNumber ?? null,
        registrationNumber: newCompany.registrationNumber ?? null,
        phone: newCompany.phone ?? null,
        email: newCompany.email ?? null,
        city: newCompany.city ?? null,
        country: newCompany.country ?? null,
        taxDetails: newCompany.taxDetails ?? null,
      });
    this.ensureFinanceDefaults();
    this.ensureNumberingDefaults();
    this.ensureCompanyFinanceSettings();
    return newCompany;
  }

  updateCompany(id: string, updates: Partial<Omit<Company, 'id'>>): Company | undefined {
    const existing = this.getCompanyById(id);
    if (!existing) return undefined;
    const updated: Company = {
      ...existing,
      ...updates,
      name: updates.name ?? existing.name,
      website: updates.website ?? existing.website,
      address: updates.address ?? existing.address,
      logoUrl: updates.logoUrl ?? existing.logoUrl,
    };
    this.db
      .prepare(
        `UPDATE companies SET name=@name, website=@website, address=@address, logoUrl=@logoUrl,
           legalName=@legalName, taxNumber=@taxNumber, registrationNumber=@registrationNumber,
           phone=@phone, email=@email, city=@city, country=@country, taxDetails=@taxDetails
         WHERE id=@id`,
      )
      .run({
        id: updated.id,
        name: updated.name,
        website: updated.website ?? null,
        address: updated.address ?? null,
        logoUrl: updated.logoUrl ?? null,
        legalName: updated.legalName ?? null,
        taxNumber: updated.taxNumber ?? null,
        registrationNumber: updated.registrationNumber ?? null,
        phone: updated.phone ?? null,
        email: updated.email ?? null,
        city: updated.city ?? null,
        country: updated.country ?? null,
        taxDetails: updated.taxDetails ?? null,
      });
    return this.getCompanyById(id);
  }

  deleteCompany(id: string, options: { cascade?: boolean } = {}) {
    if (!options.cascade) {
      // Non-cascade: remove only the company record. Related rows are left in
      // place (they simply stop appearing once the company is gone). Still
      // scrub the company id from users so their membership isn't dangling.
      const trx = this.db.transaction(() => {
        this.db.prepare('DELETE FROM companies WHERE id = ?').run(id);
        this.removeCompanyFromUsers([id]);
      });
      trx();
      return;
    }

    // Cascade: remove every row that belongs to this company across all
    // company-scoped tables, discovered by introspection so new tables are
    // covered automatically.
    const tables = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>;

    const trx = this.db.transaction(() => {
      // Journal lines are keyed by entryId (no companyId), so clear them via
      // their parent entries first to avoid orphaned financial lines.
      this.db
        .prepare('DELETE FROM journal_lines WHERE entryId IN (SELECT id FROM journal_entries WHERE companyId = ?)')
        .run(id);

      for (const { name } of tables) {
        if (name === 'companies' || name === 'schema_migrations' || name === 'journal_lines') continue;
        const cols = this.db.prepare(`PRAGMA table_info('${name}')`).all() as Array<{ name: string }>;
        if (cols.some((c) => c.name === 'companyId')) {
          this.db.prepare(`DELETE FROM ${name} WHERE companyId = ?`).run(id);
        }
      }

      this.db.prepare('DELETE FROM companies WHERE id = ?').run(id);
      // Users store membership as JSON arrays (companyIds / companyRoles), not
      // a companyId column, so the loop above doesn't touch them.
      this.removeCompanyFromUsers([id]);
    });
    trx();
  }

  /**
   * Strips the given company ids out of every user's companyIds and
   * companyRoles JSON arrays. Used when companies are deleted so user
   * membership never points at a company that no longer exists.
   * Returns the number of user rows that changed.
   */
  private removeCompanyFromUsers(companyIds: string[]): number {
    if (!companyIds.length) return 0;
    const remove = new Set(companyIds);
    const users = this.db
      .prepare('SELECT id, companyIds, companyRoles FROM users')
      .all() as Array<{ id: string; companyIds: string; companyRoles: string | null }>;
    const updateStmt = this.db.prepare('UPDATE users SET companyIds = ?, companyRoles = ? WHERE id = ?');
    let changed = 0;
    for (const u of users) {
      const ids = this.parseJson<string[]>(u.companyIds) || [];
      const roles = (this.parseJson<Array<{ companyId: string }>>(u.companyRoles) || []) as Array<{ companyId: string }>;
      const nextIds = ids.filter((cid) => !remove.has(cid));
      const nextRoles = roles.filter((r) => r && !remove.has(r.companyId));
      if (nextIds.length !== ids.length || nextRoles.length !== roles.length) {
        updateStmt.run(JSON.stringify(nextIds), JSON.stringify(nextRoles), u.id);
        changed += 1;
      }
    }
    return changed;
  }

  /**
   * Removes every company-scoped row whose companyId no longer exists in the
   * companies table. Cleans up orphans left behind by a non-cascade company
   * deletion. Returns the per-table counts removed.
   */
  pruneOrphanedCompanyData(): Array<{ table: string; removed: number }> {
    const validIds = (this.db.prepare('SELECT id FROM companies').all() as Array<{ id: string }>).map((r) => r.id);
    const placeholders = validIds.length ? validIds.map(() => '?').join(',') : null;
    const notInValid = placeholders ? `companyId NOT IN (${placeholders})` : '1=1';
    const tables = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>;
    const results: Array<{ table: string; removed: number }> = [];

    const trx = this.db.transaction(() => {
      // Journal lines have no companyId; clear those whose parent entry is orphaned.
      const orphanLines = placeholders
        ? this.db
            .prepare(`DELETE FROM journal_lines WHERE entryId IN (SELECT id FROM journal_entries WHERE companyId NOT IN (${placeholders}))`)
            .run(...validIds)
        : this.db.prepare('DELETE FROM journal_lines').run();
      if (orphanLines.changes) results.push({ table: 'journal_lines', removed: orphanLines.changes });

      for (const { name } of tables) {
        if (name === 'companies' || name === 'schema_migrations' || name === 'journal_lines' || name === 'users') continue;
        const cols = this.db.prepare(`PRAGMA table_info('${name}')`).all() as Array<{ name: string }>;
        if (!cols.some((c) => c.name === 'companyId')) continue;
        const res = placeholders
          ? this.db.prepare(`DELETE FROM ${name} WHERE ${notInValid}`).run(...validIds)
          : this.db.prepare(`DELETE FROM ${name}`).run();
        if (res.changes) results.push({ table: name, removed: res.changes });
      }

      // Scrub dangling company references out of users (membership is stored
      // as JSON arrays, so the loop above can't reach them).
      const valid = new Set(validIds);
      const users = this.db
        .prepare('SELECT id, companyIds, companyRoles FROM users')
        .all() as Array<{ id: string; companyIds: string; companyRoles: string | null }>;
      const updateStmt = this.db.prepare('UPDATE users SET companyIds = ?, companyRoles = ? WHERE id = ?');
      let usersChanged = 0;
      for (const u of users) {
        const ids = this.parseJson<string[]>(u.companyIds) || [];
        const roles = (this.parseJson<Array<{ companyId: string }>>(u.companyRoles) || []) as Array<{ companyId: string }>;
        const nextIds = ids.filter((cid) => valid.has(cid));
        const nextRoles = roles.filter((r) => r && valid.has(r.companyId));
        if (nextIds.length !== ids.length || nextRoles.length !== roles.length) {
          updateStmt.run(JSON.stringify(nextIds), JSON.stringify(nextRoles), u.id);
          usersChanged += 1;
        }
      }
      if (usersChanged) results.push({ table: 'users (company refs)', removed: usersChanged });
    });
    trx();
    return results;
  }

  listPositions(): Position[] {
    return this.db.prepare('SELECT * FROM positions').all() as Position[];
  }

  getPositionById(id: string): Position | undefined {
    return this.db.prepare('SELECT * FROM positions WHERE id = ?').get(id) as Position | undefined;
  }

  createPosition(position: Omit<Position, 'id'>): Position {
    const newPosition = { ...position, id: uuid(), companyId: position.companyId };
    this.db
      .prepare('INSERT INTO positions (id, title, companyId) VALUES (@id, @title, @companyId)')
      .run({ ...newPosition, companyId: newPosition.companyId ?? null });
    return newPosition;
  }

  deletePosition(id: string) {
    this.db.prepare('DELETE FROM positions WHERE id = ?').run(id);
  }

  listUsers(): SanitizedUser[] {
    const rows = this.db.prepare('SELECT * FROM users').all();
    return rows.map((r: any) => this.sanitizeUser(r));
  }

  getUserById(id: string): SanitizedUser | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return row ? this.sanitizeUser(row) : undefined;
  }

  findUserByEmail(email: string): User | undefined {
    const row = this.db
      .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)')
      .get(email) as any;
    if (!row) return undefined;
    return {
      ...this.sanitizeUser(row),
      password: row.password,
    };
  }

  getUsersByCompany(companyId: string): SanitizedUser[] {
    const rows = this.db.prepare('SELECT * FROM users').all();
    return rows
      .filter((r: any) => {
        const roles = this.parseJson<CompanyRoleAssignment[]>(r.companyRoles);
        if (roles && roles.length > 0) {
          return roles.some((c) => c.companyId === companyId);
        }
        const ids = this.parseJson<string[]>(r.companyIds) || [];
        return ids.includes(companyId);
      })
      .map((r: any) => this.sanitizeUser(r));
  }

  createUser(user: CreateUserInput): SanitizedUser {
    const normalizedCompanyRoles: CompanyRoleAssignment[] =
      user.companyRoles && user.companyRoles.length > 0
        ? user.companyRoles
        : (user.companyIds || []).map((cid) => ({
            companyId: cid,
            role: (user.role as UserRole) || 'Employee',
            positionId: user.positionId,
          }));

    const normalizedCompanyIds = normalizedCompanyRoles.map((c) => c.companyId);

    const existingByEmail = this.findUserByEmail(user.email);
    if (existingByEmail) {
      if (user.id && existingByEmail.id === user.id) {
        const updatedUser: User = {
          ...existingByEmail,
          ...user,
          password: user.password ? hashPassword(user.password) : existingByEmail.password,
          companyIds: normalizedCompanyIds.length > 0 ? normalizedCompanyIds : existingByEmail.companyIds,
          companyRoles: normalizedCompanyRoles.length > 0 ? normalizedCompanyRoles : existingByEmail.companyRoles,
          role: user.role || normalizedCompanyRoles[0]?.role || existingByEmail.role || 'Employee',
          positionId: user.positionId ?? existingByEmail.positionId,
          avatar: user.avatar ?? existingByEmail.avatar,
        };
        this.db
          .prepare(
            'UPDATE users SET name=@name, email=@email, role=@role, companyIds=@companyIds, positionId=@positionId, companyRoles=@companyRoles, avatar=@avatar, password=@password, isSuperAdmin=@isSuperAdmin, commissionEligible=@commissionEligible, defaultCommissionRate=@defaultCommissionRate, defaultCommissionBasis=@defaultCommissionBasis, costRatePerHour=@costRatePerHour WHERE id=@id',
          )
          .run({
            ...updatedUser,
            companyIds: JSON.stringify(updatedUser.companyIds || []),
            positionId: updatedUser.positionId ?? null,
            companyRoles: JSON.stringify(updatedUser.companyRoles || []),
            avatar: updatedUser.avatar ?? null,
            isSuperAdmin: updatedUser.isSuperAdmin ? 1 : 0,
            commissionEligible: updatedUser.commissionEligible ? 1 : 0,
            defaultCommissionRate: updatedUser.defaultCommissionRate ?? null,
            defaultCommissionBasis: updatedUser.defaultCommissionBasis ?? null,
            costRatePerHour: updatedUser.costRatePerHour ?? null,
          });
        const persisted = this.getUserById(updatedUser.id);
        if (!persisted) {
          throw new Error('Unable to update existing user.');
        }
        return persisted;
      }
      throw new Error('Email already exists');
    }

    const newUser: User = {
      ...user,
      id: user.id ?? uuid(),
      password: hashPassword(user.password),
      companyIds: normalizedCompanyIds,
      companyRoles: normalizedCompanyRoles,
      role: user.role || normalizedCompanyRoles[0]?.role || 'Employee',
      positionId: user.positionId,
      avatar: user.avatar,
    };

    this.db
      .prepare(
        'INSERT INTO users (id, name, email, role, companyIds, positionId, companyRoles, avatar, password, isSuperAdmin, commissionEligible, defaultCommissionRate, defaultCommissionBasis, costRatePerHour) VALUES (@id, @name, @email, @role, @companyIds, @positionId, @companyRoles, @avatar, @password, @isSuperAdmin, @commissionEligible, @defaultCommissionRate, @defaultCommissionBasis, @costRatePerHour)',
      )
      .run({
        ...newUser,
        companyIds: JSON.stringify(newUser.companyIds || []),
        positionId: newUser.positionId ?? null,
        companyRoles: JSON.stringify(newUser.companyRoles || []),
        avatar: newUser.avatar ?? null,
        isSuperAdmin: newUser.isSuperAdmin ? 1 : 0,
        commissionEligible: newUser.commissionEligible ? 1 : 0,
        defaultCommissionRate: newUser.defaultCommissionRate ?? null,
        defaultCommissionBasis: newUser.defaultCommissionBasis ?? null,
        costRatePerHour: newUser.costRatePerHour ?? null,
      });
    const persisted = this.getUserById(newUser.id);
    if (!persisted) {
      throw new Error('Unable to create user.');
    }
    return persisted;
  }

  updateUser(userId: string, updates: Partial<Omit<User, 'id'>>) {
    const existing = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!existing) return undefined;
    const existingCompanyRoles =
      this.parseJson<CompanyRoleAssignment[]>(existing.companyRoles) ||
      (this.parseJson<string[]>(existing.companyIds) || []).map((cid: string) => ({
        companyId: cid,
        role: existing.role as UserRole,
        positionId: existing.positionId || undefined,
      }));

    const nextCompanyRoles: CompanyRoleAssignment[] =
      updates.companyRoles && updates.companyRoles.length > 0
        ? updates.companyRoles
        : existingCompanyRoles;

    const updatedCompanyIds = updates.companyIds ?? nextCompanyRoles.map((c) => c.companyId);

    const updated = {
      ...existing,
      ...updates,
      name: updates.name ?? existing.name,
      email: updates.email ?? existing.email,
      role: updates.role || existing.role,
      positionId: updates.positionId ?? existing.positionId ?? null,
      companyIds: JSON.stringify(updatedCompanyIds),
      companyRoles: JSON.stringify(nextCompanyRoles),
      avatar: updates.avatar ?? existing.avatar ?? null,
      // Hash a new password; an already-hashed value (legacy rehash) passes through.
      password:
        updates.password !== undefined
          ? isHashed(updates.password)
            ? updates.password
            : hashPassword(updates.password)
          : existing.password,
      isSuperAdmin:
        updates.isSuperAdmin !== undefined
          ? (updates.isSuperAdmin ? 1 : 0)
          : existing.isSuperAdmin ?? 0,
      commissionEligible:
        updates.commissionEligible !== undefined
          ? (updates.commissionEligible ? 1 : 0)
          : existing.commissionEligible ?? 0,
      defaultCommissionRate:
        updates.defaultCommissionRate !== undefined
          ? updates.defaultCommissionRate
          : existing.defaultCommissionRate ?? null,
      defaultCommissionBasis:
        updates.defaultCommissionBasis !== undefined
          ? updates.defaultCommissionBasis
          : existing.defaultCommissionBasis ?? null,
      costRatePerHour:
        updates.costRatePerHour !== undefined
          ? updates.costRatePerHour
          : existing.costRatePerHour ?? null,
    };
    this.db
      .prepare(
        'UPDATE users SET name=@name, email=@email, role=@role, companyIds=@companyIds, positionId=@positionId, companyRoles=@companyRoles, avatar=@avatar, password=@password, isSuperAdmin=@isSuperAdmin, commissionEligible=@commissionEligible, defaultCommissionRate=@defaultCommissionRate, defaultCommissionBasis=@defaultCommissionBasis, costRatePerHour=@costRatePerHour WHERE id=@id',
      )
      .run(updated);
    return this.getUserById(userId);
  }

  deleteUser(userId: string) {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  listProjects(): Project[] {
    const rows = this.db.prepare('SELECT * FROM projects').all() as any[];
    return rows.map((r) => ({
      ...r,
      memberIds: this.parseJson<string[]>(r.memberIds) || [],
      clientId: r.clientId || undefined,
    }));
  }

  getProjectById(id: string): Project | undefined {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return { ...row, memberIds: this.parseJson<string[]>(row.memberIds) || [], clientId: row.clientId || undefined };
  }

  createProject(project: Omit<Project, 'id'>): Project {
    const newProject: Project = {
      ...project,
      id: uuid(),
      memberIds: project.memberIds || [],
      clientId: project.clientId ?? undefined,
      description: project.description ?? null,
      color: project.color ?? null,
    };
    this.db
      .prepare(
        'INSERT INTO projects (id, name, description, color, companyId, visibility, memberIds, clientId) VALUES (@id, @name, @description, @color, @companyId, @visibility, @memberIds, @clientId)',
      )
      .run({
        id: newProject.id,
        name: newProject.name,
        description: newProject.description,
        color: newProject.color,
        companyId: newProject.companyId,
        visibility: newProject.visibility,
        memberIds: JSON.stringify(newProject.memberIds || []),
        clientId: newProject.clientId,
      });
    // Auto-seed Project Lead contributor (first member by convention).
    if (newProject.memberIds && newProject.memberIds.length > 0) {
      try {
        this.seedDefaultContributors({
          companyId: newProject.companyId,
          sourceType: 'project',
          sourceId: newProject.id,
          userIds: [newProject.memberIds[0]],
          role: 'Project Lead',
        });
      } catch (error) {
        console.error('Failed to seed Project Lead contributor', error);
      }
    }
    this.createActivityEvent({
      companyId: newProject.companyId,
      entityType: 'project',
      entityId: newProject.id,
      action: 'created',
      summary: `Project ${newProject.name} created${newProject.clientId ? ' with linked client' : ''}.`,
      metadata: { visibility: newProject.visibility, clientId: newProject.clientId },
    });
    return newProject;
  }

  updateProject(id: string, updates: Partial<Omit<Project, 'id'>>) {
    const existing = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!existing) return undefined;
    const updatedMemberIds =
      updates.memberIds ?? (this.parseJson<string[]>(existing.memberIds) || []);
    const updated = {
      ...existing,
      ...updates,
      memberIds: JSON.stringify(updatedMemberIds),
      clientId: updates.clientId ?? existing.clientId ?? undefined,
      description: updates.description ?? existing.description ?? null,
      color: updates.color ?? existing.color ?? null,
    };
    this.db
      .prepare(
        'UPDATE projects SET name=@name, description=@description, color=@color, companyId=@companyId, visibility=@visibility, memberIds=@memberIds, clientId=@clientId WHERE id=@id',
      )
      .run(updated);
    const result = {
      ...existing,
      ...updates,
      memberIds: updatedMemberIds,
      clientId: updated.clientId,
      description: updated.description,
      color: updated.color,
    };
    this.createActivityEvent({
      companyId: result.companyId,
      entityType: 'project',
      entityId: result.id,
      action: 'updated',
      summary: `Project ${result.name} updated.`,
      metadata: { clientId: result.clientId, visibility: result.visibility },
    });
    return result;
  }

  deleteProject(id: string) {
    const trx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM tasks WHERE projectId = ?').run(id);
      this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    });
    trx();
  }

  addProjectMember(projectId: string, userId: string) {
    const project = this.getProjectById(projectId);
    if (!project) return undefined;
    const memberSet = new Set(project.memberIds || []);
    memberSet.add(userId);
    return this.updateProject(projectId, { memberIds: Array.from(memberSet) });
  }

  removeProjectMember(projectId: string, userId: string) {
    const project = this.getProjectById(projectId);
    if (!project) return undefined;
    const filtered = (project.memberIds || []).filter((id) => id !== userId);
    return this.updateProject(projectId, { memberIds: filtered });
  }

  listTasks(): Task[] {
    const rows = this.db.prepare('SELECT * FROM tasks').all() as any[];
    return rows.map((r) => this.decodeTask(r));
  }

  getTaskById(id: string): Task | undefined {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this.decodeTask(row);
  }

  getTasksByClient(companyId: string, clientId: string): Task[] {
    const rows = this.db
      .prepare(
        `SELECT t.*
         FROM tasks t
         JOIN projects p ON p.id = t.projectId
         WHERE p.companyId = ? AND p.clientId = ?`,
      )
      .all(companyId, clientId) as any[];
    return rows.map((r) => this.decodeTask(r));
  }

  private decodeTask(row: any): Task {
    return {
      ...row,
      createdAt: new Date(row.createdAt),
      dueDate: row.dueDate ? new Date(row.dueDate) : undefined,
      assignedUserIds: this.parseJson<string[]>(row.assignedUserIds) || [],
      tags: this.parseJson<string[]>(row.tags) || [],
      dependencies: this.parseJson<string[]>(row.dependencies) || [],
      parentTaskId: row.parentTaskId || undefined,
      invoiceDate: row.invoiceDate ? new Date(row.invoiceDate) : undefined,
    };
  }

  createTask(task: CreateTaskInput): Task {
    const newTask: Task = {
      ...task,
      id: uuid(),
      status: task.status ?? 'To Do',
      createdAt: task.createdAt ? new Date(task.createdAt) : new Date(),
    };
    this.db
      .prepare(
        'INSERT INTO tasks (id, title, description, status, priority, createdAt, dueDate, assignedUserIds, tags, companyId, projectId, color, dependencies, parentTaskId, invoiceImage, invoiceVendor, invoiceNumber, invoiceAmount, invoiceDate, generatedInvoiceId) VALUES (@id, @title, @description, @status, @priority, @createdAt, @dueDate, @assignedUserIds, @tags, @companyId, @projectId, @color, @dependencies, @parentTaskId, @invoiceImage, @invoiceVendor, @invoiceNumber, @invoiceAmount, @invoiceDate, @generatedInvoiceId)',
      )
      .run({
        id: newTask.id,
        title: newTask.title,
        description: newTask.description ?? null,
        status: newTask.status,
        priority: newTask.priority,
        createdAt: newTask.createdAt.toISOString(),
        dueDate: newTask.dueDate ? new Date(newTask.dueDate).toISOString() : null,
        assignedUserIds: JSON.stringify(newTask.assignedUserIds || []),
        tags: JSON.stringify(newTask.tags || []),
        companyId: newTask.companyId,
        projectId: newTask.projectId,
        color: newTask.color ?? null,
        dependencies: JSON.stringify(newTask.dependencies || []),
        parentTaskId: newTask.parentTaskId ?? null,
        invoiceImage: newTask.invoiceImage ?? null,
        invoiceVendor: newTask.invoiceVendor ?? null,
        invoiceNumber: newTask.invoiceNumber ?? null,
        invoiceAmount: newTask.invoiceAmount ?? null,
        invoiceDate: newTask.invoiceDate ? new Date(newTask.invoiceDate).toISOString() : null,
        generatedInvoiceId: newTask.generatedInvoiceId ?? null,
      });
    // Auto-seed Contributor rows for each assignee (split evenly).
    if (newTask.assignedUserIds && newTask.assignedUserIds.length > 0) {
      try {
        this.seedDefaultContributors({
          companyId: newTask.companyId,
          sourceType: 'task',
          sourceId: newTask.id,
          userIds: newTask.assignedUserIds,
          role: 'Contributor',
        });
      } catch (error) {
        console.error('Failed to seed task contributors', error);
      }
    }
    this.createActivityEvent({
      companyId: newTask.companyId,
      entityType: 'task',
      entityId: newTask.id,
      action: 'created',
      summary: `Task ${newTask.title} created.`,
      metadata: { projectId: newTask.projectId, status: newTask.status },
    });
    this.notify({
      companyId: newTask.companyId,
      userIds: newTask.assignedUserIds ?? [],
      type: 'task_assigned',
      title: `New task: ${newTask.title}`,
      body: `You were assigned to "${newTask.title}".`,
      link: taskLink(newTask.projectId),
      entityType: 'task',
      entityId: newTask.id,
    });
    return newTask;
  }

  updateTask(id: string, updates: UpdateTaskInput) {
    const existing = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    if (!existing) return undefined;
    const prevAssigned = this.parseJson<string[]>(existing.assignedUserIds) || [];
    const prevStatus = existing.status as string;
    const updatedAssigned = updates.assignedUserIds ?? (this.parseJson<string[]>(existing.assignedUserIds) || []);
    const updatedTags = updates.tags ?? (this.parseJson<string[]>(existing.tags) || []);
    const updatedDeps = updates.dependencies ?? (this.parseJson<string[]>(existing.dependencies) || []);
    const updated = {
      ...existing,
      ...updates,
      // NOT NULL columns must never be nulled by a partial update that omits
      // them (or sends an explicit null). Always fall back to the existing row.
      title: updates.title ?? existing.title,
      status: updates.status ?? existing.status,
      priority: updates.priority ?? existing.priority,
      companyId: updates.companyId ?? existing.companyId,
      // projectId is NOT NULL. Omitted (undefined) keeps the existing value so a
      // partial update (e.g. Kanban drag sending only status) doesn't blank it;
      // an explicit '' clears the project (no project).
      projectId: updates.projectId !== undefined ? updates.projectId : existing.projectId,
      createdAt: existing.createdAt,
      dueDate: updates.dueDate ? new Date(updates.dueDate).toISOString() : existing.dueDate,
      assignedUserIds: JSON.stringify(updatedAssigned),
      tags: JSON.stringify(updatedTags),
      dependencies: JSON.stringify(updatedDeps),
      parentTaskId: updates.parentTaskId ?? existing.parentTaskId ?? null,
      invoiceDate: updates.invoiceDate
        ? new Date(updates.invoiceDate).toISOString()
        : existing.invoiceDate,
    };

    this.db
      .prepare(
        'UPDATE tasks SET title=@title, description=@description, status=@status, priority=@priority, createdAt=@createdAt, dueDate=@dueDate, assignedUserIds=@assignedUserIds, tags=@tags, companyId=@companyId, projectId=@projectId, color=@color, dependencies=@dependencies, invoiceImage=@invoiceImage, invoiceVendor=@invoiceVendor, invoiceNumber=@invoiceNumber, invoiceAmount=@invoiceAmount, invoiceDate=@invoiceDate, generatedInvoiceId=@generatedInvoiceId WHERE id=@id',
      )
      .run(updated);
    const result = this.decodeTask({ ...existing, ...updates, ...updated });
    this.createActivityEvent({
      companyId: result.companyId,
      entityType: 'task',
      entityId: result.id,
      action: 'updated',
      summary: `Task ${result.title} updated.`,
      metadata: { projectId: result.projectId, status: result.status },
    });
    const link = taskLink(result.projectId);
    const addedAssignees = updatedAssigned.filter((uid) => !prevAssigned.includes(uid));
    if (addedAssignees.length > 0) {
      this.notify({
        companyId: result.companyId,
        userIds: addedAssignees,
        type: 'task_assigned',
        title: `New task: ${result.title}`,
        body: `You were assigned to "${result.title}".`,
        link,
        entityType: 'task',
        entityId: result.id,
      });
    }
    if (updates.status && updates.status !== prevStatus) {
      this.notify({
        companyId: result.companyId,
        userIds: updatedAssigned,
        type: 'task_status',
        title: `${result.title} → ${result.status}`,
        body: `Status changed from ${prevStatus} to ${result.status}.`,
        link,
        entityType: 'task',
        entityId: result.id,
      });
    }
    return result;
  }

  markTasksAsInvoiced(taskIds: string[], invoiceId: string) {
    const stmt = this.db.prepare('UPDATE tasks SET generatedInvoiceId = ? WHERE id = ?');
    const trx = this.db.transaction(() => {
      taskIds.forEach((id) => stmt.run(invoiceId, id));
    });
    trx();
  }

  listCommentsByTask(taskId: string): Comment[] {
    const rows = this.db.prepare('SELECT * FROM comments WHERE taskId = ?').all(taskId) as any[];
    return rows.map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt),
    }));
  }

  createComment(comment: Omit<Comment, 'id' | 'createdAt'> & { createdAt?: Date | string }) {
    const newComment: Comment = {
      ...comment,
      id: uuid(),
      createdAt: comment.createdAt ? new Date(comment.createdAt) : new Date(),
    };
    this.db
      .prepare('INSERT INTO comments (id, taskId, userId, content, createdAt) VALUES (@id, @taskId, @userId, @content, @createdAt)')
      .run({
        ...newComment,
        createdAt: newComment.createdAt.toISOString(),
      });
    const task = this.getTaskById(newComment.taskId);
    if (task) {
      this.notify({
        companyId: task.companyId,
        // Notify assignees other than the commenter.
        userIds: (task.assignedUserIds ?? []).filter((uid) => uid !== newComment.userId),
        type: 'task_comment',
        title: `New comment on ${task.title}`,
        body: newComment.content.slice(0, 160),
        link: taskLink(task.projectId),
        entityType: 'task',
        entityId: task.id,
      });
    }
    return newComment;
  }

  // ── Task time tracking ─────────────────────────────────────────────────────

  private decodeTimeEntry(row: any): TimeEntry {
    return {
      id: row.id,
      companyId: row.companyId,
      taskId: row.taskId,
      userId: row.userId,
      userName: row.userName ?? undefined,
      minutes: Number(row.minutes) || 0,
      spentOn: new Date(row.spentOn),
      note: row.note ?? undefined,
      cost: row.cost === null || row.cost === undefined ? undefined : Number(row.cost),
      createdAt: new Date(row.createdAt),
    };
  }

  listTimeEntries(taskId: string): TimeEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM time_entries WHERE taskId = ? ORDER BY spentOn DESC, createdAt DESC')
      .all(taskId) as any[];
    return rows.map((r) => this.decodeTimeEntry(r));
  }

  getTimeEntryById(id: string): TimeEntry | undefined {
    const row = this.db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id) as any;
    return row ? this.decodeTimeEntry(row) : undefined;
  }

  createTimeEntry(input: {
    companyId: string;
    taskId: string;
    userId: string;
    minutes: number;
    spentOn?: Date | string;
    note?: string;
  }): TimeEntry {
    const minutes = Math.round(Number(input.minutes));
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new Error('Logged time must be greater than zero.');
    }
    const user = this.getUserById(input.userId);
    const rate = user?.costRatePerHour;
    const cost = typeof rate === 'number' ? Number(((minutes / 60) * rate).toFixed(2)) : undefined;
    const entry: TimeEntry = {
      id: uuid(),
      companyId: input.companyId,
      taskId: input.taskId,
      userId: input.userId,
      userName: user?.name,
      minutes,
      spentOn: input.spentOn ? new Date(input.spentOn) : new Date(),
      note: input.note,
      cost,
      createdAt: new Date(),
    };
    this.db
      .prepare(
        `INSERT INTO time_entries (id, companyId, taskId, userId, userName, minutes, spentOn, note, cost, createdAt)
         VALUES (@id, @companyId, @taskId, @userId, @userName, @minutes, @spentOn, @note, @cost, @createdAt)`,
      )
      .run({
        ...entry,
        userName: entry.userName ?? null,
        spentOn: entry.spentOn.toISOString(),
        note: entry.note ?? null,
        cost: entry.cost ?? null,
        createdAt: entry.createdAt.toISOString(),
      });
    return entry;
  }

  deleteTimeEntry(id: string): TimeEntry | undefined {
    const row = this.db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    this.db.prepare('DELETE FROM time_entries WHERE id = ?').run(id);
    return this.decodeTimeEntry(row);
  }

  // ─── Contacts ────────────────────────────────────────────────────────────

  listContacts(
    companyId: string,
    roleFilter?: ContactRoleType,
    viewer?: { userId: string; role: string },
  ): Contact[] {
    // Private contacts are only visible to their owner or Admin/Manager
    const visibilityClause =
      viewer && viewer.role !== 'Admin' && viewer.role !== 'Manager'
        ? `AND (c.visibility = 'Public' OR c.ownerUserId = '${viewer.userId}')`
        : '';

    let rows: any[];
    if (roleFilter) {
      rows = this.db
        .prepare(
          `SELECT c.*, GROUP_CONCAT(r.role) as roleList
           FROM contacts c
           LEFT JOIN contact_roles r ON r.contactId = c.id
           WHERE c.companyId = ?
           AND c.id IN (SELECT contactId FROM contact_roles WHERE companyId = ? AND role = ?)
           ${visibilityClause}
           GROUP BY c.id
           ORDER BY c.name ASC`,
        )
        .all(companyId, companyId, roleFilter) as any[];
    } else {
      rows = this.db
        .prepare(
          `SELECT c.*, GROUP_CONCAT(r.role) as roleList
           FROM contacts c
           LEFT JOIN contact_roles r ON r.contactId = c.id
           WHERE c.companyId = ?
           ${visibilityClause}
           GROUP BY c.id
           ORDER BY c.name ASC`,
        )
        .all(companyId) as any[];
    }
    return rows.map((row) => this.decodeContact(row));
  }

  getContactById(id: string): Contact | undefined {
    const row = this.db
      .prepare(
        `SELECT c.*, GROUP_CONCAT(r.role) as roleList
         FROM contacts c
         LEFT JOIN contact_roles r ON r.contactId = c.id
         WHERE c.id = ?
         GROUP BY c.id`,
      )
      .get(id) as any;
    return row ? this.decodeContact(row) : undefined;
  }

  createContact(input: {
    companyId: string;
    kind?: 'Organization' | 'Person';
    name: string;
    legalName?: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    address?: string;
    taxNumber?: string;
	    tags?: string[];
	    notes?: string;
			    roles?: ContactRoleType[];
			    clientId?: string;
			    supplierId?: string;
			    leadStatus?: LeadStatus;
			    leadSource?: Contact['leadSource'];
			    priority?: Contact['priority'];
			    ownerUserId?: string;
			    ownerName?: string;
			    nextFollowupDate?: Date;
			    nextFollowupNote?: string;
			    influencerPlatform?: string;
		    influencerHandle?: string;
		    influencerNiche?: string;
		    followerCount?: number;
		    engagementRate?: number;
		    rateCardAmount?: number;
		    location?: string;
		    languages?: string[];
		    availabilityStatus?: string;
		    influencerAccounts?: InfluencerAccount[];
		    customFields?: Record<string, unknown>;
		  }): Contact {
    const id = uuid();
    const now = new Date().toISOString();
    const customFields = this.normalizeCustomFields(input.companyId, 'contact', input.customFields);
	  this.db.prepare(
		      `INSERT INTO contacts (id, companyId, kind, name, legalName, contactPerson, email, phone, address, taxNumber, tags, notes, clientId, supplierId,
		         leadStatus, leadSource, priority, ownerUserId, ownerName, nextFollowupDate, nextFollowupNote,
		         influencerPlatform, influencerHandle, influencerNiche, followerCount, engagementRate, rateCardAmount, location, languages, availabilityStatus, influencerAccounts, customFields,
		         createdAt, updatedAt)
		       VALUES (@id, @companyId, @kind, @name, @legalName, @contactPerson, @email, @phone, @address, @taxNumber, @tags, @notes, @clientId, @supplierId,
		         @leadStatus, @leadSource, @priority, @ownerUserId, @ownerName, @nextFollowupDate, @nextFollowupNote,
		         @influencerPlatform, @influencerHandle, @influencerNiche, @followerCount, @engagementRate, @rateCardAmount, @location, @languages, @availabilityStatus, @influencerAccounts, @customFields,
		         @now, @now)`,
	    ).run({
      id,
      companyId: input.companyId,
      kind: input.kind ?? 'Organization',
      name: input.name,
      legalName: input.legalName ?? null,
      contactPerson: input.contactPerson ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      taxNumber: input.taxNumber ?? null,
	      tags: input.tags ? JSON.stringify(input.tags) : null,
	      notes: input.notes ?? null,
			      clientId: input.clientId ?? null,
			      supplierId: input.supplierId ?? null,
			      leadStatus: input.leadStatus ?? null,
			      leadSource: input.leadSource ?? null,
			      priority: input.priority ?? null,
			      ownerUserId: input.ownerUserId ?? null,
			      ownerName: input.ownerName ?? null,
			      nextFollowupDate: input.nextFollowupDate ? new Date(input.nextFollowupDate).toISOString() : null,
			      nextFollowupNote: input.nextFollowupNote ?? null,
			      influencerPlatform: input.influencerPlatform ?? null,
		      influencerHandle: input.influencerHandle ?? null,
		      influencerNiche: input.influencerNiche ?? null,
		      followerCount: input.followerCount ?? null,
		      engagementRate: input.engagementRate ?? null,
		      rateCardAmount: input.rateCardAmount ?? null,
		      location: input.location ?? null,
		      languages: input.languages ? JSON.stringify(input.languages) : null,
		      availabilityStatus: input.availabilityStatus ?? null,
		      influencerAccounts: input.influencerAccounts ? JSON.stringify(input.influencerAccounts) : null,
		      customFields: customFields ? JSON.stringify(customFields) : null,
		      now,
	    });

    if (input.roles?.length) {
      for (const role of input.roles) {
        this.addContactRole(id, input.companyId, role, 'Manual');
      }
    }

    // Manual first-touch date (e.g. from the pipeline quick-entry) takes
    // precedence; otherwise auto-queue a NewLead first-touch reminder.
    if (input.nextFollowupDate) {
      this.syncManualContactFollowup(this.getContactById(id)!, new Date(input.nextFollowupDate));
    } else if ((input.roles || []).includes('Lead')) {
      try {
        this.scheduleAutomaticFollowup({
          companyId: input.companyId,
          contactId: id,
          trigger: 'NewLead',
          sourceType: 'contact',
          sourceId: id,
          summary: `New lead: ${input.name} — reach out.`,
          nextAction: 'First-touch outreach to qualify the lead.',
          offsetDays: 2,
          category: 'Follow-up',
        });
      } catch (error) {
        console.error('Failed to schedule NewLead follow-up', error);
      }
    }

    return this.getContactById(id)!;
  }

  updateContact(id: string, updates: UpdateContactInput): Contact {
    const existing = this.getContactById(id);
    if (!existing) throw new Error(`Contact ${id} not found`);
    const now = new Date().toISOString();
    this.db.prepare(
      `UPDATE contacts SET kind=@kind, name=@name, legalName=@legalName, contactPerson=@contactPerson,
       email=@email, phone=@phone, address=@address, taxNumber=@taxNumber, tags=@tags, notes=@notes,
	       leadStatus=@leadStatus, leadSource=@leadSource, priority=@priority,
	       ownerUserId=@ownerUserId, ownerName=@ownerName,
	       nextFollowupDate=@nextFollowupDate, nextFollowupNote=@nextFollowupNote,
	       convertedToClientAt=@convertedToClientAt,
	       influencerPlatform=@influencerPlatform, influencerHandle=@influencerHandle,
	       influencerNiche=@influencerNiche, followerCount=@followerCount,
	       engagementRate=@engagementRate, rateCardAmount=@rateCardAmount,
	       location=@location, languages=@languages, availabilityStatus=@availabilityStatus, influencerAccounts=@influencerAccounts,
	       customFields=@customFields,
	       visibility=@visibility, updatedAt=@now
       WHERE id=@id`,
    ).run({
      id,
      kind: updates.kind ?? existing.kind,
      name: updates.name ?? existing.name,
      legalName: updates.legalName ?? existing.legalName ?? null,
      contactPerson: updates.contactPerson ?? existing.contactPerson ?? null,
      email: updates.email ?? existing.email ?? null,
      phone: updates.phone ?? existing.phone ?? null,
      address: updates.address ?? existing.address ?? null,
      taxNumber: updates.taxNumber ?? existing.taxNumber ?? null,
      tags: updates.tags !== undefined ? JSON.stringify(updates.tags) : (existing.tags ? JSON.stringify(existing.tags) : null),
      notes: updates.notes ?? existing.notes ?? null,
      leadStatus: updates.leadStatus !== undefined ? (updates.leadStatus ?? null) : (existing.leadStatus ?? null),
      leadSource: updates.leadSource !== undefined ? (updates.leadSource ?? null) : (existing.leadSource ?? null),
      priority: updates.priority !== undefined ? (updates.priority ?? null) : (existing.priority ?? null),
      ownerUserId: updates.ownerUserId !== undefined ? (updates.ownerUserId ?? null) : (existing.ownerUserId ?? null),
      ownerName: updates.ownerName !== undefined ? (updates.ownerName ?? null) : (existing.ownerName ?? null),
      nextFollowupDate: updates.nextFollowupDate !== undefined
        ? (updates.nextFollowupDate ? updates.nextFollowupDate.toISOString() : null)
        : (existing.nextFollowupDate ? existing.nextFollowupDate.toISOString() : null),
      nextFollowupNote: updates.nextFollowupNote !== undefined ? (updates.nextFollowupNote ?? null) : (existing.nextFollowupNote ?? null),
	      convertedToClientAt: updates.convertedToClientAt !== undefined
	        ? (updates.convertedToClientAt ? updates.convertedToClientAt.toISOString() : null)
	        : (existing.convertedToClientAt ? existing.convertedToClientAt.toISOString() : null),
	      influencerPlatform: updates.influencerPlatform !== undefined ? (updates.influencerPlatform ?? null) : (existing.influencerPlatform ?? null),
	      influencerHandle: updates.influencerHandle !== undefined ? (updates.influencerHandle ?? null) : (existing.influencerHandle ?? null),
	      influencerNiche: updates.influencerNiche !== undefined ? (updates.influencerNiche ?? null) : (existing.influencerNiche ?? null),
	      followerCount: updates.followerCount !== undefined ? (updates.followerCount ?? null) : (existing.followerCount ?? null),
	      engagementRate: updates.engagementRate !== undefined ? (updates.engagementRate ?? null) : (existing.engagementRate ?? null),
	      rateCardAmount: updates.rateCardAmount !== undefined ? (updates.rateCardAmount ?? null) : (existing.rateCardAmount ?? null),
	      location: updates.location !== undefined ? (updates.location ?? null) : (existing.location ?? null),
	      languages: updates.languages !== undefined
	        ? (updates.languages ? JSON.stringify(updates.languages) : null)
	        : (existing.languages ? JSON.stringify(existing.languages) : null),
	      availabilityStatus: updates.availabilityStatus !== undefined ? (updates.availabilityStatus ?? null) : (existing.availabilityStatus ?? null),
	      influencerAccounts: updates.influencerAccounts !== undefined ? (updates.influencerAccounts ? JSON.stringify(updates.influencerAccounts) : null) : (existing.influencerAccounts ? JSON.stringify(existing.influencerAccounts) : null),
	      customFields: (() => {
	        const merged = this.normalizeCustomFields(existing.companyId, 'contact', updates.customFields, existing.customFields);
	        return merged ? JSON.stringify(merged) : null;
	      })(),
	      // Auto-promote to Public when leadStatus becomes Won, or when explicitly set
	      visibility: (updates.leadStatus === 'Won' || updates.visibility === 'Public')
	        ? 'Public'
	        : (updates.visibility ?? existing.visibility ?? 'Public'),
	      now,
    });
    const newOwner = updates.ownerUserId;
    if (newOwner !== undefined && newOwner && newOwner !== existing.ownerUserId) {
      this.notify({
        companyId: existing.companyId,
        userIds: [newOwner],
        type: 'lead_assigned',
        title: `Assigned to you: ${updates.name ?? existing.name}`,
        body: 'You are now the owner of this contact.',
        link: `/contacts/${id}`,
        entityType: 'contact',
        entityId: id,
      });
    }
    const refreshed = this.getContactById(id)!;
    // Keep the first-class follow_ups table in sync when a manual next-follow-up
    // date is set/changed/cleared on the contact.
    if (updates.nextFollowupDate !== undefined) {
      this.syncManualContactFollowup(refreshed, updates.nextFollowupDate ?? null);
    }
    return refreshed;
  }

  /** Upsert/clear the single manual follow-up that mirrors contact.nextFollowupDate. */
  private syncManualContactFollowup(contact: Contact, date: Date | null) {
    const existing = this.db
      .prepare(
        `SELECT * FROM follow_ups WHERE companyId = ? AND entityType = 'contact' AND entityId = ?
           AND sourceTrigger IN ('manual','legacy_contact') AND status IN ('open','snoozed')
         ORDER BY createdAt DESC LIMIT 1`,
      )
      .get(contact.companyId, contact.id) as any;
    if (date) {
      if (existing) {
        this.rescheduleFollowupEntity(existing.id, date, contact.nextFollowupNote ?? undefined);
      } else {
        this.createFollowup({
          companyId: contact.companyId,
          entityType: 'contact',
          entityId: contact.id,
          title: contact.nextFollowupNote ?? undefined,
          ownerUserId: contact.ownerUserId,
          ownerName: contact.ownerName,
          dueAt: date,
          sourceTrigger: 'manual',
          sourceType: 'contact',
          sourceId: contact.id,
        });
      }
    } else if (existing) {
      this.cancelFollowup(existing.id);
    }
  }

  addContactRole(contactId: string, companyId: string, role: ContactRoleType, source: ContactRoleSource = 'Manual'): void {
    this.db.prepare(
      `INSERT OR IGNORE INTO contact_roles (id, contactId, companyId, role, source, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(uuid(), contactId, companyId, role, source, new Date().toISOString());
    // When a real business relationship is established, auto-promote to Public
    if (['Client', 'Vendor', 'Partner'].includes(role)) {
      this.db.prepare(`UPDATE contacts SET visibility = 'Public', updatedAt = ? WHERE id = ?`)
        .run(new Date().toISOString(), contactId);
    }
  }

  removeContactRole(contactId: string, role: ContactRoleType): void {
    this.db.prepare('DELETE FROM contact_roles WHERE contactId = ? AND role = ?').run(contactId, role);
  }

  /**
   * Throws a descriptive error if `id` is still referenced by any of the given
   * (table, column) pairs, so callers can block a delete gracefully instead of
   * orphaning rows or hitting a foreign-key failure.
   */
  private assertNotReferenced(
    checks: Array<{ table: string; column: string; label: string }>,
    id: string,
    entityLabel: string,
  ): void {
    const blockers: string[] = [];
    for (const check of checks) {
      const row = this.db
        .prepare(`SELECT COUNT(*) AS n FROM ${check.table} WHERE ${check.column} = ?`)
        .get(id) as { n: number } | undefined;
      const count = Number(row?.n || 0);
      if (count > 0) blockers.push(`${count} ${check.label}`);
    }
    if (blockers.length > 0) {
      throw new Error(
        `Cannot delete this ${entityLabel} because it is still referenced by ${blockers.join(
          ', ',
        )}. Remove or reassign those first.`,
      );
    }
  }

  deleteContact(id: string): void {
    this.assertNotReferenced(
      [
        { table: 'invoices', column: 'contactId', label: 'invoice(s)' },
        { table: 'opportunities', column: 'contactId', label: 'opportunity record(s)' },
        { table: 'crm_proposals', column: 'contactId', label: 'proposal(s)' },
        { table: 'campaign_assignments', column: 'contactId', label: 'campaign assignment(s)' },
        { table: 'campaign_deliverables', column: 'vendorContactId', label: 'campaign deliverable(s)' },
        { table: 'campaign_expenses', column: 'contactId', label: 'campaign expense(s)' },
      ],
      id,
      'contact',
    );
    const trx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM contact_roles WHERE contactId = ?').run(id);
      this.db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
    });
    trx();
  }

  /** Delete an invoice. Blocks if it has payments or is referenced by a credit note. */
  deleteInvoice(id: string): void {
    const invoice = this.getInvoiceById(id);
    if (!invoice) throw new Error('Invoice not found.');
    const payment = this.db.prepare('SELECT 1 FROM payments WHERE invoiceId = ? LIMIT 1').get(id);
    if (payment) {
      throw new Error('Cannot delete an invoice that has recorded payments. Reverse the payments first.');
    }
    this.assertNotReferenced(
      [{ table: 'credit_notes', column: 'invoiceId', label: 'credit note(s)' }],
      id,
      'invoice',
    );
    const trx = this.db.transaction(() => {
      this.removeJournalEntriesBySource('invoice', id);
      // Release any sales order that was invoiced from this invoice.
      this.db
        .prepare(
          "UPDATE sales_orders SET invoiceId = NULL, status = CASE WHEN status = 'Invoiced' THEN 'Confirmed' ELSE status END WHERE invoiceId = ?",
        )
        .run(id);
      // Release any campaign that pointed at this invoice, so a later sync
      // regenerates cleanly instead of chasing a dangling reference.
      this.db.prepare('UPDATE crm_campaigns SET invoiceId = NULL WHERE invoiceId = ?').run(id);
      this.db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
    });
    trx();
  }

  /** Delete a sales order. Blocks once it has been invoiced or has deliveries. */
  deleteSalesOrder(id: string): void {
    const order = this.getSalesOrderById(id);
    if (!order) throw new Error('Sales order not found.');
    if (order.invoiceId || order.status === 'Invoiced') {
      throw new Error('Cannot delete a sales order that has been invoiced. Delete the invoice first.');
    }
    const delivery = this.db.prepare('SELECT 1 FROM deliveries WHERE salesOrderId = ? LIMIT 1').get(id);
    if (delivery) {
      throw new Error('Cannot delete a sales order that has recorded deliveries.');
    }
    this.db.prepare('DELETE FROM sales_orders WHERE id = ?').run(id);
  }

  /** Delete a purchase order. Blocks if it has a vendor bill or received stock. */
  deletePurchaseOrder(id: string): void {
    const order = this.getPurchaseOrderById(id);
    if (!order) throw new Error('Purchase order not found.');
    const bill = this.db.prepare('SELECT 1 FROM vendor_bills WHERE purchaseOrderId = ? LIMIT 1').get(id);
    if (bill) {
      throw new Error('Cannot delete a purchase order that is linked to a vendor bill. Delete the vendor bill first.');
    }
    const receipt = this.db.prepare('SELECT 1 FROM purchase_receipts WHERE purchaseOrderId = ? LIMIT 1').get(id);
    if (receipt || order.status === 'Received' || order.status === 'Partially Received') {
      throw new Error('Cannot delete a purchase order that has received stock.');
    }
    this.db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(id);
  }

  /** Delete a vendor bill. Blocks if it has payments; otherwise reverses its journal entries. */
  deleteVendorBill(id: string): void {
    const bill = this.getVendorBillById(id);
    if (!bill) throw new Error('Vendor bill not found.');
    const payment = this.db.prepare('SELECT 1 FROM vendor_bill_payments WHERE billId = ? LIMIT 1').get(id);
    if (payment) {
      throw new Error('Cannot delete a vendor bill that has recorded payments. Reverse the payments first.');
    }
    const trx = this.db.transaction(() => {
      this.removeJournalEntriesBySource('vendor_bill', id);
      this.db.prepare('DELETE FROM vendor_bills WHERE id = ?').run(id);
    });
    trx();
  }

  /** Delete a credit note, reversing its journal entries. */
  deleteCreditNote(id: string): void {
    const note = this.getCreditNoteById(id);
    if (!note) throw new Error('Credit note not found.');
    const trx = this.db.transaction(() => {
      this.removeJournalEntriesBySource('credit_note', id);
      this.db.prepare('DELETE FROM credit_notes WHERE id = ?').run(id);
    });
    trx();
  }

  /** Delete an inventory item. Blocks if it holds stock or has movement history. */
  deleteInventoryItem(id: string): void {
    const item = this.getInventoryItemById(id);
    if (!item) throw new Error('Inventory item not found.');
    if (Number(item.onHand || 0) !== 0) {
      throw new Error('Cannot delete an item that still has stock on hand. Adjust the quantity to zero first.');
    }
    const moved = this.db.prepare('SELECT 1 FROM stock_movements WHERE inventoryItemId = ? LIMIT 1').get(id);
    if (moved) {
      throw new Error('Cannot delete an item that has stock movement history. It must be kept for audit; stop tracking it instead.');
    }
    const trx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM inventory_location_balances WHERE inventoryItemId = ?').run(id);
      this.db.prepare('DELETE FROM inventory_items WHERE id = ?').run(id);
    });
    trx();
  }

  /** Delete a single task, cascading its comments and time entries; subtasks are detached. */
  deleteTask(id: string): void {
    const task = this.getTaskById(id);
    if (!task) throw new Error('Task not found.');
    const trx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM time_entries WHERE taskId = ?').run(id);
      this.db.prepare('DELETE FROM comments WHERE taskId = ?').run(id);
      this.db.prepare('UPDATE tasks SET parentTaskId = NULL WHERE parentTaskId = ?').run(id);
      this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    });
    trx();
  }

  // ─── HR: departments ───────────────────────────────────────────────────────
  private decodeDepartment(row: any): Department {
    return { id: row.id, companyId: row.companyId, name: row.name, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) };
  }

  listDepartments(companyId: string): Department[] {
    return (this.db.prepare('SELECT * FROM departments WHERE companyId = ? ORDER BY name ASC').all(companyId) as any[]).map((r) => this.decodeDepartment(r));
  }

  getDepartmentById(id: string): Department | undefined {
    const row = this.db.prepare('SELECT * FROM departments WHERE id = ?').get(id) as any;
    return row ? this.decodeDepartment(row) : undefined;
  }

  createDepartment(input: { companyId: string; name: string }): Department {
    const now = new Date().toISOString();
    const dept = { id: uuid(), companyId: input.companyId, name: input.name, createdAt: now, updatedAt: now };
    this.db.prepare('INSERT INTO departments (id, companyId, name, createdAt, updatedAt) VALUES (@id, @companyId, @name, @createdAt, @updatedAt)').run(dept);
    return this.getDepartmentById(dept.id)!;
  }

  updateDepartment(id: string, updates: { name?: string }): Department | undefined {
    const existing = this.getDepartmentById(id);
    if (!existing) return undefined;
    this.db.prepare('UPDATE departments SET name = ?, updatedAt = ? WHERE id = ?').run(updates.name ?? existing.name, new Date().toISOString(), id);
    return this.getDepartmentById(id);
  }

  deleteDepartment(id: string): void {
    if (!this.getDepartmentById(id)) throw new Error('Department not found.');
    this.assertNotReferenced([{ table: 'employees', column: 'departmentId', label: 'employee(s)' }], id, 'department');
    this.db.prepare('DELETE FROM departments WHERE id = ?').run(id);
  }

  // ─── HR: employees ─────────────────────────────────────────────────────────
  private decodeEmployee(row: any): Employee {
    return {
      id: row.id,
      companyId: row.companyId,
      userId: row.userId ?? undefined,
      name: row.name,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      jobTitle: row.jobTitle ?? undefined,
      departmentId: row.departmentId ?? undefined,
      managerId: row.managerId ?? undefined,
      employmentType: row.employmentType ?? undefined,
      status: row.status,
      hireDate: row.hireDate ? new Date(row.hireDate) : undefined,
      endDate: row.endDate ? new Date(row.endDate) : undefined,
      annualLeaveAllowance: Number(row.annualLeaveAllowance ?? 0),
      notes: row.notes ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  listEmployees(companyId: string): Employee[] {
    return (this.db.prepare('SELECT * FROM employees WHERE companyId = ? ORDER BY name ASC').all(companyId) as any[]).map((r) => this.decodeEmployee(r));
  }

  getEmployeeById(id: string): Employee | undefined {
    const row = this.db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as any;
    return row ? this.decodeEmployee(row) : undefined;
  }

  createEmployee(input: CreateEmployeeInput): Employee {
    const now = new Date().toISOString();
    const row = {
      id: uuid(),
      companyId: input.companyId,
      userId: input.userId ?? null,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      jobTitle: input.jobTitle ?? null,
      departmentId: input.departmentId ?? null,
      managerId: input.managerId ?? null,
      employmentType: input.employmentType ?? null,
      status: input.status ?? 'Active',
      hireDate: input.hireDate ? new Date(input.hireDate).toISOString() : null,
      endDate: input.endDate ? new Date(input.endDate).toISOString() : null,
      annualLeaveAllowance: input.annualLeaveAllowance ?? 21,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO employees (id, companyId, userId, name, email, phone, jobTitle, departmentId, managerId, employmentType, status, hireDate, endDate, annualLeaveAllowance, notes, createdAt, updatedAt)
         VALUES (@id, @companyId, @userId, @name, @email, @phone, @jobTitle, @departmentId, @managerId, @employmentType, @status, @hireDate, @endDate, @annualLeaveAllowance, @notes, @createdAt, @updatedAt)`,
      )
      .run(row);
    return this.getEmployeeById(row.id)!;
  }

  updateEmployee(id: string, updates: UpdateEmployeeInput): Employee | undefined {
    const e = this.getEmployeeById(id);
    if (!e) return undefined;
    const merged = { ...e, ...updates };
    this.db
      .prepare(
        `UPDATE employees SET userId=@userId, name=@name, email=@email, phone=@phone, jobTitle=@jobTitle, departmentId=@departmentId, managerId=@managerId, employmentType=@employmentType, status=@status, hireDate=@hireDate, endDate=@endDate, annualLeaveAllowance=@annualLeaveAllowance, notes=@notes, updatedAt=@updatedAt WHERE id=@id`,
      )
      .run({
        id,
        userId: merged.userId ?? null,
        name: merged.name,
        email: merged.email ?? null,
        phone: merged.phone ?? null,
        jobTitle: merged.jobTitle ?? null,
        departmentId: merged.departmentId ?? null,
        managerId: merged.managerId ?? null,
        employmentType: merged.employmentType ?? null,
        status: merged.status,
        hireDate: merged.hireDate ? new Date(merged.hireDate).toISOString() : null,
        endDate: merged.endDate ? new Date(merged.endDate).toISOString() : null,
        annualLeaveAllowance: merged.annualLeaveAllowance ?? 21,
        notes: merged.notes ?? null,
        updatedAt: new Date().toISOString(),
      });
    return this.getEmployeeById(id);
  }

  /** Delete an employee, cascading their leave requests and detaching direct reports. */
  deleteEmployee(id: string): void {
    if (!this.getEmployeeById(id)) throw new Error('Employee not found.');
    const trx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM leave_requests WHERE employeeId = ?').run(id);
      this.db.prepare('UPDATE employees SET managerId = NULL WHERE managerId = ?').run(id);
      this.db.prepare('DELETE FROM employees WHERE id = ?').run(id);
    });
    trx();
  }

  // ─── HR: leave types ───────────────────────────────────────────────────────
  private decodeLeaveType(row: any): LeaveType {
    return { id: row.id, companyId: row.companyId, name: row.name, paid: Boolean(row.paid), createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) };
  }

  listLeaveTypes(companyId: string): LeaveType[] {
    return (this.db.prepare('SELECT * FROM leave_types WHERE companyId = ? ORDER BY name ASC').all(companyId) as any[]).map((r) => this.decodeLeaveType(r));
  }

  getLeaveTypeById(id: string): LeaveType | undefined {
    const row = this.db.prepare('SELECT * FROM leave_types WHERE id = ?').get(id) as any;
    return row ? this.decodeLeaveType(row) : undefined;
  }

  createLeaveType(input: { companyId: string; name: string; paid?: boolean }): LeaveType {
    const now = new Date().toISOString();
    const row = { id: uuid(), companyId: input.companyId, name: input.name, paid: input.paid === false ? 0 : 1, createdAt: now, updatedAt: now };
    this.db.prepare('INSERT INTO leave_types (id, companyId, name, paid, createdAt, updatedAt) VALUES (@id, @companyId, @name, @paid, @createdAt, @updatedAt)').run(row);
    return this.getLeaveTypeById(row.id)!;
  }

  updateLeaveType(id: string, updates: { name?: string; paid?: boolean }): LeaveType | undefined {
    const existing = this.getLeaveTypeById(id);
    if (!existing) return undefined;
    const paid = updates.paid === undefined ? (existing.paid ? 1 : 0) : updates.paid ? 1 : 0;
    this.db.prepare('UPDATE leave_types SET name = ?, paid = ?, updatedAt = ? WHERE id = ?').run(updates.name ?? existing.name, paid, new Date().toISOString(), id);
    return this.getLeaveTypeById(id);
  }

  deleteLeaveType(id: string): void {
    if (!this.getLeaveTypeById(id)) throw new Error('Leave type not found.');
    this.assertNotReferenced([{ table: 'leave_requests', column: 'leaveTypeId', label: 'leave request(s)' }], id, 'leave type');
    this.db.prepare('DELETE FROM leave_types WHERE id = ?').run(id);
  }

  // ─── HR: leave requests ────────────────────────────────────────────────────
  private decodeLeaveRequest(row: any): LeaveRequest {
    return {
      id: row.id,
      companyId: row.companyId,
      employeeId: row.employeeId,
      leaveTypeId: row.leaveTypeId ?? undefined,
      startDate: new Date(row.startDate),
      endDate: new Date(row.endDate),
      days: Number(row.days ?? 0),
      reason: row.reason ?? undefined,
      status: row.status,
      reviewedByUserId: row.reviewedByUserId ?? undefined,
      reviewedByName: row.reviewedByName ?? undefined,
      reviewedAt: row.reviewedAt ? new Date(row.reviewedAt) : undefined,
      reviewNote: row.reviewNote ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  listLeaveRequests(companyId: string, filters?: { status?: string; employeeId?: string }): LeaveRequest[] {
    let sql = 'SELECT * FROM leave_requests WHERE companyId = ?';
    const params: any[] = [companyId];
    if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status); }
    if (filters?.employeeId) { sql += ' AND employeeId = ?'; params.push(filters.employeeId); }
    sql += ' ORDER BY startDate DESC';
    return (this.db.prepare(sql).all(...params) as any[]).map((r) => this.decodeLeaveRequest(r));
  }

  getLeaveRequestById(id: string): LeaveRequest | undefined {
    const row = this.db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id) as any;
    return row ? this.decodeLeaveRequest(row) : undefined;
  }

  /** Inclusive whole-day count between two dates. */
  private leaveDayCount(start: Date, end: Date): number {
    const ms = new Date(end).setHours(0, 0, 0, 0) - new Date(start).setHours(0, 0, 0, 0);
    return Math.max(1, Math.round(ms / 86400000) + 1);
  }

  createLeaveRequest(input: {
    companyId: string;
    employeeId: string;
    leaveTypeId?: string | null;
    startDate: Date | string;
    endDate: Date | string;
    days?: number;
    reason?: string | null;
    status?: LeaveRequest['status'];
  }): LeaveRequest {
    const employee = this.getEmployeeById(input.employeeId);
    if (!employee || employee.companyId !== input.companyId) {
      throw new Error('Leave request employee must belong to the selected company.');
    }
    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    if (end < start) throw new Error('Leave end date cannot be before the start date.');
    const now = new Date().toISOString();
    const row = {
      id: uuid(),
      companyId: input.companyId,
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId ?? null,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      days: input.days && input.days > 0 ? Number(input.days) : this.leaveDayCount(start, end),
      reason: input.reason ?? null,
      status: input.status ?? 'Pending',
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO leave_requests (id, companyId, employeeId, leaveTypeId, startDate, endDate, days, reason, status, createdAt, updatedAt)
         VALUES (@id, @companyId, @employeeId, @leaveTypeId, @startDate, @endDate, @days, @reason, @status, @createdAt, @updatedAt)`,
      )
      .run(row);
    return this.getLeaveRequestById(row.id)!;
  }

  setLeaveRequestStatus(
    id: string,
    status: LeaveRequest['status'],
    reviewer?: { userId?: string; name?: string },
    note?: string,
  ): LeaveRequest | undefined {
    const existing = this.getLeaveRequestById(id);
    if (!existing) return undefined;
    this.db
      .prepare(
        `UPDATE leave_requests SET status = ?, reviewedByUserId = ?, reviewedByName = ?, reviewedAt = ?, reviewNote = ?, updatedAt = ? WHERE id = ?`,
      )
      .run(
        status,
        reviewer?.userId ?? null,
        reviewer?.name ?? null,
        new Date().toISOString(),
        note ?? existing.reviewNote ?? null,
        new Date().toISOString(),
        id,
      );
    return this.getLeaveRequestById(id);
  }

  deleteLeaveRequest(id: string): void {
    if (!this.getLeaveRequestById(id)) throw new Error('Leave request not found.');
    this.db.prepare('DELETE FROM leave_requests WHERE id = ?').run(id);
  }

  /** Paid-leave balance for an employee in a given year (defaults to current year). */
  getLeaveBalance(employeeId: string, year?: number): LeaveBalance {
    const employee = this.getEmployeeById(employeeId);
    const allowance = employee?.annualLeaveAllowance ?? 0;
    const targetYear = year ?? new Date().getFullYear();
    const rows = this.db
      .prepare(
        `SELECT lr.status AS status, lr.days AS days, lr.startDate AS startDate, COALESCE(lt.paid, 1) AS paid
         FROM leave_requests lr LEFT JOIN leave_types lt ON lt.id = lr.leaveTypeId
         WHERE lr.employeeId = ?`,
      )
      .all(employeeId) as any[];
    let used = 0;
    let pending = 0;
    for (const r of rows) {
      if (new Date(r.startDate).getFullYear() !== targetYear) continue;
      if (Number(r.paid) !== 1) continue;
      if (r.status === 'Approved') used += Number(r.days || 0);
      else if (r.status === 'Pending') pending += Number(r.days || 0);
    }
    return { employeeId, year: targetYear, allowance, used, pending, remaining: allowance - used };
  }

  listContactRoles(contactId: string): ContactRole[] {
    return (this.db.prepare('SELECT * FROM contact_roles WHERE contactId = ?').all(contactId) as any[]).map((r) => ({
      id: r.id,
      contactId: r.contactId,
      companyId: r.companyId,
      role: r.role as ContactRoleType,
      source: r.source as ContactRoleSource,
      createdAt: new Date(r.createdAt),
    }));
  }

  private decodeContact(row: any): Contact {
    return {
      id: row.id,
      companyId: row.companyId,
      kind: row.kind as 'Organization' | 'Person',
      name: row.name,
      legalName: row.legalName ?? undefined,
      contactPerson: row.contactPerson ?? undefined,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      address: row.address ?? undefined,
      taxNumber: row.taxNumber ?? undefined,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      notes: row.notes ?? undefined,
      roles: row.roleList ? (row.roleList as string).split(',').filter(Boolean) as ContactRoleType[] : [],
      clientId: row.clientId ?? undefined,
      supplierId: row.supplierId ?? undefined,
      leadStatus: row.leadStatus ?? undefined,
      leadSource: row.leadSource ?? undefined,
      priority: row.priority ?? undefined,
      ownerUserId: row.ownerUserId ?? undefined,
      ownerName: row.ownerName ?? undefined,
      nextFollowupDate: row.nextFollowupDate ? new Date(row.nextFollowupDate) : undefined,
      nextFollowupNote: row.nextFollowupNote ?? undefined,
	      convertedToClientAt: row.convertedToClientAt ? new Date(row.convertedToClientAt) : undefined,
	      influencerPlatform: row.influencerPlatform ?? undefined,
	      influencerHandle: row.influencerHandle ?? undefined,
	      influencerNiche: row.influencerNiche ?? undefined,
	      followerCount: row.followerCount === null || row.followerCount === undefined ? undefined : Number(row.followerCount),
	      engagementRate: row.engagementRate === null || row.engagementRate === undefined ? undefined : Number(row.engagementRate),
	      rateCardAmount: row.rateCardAmount === null || row.rateCardAmount === undefined ? undefined : Number(row.rateCardAmount),
	      location: row.location ?? undefined,
	      languages: row.languages ? this.parseJson<string[]>(row.languages) : undefined,
	      availabilityStatus: row.availabilityStatus ?? undefined,
	      influencerAccounts: row.influencerAccounts ? this.parseJson<InfluencerAccount[]>(row.influencerAccounts) : undefined,
	      visibility: (row.visibility as 'Public' | 'Private') ?? 'Public',
	      customFields: row.customFields ? this.parseJson<Record<string, unknown>>(row.customFields) ?? undefined : undefined,
	      createdAt: new Date(row.createdAt),
	      updatedAt: new Date(row.updatedAt),
	    };
	  }

  // ─── Custom Field Definitions ───────────────────────────────────────────

  private decodeCustomFieldDefinition(row: any): CustomFieldDefinition {
    return {
      id: row.id,
      companyId: row.companyId,
      entityType: row.entityType as CustomFieldEntityType,
      key: row.key,
      label: row.label,
      fieldType: row.fieldType as CustomFieldType,
      options: row.options ? this.parseJson<string[]>(row.options) ?? undefined : undefined,
      required: Boolean(row.required),
      sortOrder: Number(row.sortOrder) || 0,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  listCustomFieldDefinitions(companyId: string, entityType?: CustomFieldEntityType): CustomFieldDefinition[] {
    const rows = entityType
      ? (this.db
          .prepare('SELECT * FROM custom_field_definitions WHERE companyId = ? AND entityType = ? ORDER BY sortOrder, createdAt')
          .all(companyId, entityType) as any[])
      : (this.db
          .prepare('SELECT * FROM custom_field_definitions WHERE companyId = ? ORDER BY entityType, sortOrder, createdAt')
          .all(companyId) as any[]);
    return rows.map((row) => this.decodeCustomFieldDefinition(row));
  }

  getCustomFieldDefinitionById(id: string): CustomFieldDefinition | undefined {
    const row = this.db.prepare('SELECT * FROM custom_field_definitions WHERE id = ?').get(id) as any;
    return row ? this.decodeCustomFieldDefinition(row) : undefined;
  }

  private slugifyCustomFieldKey(label: string): string {
    return String(label)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'field';
  }

  createCustomFieldDefinition(input: {
    companyId: string;
    entityType: CustomFieldEntityType;
    label: string;
    fieldType: CustomFieldType;
    key?: string;
    options?: string[];
    required?: boolean;
    sortOrder?: number;
  }): CustomFieldDefinition {
    const label = String(input.label || '').trim();
    if (!label) throw new Error('Custom field label is required.');
    if (!customFieldTypes.includes(input.fieldType)) {
      throw new Error('Invalid custom field type.');
    }
    const options =
      input.fieldType === 'select'
        ? (input.options || []).map((o) => String(o).trim()).filter(Boolean)
        : undefined;
    if (input.fieldType === 'select' && (!options || options.length === 0)) {
      throw new Error('A select field requires at least one option.');
    }

    // Derive a unique key within (company, entity).
    const base = input.key ? this.slugifyCustomFieldKey(input.key) : this.slugifyCustomFieldKey(label);
    let key = base;
    let suffix = 2;
    while (
      this.db
        .prepare('SELECT 1 FROM custom_field_definitions WHERE companyId = ? AND entityType = ? AND key = ? LIMIT 1')
        .get(input.companyId, input.entityType, key)
    ) {
      key = `${base}_${suffix++}`;
    }

    const now = new Date().toISOString();
    const def: CustomFieldDefinition = {
      id: uuid(),
      companyId: input.companyId,
      entityType: input.entityType,
      key,
      label,
      fieldType: input.fieldType,
      options,
      required: Boolean(input.required),
      sortOrder: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
    this.db
      .prepare(
        'INSERT INTO custom_field_definitions (id, companyId, entityType, key, label, fieldType, options, required, sortOrder, createdAt, updatedAt) VALUES (@id, @companyId, @entityType, @key, @label, @fieldType, @options, @required, @sortOrder, @createdAt, @updatedAt)',
      )
      .run({
        ...def,
        options: def.options ? JSON.stringify(def.options) : null,
        required: def.required ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      });
    return def;
  }

  updateCustomFieldDefinition(
    id: string,
    updates: { label?: string; options?: string[]; required?: boolean; sortOrder?: number },
  ): CustomFieldDefinition | undefined {
    const existing = this.getCustomFieldDefinitionById(id);
    if (!existing) return undefined;
    const label = updates.label === undefined ? existing.label : String(updates.label).trim();
    if (!label) throw new Error('Custom field label is required.');
    const options =
      existing.fieldType === 'select'
        ? (updates.options === undefined ? existing.options : updates.options.map((o) => String(o).trim()).filter(Boolean))
        : undefined;
    if (existing.fieldType === 'select' && (!options || options.length === 0)) {
      throw new Error('A select field requires at least one option.');
    }
    const required = updates.required === undefined ? existing.required : Boolean(updates.required);
    const sortOrder = updates.sortOrder === undefined ? existing.sortOrder : Number(updates.sortOrder) || 0;
    const now = new Date().toISOString();
    this.db
      .prepare(
        'UPDATE custom_field_definitions SET label = ?, options = ?, required = ?, sortOrder = ?, updatedAt = ? WHERE id = ?',
      )
      .run(label, options ? JSON.stringify(options) : null, required ? 1 : 0, sortOrder, now, id);
    return this.getCustomFieldDefinitionById(id);
  }

  deleteCustomFieldDefinition(id: string): boolean {
    const result = this.db.prepare('DELETE FROM custom_field_definitions WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Validate and coerce a raw customFields map against the definitions for an
   * entity. Unknown keys are dropped; required fields are enforced; values are
   * coerced to the field's type. Returns the cleaned map (or undefined if empty).
   */
  private normalizeCustomFields(
    companyId: string,
    entityType: CustomFieldEntityType,
    raw: unknown,
    existing?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const defs = this.listCustomFieldDefinitions(companyId, entityType);
    if (defs.length === 0) return existing;
    const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const provided = raw && typeof raw === 'object';
    const result: Record<string, unknown> = {};
    for (const def of defs) {
      // When no map was provided at all, keep any existing stored value.
      const hasIncoming = provided && Object.prototype.hasOwnProperty.call(input, def.key);
      let value = hasIncoming ? input[def.key] : existing?.[def.key];

      if (value === undefined || value === null || value === '') {
        if (def.required) {
          throw new Error(`Custom field "${def.label}" is required.`);
        }
        continue;
      }

      switch (def.fieldType) {
        case 'number': {
          const num = Number(value);
          if (!Number.isFinite(num)) throw new Error(`Custom field "${def.label}" must be a number.`);
          value = num;
          break;
        }
        case 'boolean': {
          value = value === true || value === 'true' || value === 1 || value === '1';
          break;
        }
        case 'date': {
          const d = new Date(String(value));
          if (Number.isNaN(d.getTime())) throw new Error(`Custom field "${def.label}" must be a valid date.`);
          value = d.toISOString();
          break;
        }
        case 'select': {
          const str = String(value);
          if (def.options && !def.options.includes(str)) {
            throw new Error(`Custom field "${def.label}" must be one of: ${def.options.join(', ')}.`);
          }
          value = str;
          break;
        }
        default:
          value = String(value);
      }
      result[def.key] = value;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

	  // ─── CRM Pipeline / Vendor Requests / Commissions ───────────────────────

		  listOpportunities(companyId: string): Opportunity[] {
		    const rows = this.db
		      .prepare('SELECT * FROM opportunities WHERE companyId = ? ORDER BY updatedAt DESC')
		      .all(companyId) as any[];
		    return rows.map((row) => this.decodeOpportunity(row));
		  }

		  getCrmDashboardSummary(companyId: string, ownerUserId?: string): CrmDashboardSummary {
		    const contacts = this.listContacts(companyId).filter((contact) => !ownerUserId || contact.ownerUserId === ownerUserId);
		    const opportunities = this.listOpportunities(companyId).filter((opportunity) => !ownerUserId || opportunity.ownerUserId === ownerUserId);
		    const tasks = this.listTasks().filter((task) => {
		      if (task.companyId !== companyId) return false;
		      if (!ownerUserId) return true;
		      return (task.assignedUserIds || []).includes(ownerUserId);
		    });
		    const followups = this.listFollowups(companyId, { ownerUserId, limit: 500 });
		    const vendorRequests = this.listVendorRequests(companyId).filter((request) => !ownerUserId || request.requestedByUserId === ownerUserId);
		    const commissions = this.listCommissions(companyId).filter((commission) => !ownerUserId || commission.userId === ownerUserId);
		    const now = new Date();

		    const openStages: OpportunityStage[] = ['New', 'Qualified', 'Proposal', 'Negotiation'];
		    const openStatuses = new Set(['To Do', 'In Progress']);
		    const openVendorStatuses: VendorRequestStatus[] = ['New', 'Under Review'];

		    const leadStatusCounts = new Map<LeadStatus | 'Unspecified', number>();
		    contacts.forEach((contact) => {
		      const status = contact.leadStatus ?? 'Unspecified';
		      leadStatusCounts.set(status, (leadStatusCounts.get(status) || 0) + 1);
		    });

		    const stageCounts = new Map<OpportunityStage, { count: number; value: number }>();
		    opportunities.forEach((opportunity) => {
		      const current = stageCounts.get(opportunity.stage) || { count: 0, value: 0 };
		      current.count += 1;
		      current.value += opportunity.expectedRevenue;
		      stageCounts.set(opportunity.stage, current);
		    });

		    const upcomingFollowups = contacts
		      .filter((contact) => contact.nextFollowupDate)
		      .sort((a, b) => a.nextFollowupDate!.getTime() - b.nextFollowupDate!.getTime())
		      .slice(0, 6)
		      .map((contact) => ({
		        id: contact.id,
		        contactId: contact.id,
		        contactName: contact.name,
		        nextFollowupDate: contact.nextFollowupDate!,
		        nextFollowupNote: contact.nextFollowupNote,
		        ownerName: contact.ownerName,
		      }));

		    return {
		      companyId,
		      ownerUserId,
		      activeContacts: contacts.length,
		      activeClients: contacts.filter((contact) => contact.roles?.includes('Client')).length,
		      openLeads: contacts.filter((contact) => contact.roles?.includes('Lead') && !['Won', 'Lost', 'Archived'].includes(contact.leadStatus || '')).length,
		      wonDeals: opportunities.filter((opportunity) => opportunity.stage === 'Won').length,
		      lostDeals: opportunities.filter((opportunity) => opportunity.stage === 'Lost').length,
		      openOpportunities: opportunities.filter((opportunity) => openStages.includes(opportunity.stage)).length,
		      openOpportunityValue: opportunities
		        .filter((opportunity) => openStages.includes(opportunity.stage))
		        .reduce((sum, opportunity) => sum + opportunity.expectedRevenue, 0),
		      forecastValue: opportunities
		        .filter((opportunity) => openStages.includes(opportunity.stage))
		        .reduce((sum, opportunity) => sum + opportunity.expectedRevenue * (opportunity.probability / 100), 0),
		      wonRevenue: opportunities
		        .filter((opportunity) => opportunity.stage === 'Won')
		        .reduce((sum, opportunity) => sum + opportunity.expectedRevenue, 0),
		      openTasks: tasks.filter((task) => openStatuses.has(task.status)).length,
		      openFollowups: followups.length,
		      overdueFollowups: followups.filter((followup) => followup.nextActionDueDate && followup.nextActionDueDate < now).length,
		      openVendorRequests: vendorRequests.filter((request) => openVendorStatuses.includes(request.status)).length,
		      commissionDraft: commissions
		        .filter((commission) => commission.status === 'Draft')
		        .reduce((sum, commission) => sum + commission.amount, 0),
		      commissionApproved: commissions
		        .filter((commission) => commission.status === 'Approved')
		        .reduce((sum, commission) => sum + commission.amount, 0),
		      leadsByStatus: Array.from(leadStatusCounts.entries()).map(([status, count]) => ({ status, count })),
		      opportunitiesByStage: Array.from(stageCounts.entries()).map(([stage, value]) => ({ stage, ...value })),
		      upcomingFollowups,
		    };
		  }

		  /**
   * Period-aware per-user performance snapshot. Returns the same shape as
   * the leaderboard expects, computed in a single pass over the
   * relevant tables. Replaces the old N+1 by-user re-scan.
   */
  getCompanyPerformance(
    companyId: string,
    options: { from?: Date; to?: Date } = {},
  ): Array<{
    userId: string;
    userName: string;
    role: string;
    openLeads: number;
    wonDeals: number;
    lostDeals: number;
    wonRevenue: number;
    collectedRevenue: number;
    openOpportunities: number;
    openOpportunityValue: number;
    openFollowups: number;
    overdueFollowups: number;
    openTasks: number;
    commissionDraft: number;
    commissionApproved: number;
    conversionRate: number;
  }> {
    const users = this.getUsersByCompany(companyId);
    const opportunities = this.listOpportunities(companyId);
    const contacts = this.listContacts(companyId);
    const followups = this.listFollowups(companyId, { limit: 5000 });
    const commissions = this.listCommissions(companyId);
    const tasks = this.listTasks().filter((t) => t.companyId === companyId);
    const invoices = this.listInvoices(companyId);
    const now = new Date();
    const from = options.from;
    const to = options.to;

    const inPeriod = (d?: Date) => {
      if (!d) return !from && !to;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    };

    const openStages = new Set<OpportunityStage>(['New', 'Qualified', 'Proposal', 'Negotiation']);

    return users.map((user) => {
      const userOpps = opportunities.filter((o) => o.ownerUserId === user.id);
      const userContacts = contacts.filter((c) => c.ownerUserId === user.id);
      const userTasks = tasks.filter((t) => (t.assignedUserIds || []).includes(user.id));
      const userFollowups = followups.filter((f) => f.actorUserId === user.id);
      const userCommissions = commissions.filter((c) => c.userId === user.id);

      const periodWon = userOpps.filter((o) => o.stage === 'Won' && inPeriod(o.closedAt));
      const periodLost = userOpps.filter((o) => o.stage === 'Lost' && inPeriod(o.closedAt));
      const periodOpenOpps = userOpps.filter((o) => openStages.has(o.stage));
      const periodOpenLeads = userContacts.filter(
        (c) =>
          (c.roles || []).includes('Lead') &&
          !['Won', 'Lost', 'Archived'].includes(c.leadStatus || ''),
      );

      // Collected revenue: sum of payments on invoices linked to this user's
      // won opportunities, restricted to the period.
      let collectedRevenue = 0;
      userOpps
        .filter((o) => o.stage === 'Won' && o.wonSalesOrderId)
        .forEach((o) => {
          const so = this.getSalesOrderById(o.wonSalesOrderId!);
          if (!so?.invoiceId) return;
          const invoice = invoices.find((i) => i.id === so.invoiceId);
          if (!invoice) return;
          const payments = this.listPayments(invoice.id);
          payments
            .filter((p) => inPeriod(p.paidAt))
            .forEach((p) => {
              collectedRevenue += p.amount;
            });
        });

      const closedTotal = periodWon.length + periodLost.length;
      const conversionRate =
        closedTotal > 0 ? Math.round((periodWon.length / closedTotal) * 100) : 0;

      return {
        userId: user.id,
        userName: user.name,
        role: user.role,
        openLeads: periodOpenLeads.length,
        wonDeals: periodWon.length,
        lostDeals: periodLost.length,
        wonRevenue: periodWon.reduce((s, o) => s + (o.expectedRevenue || 0), 0),
        collectedRevenue,
        openOpportunities: periodOpenOpps.length,
        openOpportunityValue: periodOpenOpps.reduce((s, o) => s + (o.expectedRevenue || 0), 0),
        openFollowups: userFollowups.length,
        overdueFollowups: userFollowups.filter(
          (f) => f.nextActionDueDate && f.nextActionDueDate < now,
        ).length,
        openTasks: userTasks.filter((t) => t.status === 'To Do' || t.status === 'In Progress').length,
        commissionDraft: userCommissions
          .filter((c) => c.status === 'Draft' && inPeriod(c.calculatedAt))
          .reduce((s, c) => s + c.amount, 0),
        commissionApproved: userCommissions
          .filter((c) => c.status === 'Approved' && inPeriod(c.calculatedAt))
          .reduce((s, c) => s + c.amount, 0),
        conversionRate,
      };
    });
  }

  getOpportunityById(id: string): Opportunity | undefined {
	    const row = this.db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id) as any;
	    return row ? this.decodeOpportunity(row) : undefined;
	  }

	  createOpportunity(input: CreateOpportunityInput): Opportunity {
	    const contact = this.getContactById(input.contactId);
	    if (!contact || contact.companyId !== input.companyId) {
	      throw new Error('Opportunity contact must belong to the selected company.');
	    }
	    const now = new Date();
	    const opportunity: Opportunity = {
	      ...input,
	      id: input.id ?? uuid(),
	      stage: input.stage ?? 'New',
	      expectedRevenue: Number(input.expectedRevenue || 0),
	      probability: Number(input.probability || 0),
	      expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : undefined,
	      createdAt: input.createdAt ? new Date(input.createdAt) : now,
	      updatedAt: input.updatedAt ? new Date(input.updatedAt) : now,
	    };
	    this.db
	      .prepare(
	        `INSERT INTO opportunities
	          (id, companyId, contactId, ownerUserId, ownerName, title, serviceType, stage,
	           expectedRevenue, probability, expectedCloseDate, notes, wonSalesOrderId, createdAt, updatedAt)
	         VALUES
	          (@id, @companyId, @contactId, @ownerUserId, @ownerName, @title, @serviceType, @stage,
	           @expectedRevenue, @probability, @expectedCloseDate, @notes, @wonSalesOrderId, @createdAt, @updatedAt)`,
	      )
	      .run({
	        ...opportunity,
	        ownerUserId: opportunity.ownerUserId ?? null,
	        ownerName: opportunity.ownerName ?? null,
	        expectedCloseDate: opportunity.expectedCloseDate ? opportunity.expectedCloseDate.toISOString() : null,
	        notes: opportunity.notes ?? null,
	        wonSalesOrderId: opportunity.wonSalesOrderId ?? null,
	        createdAt: opportunity.createdAt.toISOString(),
	        updatedAt: opportunity.updatedAt.toISOString(),
	      });
	    this.addContactRole(input.contactId, input.companyId, 'Lead', 'Manual');
	    // Auto-seed Sales contributor for commission attribution.
	    if (opportunity.ownerUserId) {
	      try {
	        this.seedDefaultContributors({
	          companyId: opportunity.companyId,
	          sourceType: 'opportunity',
	          sourceId: opportunity.id,
	          userIds: [opportunity.ownerUserId],
	          role: 'Sales',
	        });
	      } catch (error) {
	        console.error('Failed to seed Sales contributor on opportunity', error);
	      }
	    }
	    this.createActivityEvent({
	      companyId: opportunity.companyId,
	      entityType: 'opportunity',
	      entityId: opportunity.id,
	      action: 'created',
	      summary: `Opportunity ${opportunity.title} created.`,
	      metadata: { contactId: opportunity.contactId, stage: opportunity.stage },
	    });
	    return opportunity;
	  }

	  updateOpportunity(id: string, updates: UpdateOpportunityInput): Opportunity | undefined {
	    const existing = this.getOpportunityById(id);
	    if (!existing) return undefined;
	    if (updates.contactId) {
	      const contact = this.getContactById(updates.contactId);
	      if (!contact || contact.companyId !== existing.companyId) {
	        throw new Error('Opportunity contact must belong to the selected company.');
	      }
	    }
	    const opportunity: Opportunity = {
	      ...existing,
	      contactId: updates.contactId === undefined ? existing.contactId : updates.contactId,
	      ownerUserId: updates.ownerUserId === undefined ? existing.ownerUserId : updates.ownerUserId,
	      ownerName: updates.ownerName === undefined ? existing.ownerName : updates.ownerName,
	      title: updates.title === undefined ? existing.title : updates.title,
	      serviceType: updates.serviceType === undefined ? existing.serviceType : updates.serviceType,
	      stage: updates.stage === undefined ? existing.stage : updates.stage,
	      expectedRevenue: updates.expectedRevenue === undefined ? existing.expectedRevenue : Number(updates.expectedRevenue),
	      probability: updates.probability === undefined ? existing.probability : Number(updates.probability),
	      expectedCloseDate:
	        updates.expectedCloseDate === undefined
	          ? existing.expectedCloseDate
	          : updates.expectedCloseDate
	            ? new Date(updates.expectedCloseDate)
	            : undefined,
	      notes: updates.notes === undefined ? existing.notes : updates.notes,
	      wonSalesOrderId: updates.wonSalesOrderId === undefined ? existing.wonSalesOrderId : updates.wonSalesOrderId,
	      updatedAt: new Date(),
	    };
	    this.db
	      .prepare(
	        `UPDATE opportunities SET contactId=@contactId, ownerUserId=@ownerUserId, ownerName=@ownerName,
	         title=@title, serviceType=@serviceType, stage=@stage, expectedRevenue=@expectedRevenue,
	         probability=@probability, expectedCloseDate=@expectedCloseDate, notes=@notes,
	         wonSalesOrderId=@wonSalesOrderId, updatedAt=@updatedAt WHERE id=@id`,
	      )
	      .run({
	        ...opportunity,
	        ownerUserId: opportunity.ownerUserId ?? null,
	        ownerName: opportunity.ownerName ?? null,
	        expectedCloseDate: opportunity.expectedCloseDate ? opportunity.expectedCloseDate.toISOString() : null,
	        notes: opportunity.notes ?? null,
	        wonSalesOrderId: opportunity.wonSalesOrderId ?? null,
	        updatedAt: opportunity.updatedAt.toISOString(),
	      });
	    if (updates.stage && updates.stage !== existing.stage) {
	      if (updates.stage === 'Won') {
	        this.addContactRole(opportunity.contactId, opportunity.companyId, 'Client', 'Manual');
	        this.updateContact(opportunity.contactId, {
	          leadStatus: 'Won',
	          convertedToClientAt: opportunity.updatedAt,
	        });
	        this.calculateCommissionsForOpportunity(id);
	      } else if (updates.stage === 'Lost') {
	        this.updateContact(opportunity.contactId, { leadStatus: 'Lost' });
	      }
	    }
	    const result = this.getOpportunityById(id);
	    if (result) {
	      this.createActivityEvent({
	        companyId: result.companyId,
	        entityType: 'opportunity',
	        entityId: result.id,
	        action: 'updated',
	        summary: `Opportunity ${result.title} updated.`,
	        metadata: { stage: result.stage },
	      });
	    }
	    return result;
	  }

		  updateOpportunityStage(id: string, stage: OpportunityStage): Opportunity | undefined {
		    const existing = this.getOpportunityById(id);
	    if (!existing) return undefined;
	    const now = new Date().toISOString();
	    const isClosed = stage === 'Won' || stage === 'Lost' || stage === 'Cancelled';
	    const isReopened = !isClosed && existing.closedAt;
	    if (isClosed) {
	      this.db
	        .prepare('UPDATE opportunities SET stage = ?, closedAt = COALESCE(closedAt, ?), updatedAt = ? WHERE id = ?')
	        .run(stage, now, now, id);
	    } else if (isReopened) {
	      this.db
	        .prepare('UPDATE opportunities SET stage = ?, closedAt = NULL, updatedAt = ? WHERE id = ?')
	        .run(stage, now, id);
	    } else {
	      this.db.prepare('UPDATE opportunities SET stage = ?, updatedAt = ? WHERE id = ?').run(stage, now, id);
	    }
	    if (stage === 'Won') {
	      this.addContactRole(existing.contactId, existing.companyId, 'Client', 'Manual');
	      this.updateContact(existing.contactId, {
	        leadStatus: 'Won',
	        convertedToClientAt: new Date(now),
	      });
	      this.calculateCommissionsForOpportunity(id);
	      try {
	        this.scheduleAutomaticFollowup({
	          companyId: existing.companyId,
	          contactId: existing.contactId,
	          trigger: 'OppWon',
	          sourceType: 'opportunity',
	          sourceId: existing.id,
	          summary: `Opportunity won: ${existing.title} — schedule kickoff.`,
	          nextAction: 'Schedule kickoff / onboarding call.',
	          offsetDays: 2,
	          category: 'Meeting',
	        });
	      } catch (error) {
	        console.error('Failed to schedule OppWon follow-up', error);
	      }
	    } else if (stage === 'Lost') {
	      this.updateContact(existing.contactId, { leadStatus: 'Lost' });
	    } else if (stage === 'Proposal') {
	      try {
	        this.scheduleAutomaticFollowup({
	          companyId: existing.companyId,
	          contactId: existing.contactId,
	          trigger: 'OppProposal',
	          sourceType: 'opportunity',
	          sourceId: existing.id,
	          summary: `Proposal stage: ${existing.title} — confirm receipt.`,
	          nextAction: 'Confirm the client received the proposal and is reviewing.',
	          offsetDays: 3,
	          category: 'Call',
	        });
	      } catch (error) {
	        console.error('Failed to schedule OppProposal follow-up', error);
	      }
	    } else if (stage === 'Negotiation') {
	      try {
	        this.scheduleAutomaticFollowup({
	          companyId: existing.companyId,
	          contactId: existing.contactId,
	          trigger: 'OppNegotiation',
	          sourceType: 'opportunity',
	          sourceId: existing.id,
	          summary: `Negotiation stage: ${existing.title} — chase decision.`,
	          nextAction: 'Check decision status, address objections.',
	          offsetDays: 7,
	          category: 'Call',
	        });
	      } catch (error) {
	        console.error('Failed to schedule OppNegotiation follow-up', error);
	      }
	    }
	    const result = this.getOpportunityById(id);
	    if (result) {
	      this.createActivityEvent({
	        companyId: result.companyId,
	        entityType: 'opportunity',
	        entityId: result.id,
	        action: 'stage_changed',
	        summary: `Opportunity ${result.title} moved to ${result.stage}.`,
	        metadata: { stage: result.stage },
	      });
	    }
		    return result;
		  }

		  private nextProposalNumber(companyId: string): string {
		    const countRow = this.db
		      .prepare('SELECT COUNT(*) as count FROM crm_proposals WHERE companyId = ?')
		      .get(companyId) as { count: number };
		    return `PROP-${String(Number(countRow?.count || 0) + 1).padStart(5, '0')}`;
		  }

		  listCrmProposals(companyId: string): CrmProposal[] {
		    const rows = this.db
		      .prepare('SELECT * FROM crm_proposals WHERE companyId = ? ORDER BY updatedAt DESC')
		      .all(companyId) as any[];
		    return rows.map((row) => this.decodeCrmProposal(row));
		  }

		  getCrmProposalById(id: string): CrmProposal | undefined {
		    const row = this.db.prepare('SELECT * FROM crm_proposals WHERE id = ?').get(id) as any;
		    return row ? this.decodeCrmProposal(row) : undefined;
		  }

		  createCrmProposal(input: CreateCrmProposalInput): CrmProposal {
		    const opportunity = this.getOpportunityById(input.opportunityId);
		    if (!opportunity || opportunity.companyId !== input.companyId) {
		      throw new Error('Proposal opportunity must belong to the selected company.');
		    }
		    const now = new Date();
		    const items = input.items.map((item) => ({
		      description: item.description,
		      quantity: Number(item.quantity || 0),
		      unitPrice: Number(item.unitPrice || 0),
		      lineTotal: Number((Number(item.quantity || 0) * Number(item.unitPrice || 0)).toFixed(2)),
		    }));
		    const totalAmount = Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
		    const proposal: CrmProposal = {
		      ...input,
		      id: input.id ?? uuid(),
		      contactId: input.contactId ?? opportunity.contactId,
		      proposalNumber: input.proposalNumber ?? this.nextProposalNumber(input.companyId),
		      status: input.status ?? 'Draft',
		      issueDate: input.issueDate ? new Date(input.issueDate) : now,
		      validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
		      items,
		      totalAmount,
		      acceptedAt: input.acceptedAt ? new Date(input.acceptedAt) : undefined,
		      declinedAt: input.declinedAt ? new Date(input.declinedAt) : undefined,
		      createdAt: input.createdAt ? new Date(input.createdAt) : now,
		      updatedAt: input.updatedAt ? new Date(input.updatedAt) : now,
		    };
		    this.db
		      .prepare(
		        `INSERT INTO crm_proposals
		          (id, companyId, opportunityId, contactId, proposalNumber, title, status, issueDate,
		           validUntil, items, totalAmount, notes, acceptedAt, declinedAt, createdAt, updatedAt)
		         VALUES
		          (@id, @companyId, @opportunityId, @contactId, @proposalNumber, @title, @status, @issueDate,
		           @validUntil, @items, @totalAmount, @notes, @acceptedAt, @declinedAt, @createdAt, @updatedAt)`,
		      )
		      .run({
		        ...proposal,
		        issueDate: proposal.issueDate.toISOString(),
		        validUntil: proposal.validUntil ? proposal.validUntil.toISOString() : null,
		        items: JSON.stringify(proposal.items),
		        notes: proposal.notes ?? null,
		        acceptedAt: proposal.acceptedAt ? proposal.acceptedAt.toISOString() : null,
		        declinedAt: proposal.declinedAt ? proposal.declinedAt.toISOString() : null,
		        createdAt: proposal.createdAt.toISOString(),
		        updatedAt: proposal.updatedAt.toISOString(),
		      });
		    this.updateOpportunityStage(opportunity.id, 'Proposal');

		    // Auto-follow-up: chase response to the proposal.
		    try {
		      this.scheduleAutomaticFollowup({
		        companyId: proposal.companyId,
		        contactId: proposal.contactId,
		        trigger: 'ProposalSent',
		        sourceType: 'proposal',
		        sourceId: proposal.id,
		        summary: `Proposal ${proposal.proposalNumber} sent — follow up.`,
		        nextAction: `Check status of proposal ${proposal.proposalNumber}.`,
		        offsetDays: 5,
		        category: 'Email',
		      });
		    } catch (error) {
		      console.error('Failed to schedule ProposalSent follow-up', error);
		    }

		    this.createActivityEvent({
		      companyId: proposal.companyId,
		      entityType: 'proposal',
		      entityId: proposal.id,
		      action: 'created',
		      summary: `Proposal ${proposal.proposalNumber} created for ${proposal.title}.`,
		      metadata: { opportunityId: proposal.opportunityId, totalAmount: proposal.totalAmount },
		    });
		    return proposal;
		  }

		  updateCrmProposalStatus(id: string, status: ProposalStatus): CrmProposal | undefined {
		    const existing = this.getCrmProposalById(id);
		    if (!existing) return undefined;
		    const now = new Date().toISOString();
		    this.db
		      .prepare(
		        `UPDATE crm_proposals
		         SET status = ?, acceptedAt = ?, declinedAt = ?, updatedAt = ?
		         WHERE id = ?`,
		      )
		      .run(
		        status,
		        status === 'Accepted' ? now : existing.acceptedAt ? existing.acceptedAt.toISOString() : null,
		        status === 'Declined' ? now : existing.declinedAt ? existing.declinedAt.toISOString() : null,
		        now,
		        id,
		      );
		    if (status === 'Accepted') {
		      this.updateOpportunityStage(existing.opportunityId, 'Won');
		    } else if (status === 'Declined') {
		      this.updateOpportunityStage(existing.opportunityId, 'Lost');
		    } else if (status === 'Sent') {
		      this.updateOpportunityStage(existing.opportunityId, 'Proposal');
		    }
		    const result = this.getCrmProposalById(id);
		    if (result) {
		      this.createActivityEvent({
		        companyId: result.companyId,
		        entityType: 'proposal',
		        entityId: result.id,
		        action: 'status_changed',
		        summary: `Proposal ${result.proposalNumber} marked ${result.status}.`,
		        metadata: { opportunityId: result.opportunityId, status: result.status },
		      });
		    }
		    return result;
		  }

		  updateCrmProposal(id: string, updates: UpdateCrmProposalInput): CrmProposal | undefined {
		    const existing = this.getCrmProposalById(id);
		    if (!existing) return undefined;
		    const items =
		      updates.items === undefined
		        ? existing.items
		        : updates.items.map((item) => ({
		            description: item.description,
		            quantity: Number(item.quantity || 0),
		            unitPrice: Number(item.unitPrice || 0),
		            lineTotal: Number((Number(item.quantity || 0) * Number(item.unitPrice || 0)).toFixed(2)),
		          }));
		    const proposal: CrmProposal = {
		      ...existing,
		      title: updates.title === undefined ? existing.title : updates.title,
		      status: updates.status === undefined ? existing.status : updates.status,
		      issueDate:
		        updates.issueDate === undefined
		          ? existing.issueDate
		          : updates.issueDate
		            ? new Date(updates.issueDate)
		            : existing.issueDate,
		      validUntil:
		        updates.validUntil === undefined
		          ? existing.validUntil
		          : updates.validUntil
		            ? new Date(updates.validUntil)
		            : undefined,
		      items,
		      totalAmount: Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)),
		      notes: updates.notes === undefined ? existing.notes : updates.notes,
		      updatedAt: new Date(),
		    };
		    this.db
		      .prepare(
		        `UPDATE crm_proposals SET title=@title, status=@status, issueDate=@issueDate,
		         validUntil=@validUntil, items=@items, totalAmount=@totalAmount, notes=@notes,
		         updatedAt=@updatedAt WHERE id=@id`,
		      )
		      .run({
		        id,
		        title: proposal.title,
		        status: proposal.status,
		        issueDate: proposal.issueDate.toISOString(),
		        validUntil: proposal.validUntil ? proposal.validUntil.toISOString() : null,
		        items: JSON.stringify(proposal.items),
		        totalAmount: proposal.totalAmount,
		        notes: proposal.notes ?? null,
		        updatedAt: proposal.updatedAt.toISOString(),
		      });
		    if (updates.status && updates.status !== existing.status) {
		      if (updates.status === 'Accepted') {
		        this.updateOpportunityStage(existing.opportunityId, 'Won');
		      } else if (updates.status === 'Declined') {
		        this.updateOpportunityStage(existing.opportunityId, 'Lost');
		      } else if (updates.status === 'Sent') {
		        this.updateOpportunityStage(existing.opportunityId, 'Proposal');
		      }
		    }
		    const result = this.getCrmProposalById(id);
		    if (result) {
		      this.createActivityEvent({
		        companyId: result.companyId,
		        entityType: 'proposal',
		        entityId: result.id,
		        action: 'updated',
		        summary: `Proposal ${result.proposalNumber} updated.`,
		        metadata: { opportunityId: result.opportunityId, status: result.status },
		      });
		    }
		    return result;
		  }

		  deleteCrmProposal(id: string): boolean {
		    const existing = this.getCrmProposalById(id);
		    if (!existing) return false;
		    if (existing.status === 'Expired') return true;
		    this.updateCrmProposal(id, { status: 'Expired' });
		    return true;
		  }

		  listCrmCampaigns(companyId: string, includeArchived = false): CrmCampaign[] {
		    const rows = this.db
		      .prepare(
		        includeArchived
		          ? 'SELECT * FROM crm_campaigns WHERE companyId = ? ORDER BY updatedAt DESC'
		          : 'SELECT * FROM crm_campaigns WHERE companyId = ? AND archivedAt IS NULL ORDER BY updatedAt DESC',
		      )
		      .all(companyId) as any[];
		    return rows.map((row) => this.decodeCrmCampaign(row));
		  }

		  getCrmCampaignById(id: string): CrmCampaign | undefined {
		    const row = this.db.prepare('SELECT * FROM crm_campaigns WHERE id = ?').get(id) as any;
		    return row ? this.decodeCrmCampaign(row) : undefined;
		  }

		  createCrmCampaign(input: CreateCrmCampaignInput): CrmCampaign {
		    if (input.contactId) {
		      const contact = this.getContactById(input.contactId);
		      if (!contact || contact.companyId !== input.companyId) {
		        throw new Error('Campaign contact must belong to the selected company.');
		      }
		    }
		    if (input.proposalId) {
		      const proposal = this.getCrmProposalById(input.proposalId);
		      if (!proposal || proposal.companyId !== input.companyId) {
		        throw new Error('Campaign proposal must belong to the selected company.');
		      }
		    }
		    if (input.opportunityId) {
		      const opportunity = this.getOpportunityById(input.opportunityId);
		      if (!opportunity || opportunity.companyId !== input.companyId) {
		        throw new Error('Campaign opportunity must belong to the selected company.');
		      }
		    }
		    const now = new Date();
		    const campaign: CrmCampaign = {
		      ...input,
		      id: input.id ?? uuid(),
		      status: input.status ?? 'Planned',
		      startDate: input.startDate ? new Date(input.startDate) : undefined,
		      endDate: input.endDate ? new Date(input.endDate) : undefined,
		      budget: input.budget === undefined ? undefined : Number(input.budget),
		      visibility: input.visibility ?? 'Public',
		      archivedAt: input.archivedAt ? new Date(input.archivedAt) : undefined,
		      createdAt: input.createdAt ? new Date(input.createdAt) : now,
		      updatedAt: input.updatedAt ? new Date(input.updatedAt) : now,
		    };
		    this.db
		      .prepare(
		        `INSERT INTO crm_campaigns
		          (id, companyId, proposalId, opportunityId, contactId, projectId, name, status,
		           startDate, endDate, budget, ownerUserId, ownerName, visibility, notes, archivedAt, createdAt, updatedAt)
		         VALUES
		          (@id, @companyId, @proposalId, @opportunityId, @contactId, @projectId, @name, @status,
		           @startDate, @endDate, @budget, @ownerUserId, @ownerName, @visibility, @notes, @archivedAt, @createdAt, @updatedAt)`,
		      )
		      .run(this.serializeCrmCampaign(campaign));
		    this.createActivityEvent({
		      companyId: campaign.companyId,
		      entityType: 'campaign',
		      entityId: campaign.id,
		      action: 'created',
		      summary: `Campaign ${campaign.name} created.`,
		      metadata: { status: campaign.status, opportunityId: campaign.opportunityId, proposalId: campaign.proposalId },
		    });
		    return campaign;
		  }

		  updateCrmCampaign(id: string, updates: UpdateCrmCampaignInput): CrmCampaign | undefined {
		    const existing = this.getCrmCampaignById(id);
		    if (!existing) return undefined;
		    if (updates.contactId) {
		      const contact = this.getContactById(updates.contactId);
		      if (!contact || contact.companyId !== existing.companyId) {
		        throw new Error('Campaign contact must belong to the selected company.');
		      }
		    }
		    const campaign: CrmCampaign = {
		      ...existing,
		      proposalId: updates.proposalId === undefined ? existing.proposalId : updates.proposalId,
		      opportunityId: updates.opportunityId === undefined ? existing.opportunityId : updates.opportunityId,
		      contactId: updates.contactId === undefined ? existing.contactId : updates.contactId,
		      projectId: updates.projectId === undefined ? existing.projectId : updates.projectId,
		      name: updates.name === undefined ? existing.name : updates.name,
		      status: updates.status === undefined ? existing.status : updates.status,
		      startDate: updates.startDate ? new Date(updates.startDate) : existing.startDate,
		      endDate: updates.endDate ? new Date(updates.endDate) : existing.endDate,
		      budget: updates.budget === undefined ? existing.budget : Number(updates.budget),
		      ownerUserId: updates.ownerUserId === undefined ? existing.ownerUserId : updates.ownerUserId,
		      ownerName: updates.ownerName === undefined ? existing.ownerName : updates.ownerName,
		      visibility: updates.visibility === undefined ? existing.visibility : updates.visibility,
		      notes: updates.notes === undefined ? existing.notes : updates.notes,
		      archivedAt: updates.archivedAt ? new Date(updates.archivedAt) : existing.archivedAt,
		      invoiceId: updates.invoiceId === undefined ? existing.invoiceId : updates.invoiceId,
		      updatedAt: new Date(),
		    };
		    this.db
		      .prepare(
		        `UPDATE crm_campaigns SET proposalId=@proposalId, opportunityId=@opportunityId, projectId=@projectId,
		         contactId=@contactId, name=@name, status=@status, startDate=@startDate, endDate=@endDate, budget=@budget,
		         ownerUserId=@ownerUserId, ownerName=@ownerName, visibility=@visibility, notes=@notes,
		         archivedAt=@archivedAt, invoiceId=@invoiceId, updatedAt=@updatedAt WHERE id=@id`,
		      )
		      .run(this.serializeCrmCampaign(campaign));
		    const result = this.getCrmCampaignById(id);
		    if (result) {
		      this.createActivityEvent({
		        companyId: result.companyId,
		        entityType: 'campaign',
		        entityId: result.id,
		        action: 'updated',
		        summary: `Campaign ${result.name} updated.`,
		        metadata: { status: result.status },
		      });
		    }
		    return result;
		  }

		  deleteCrmCampaign(id: string): boolean {
		    const existing = this.getCrmCampaignById(id);
		    if (!existing) return false;
		    if (existing.archivedAt) return true;
		    this.updateCrmCampaign(id, { status: 'Archived', archivedAt: new Date() });
		    return true;
		  }

		  generateCampaignVendorBills(companyId: string, campaignId: string): VendorBill[] {
		    const campaign = this.getCrmCampaignById(campaignId);
		    if (!campaign || campaign.companyId !== companyId) {
		      throw new Error('Campaign not found.');
		    }
		    const deliverables = this.listCampaignDeliverables(campaignId);
		    const createdBills: VendorBill[] = [];
		    const now = new Date();
		    const dueDate = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
		    for (const d of deliverables) {
		      // Only external deliverables become payables. Skip internal ones,
		      // those already billed, and anything without a vendor contact.
		      if (d.vendorBillId) continue;
		      if ((d.fulfillment ?? 'Internal') !== 'External') continue;
		      const vendorContactId = d.vendorContactId ?? d.contactId;
		      if (!vendorContactId) continue;
		      const contact = this.getContactById(vendorContactId);
		      if (!contact) continue;
		      // Bill our cost — never the client price.
		      const amount = d.cost ?? 0;
		      if (amount <= 0) continue;
		      const bill = this.createVendorBill({
		        companyId,
		        vendorName: contact.name,
		        supplierId: contact.supplierId ?? undefined,
		        campaignId,
		        issueDate: now,
		        dueDate,
		        amount,
		        status: 'Draft',
		        notes: `Generated from campaign deliverable: ${d.title}`,
		      });
		      // Link deliverable to bill
		      this.db
		        .prepare(`UPDATE campaign_deliverables SET vendorBillId=?, updatedAt=? WHERE id=?`)
		        .run(bill.id, new Date().toISOString(), d.id);
		      createdBills.push(bill);
		    }
		    return createdBills;
		  }

		  listCampaignDeliverables(campaignId: string): CampaignDeliverable[] {
		    const rows = this.db
		      .prepare('SELECT * FROM campaign_deliverables WHERE campaignId = ? ORDER BY dueDate IS NULL, dueDate ASC, createdAt DESC')
		      .all(campaignId) as any[];
		    return rows.map((row) => this.decodeCampaignDeliverable(row));
		  }

		  getCampaignDeliverableById(id: string): CampaignDeliverable | undefined {
		    const row = this.db.prepare('SELECT * FROM campaign_deliverables WHERE id = ?').get(id) as any;
		    return row ? this.decodeCampaignDeliverable(row) : undefined;
		  }

		  createCampaignDeliverable(input: CreateCampaignDeliverableInput): CampaignDeliverable {
		    const campaign = this.getCrmCampaignById(input.campaignId);
		    if (!campaign || campaign.companyId !== input.companyId) {
		      throw new Error('Deliverable campaign must belong to the selected company.');
		    }
		    if (input.contactId) {
		      const contact = this.getContactById(input.contactId);
		      if (!contact || contact.companyId !== input.companyId) throw new Error('Deliverable contact must belong to the selected company.');
		    }
		    const now = new Date();
		    // Internal deliverables never carry a vendor (no payable); External
		    // ones require a vendor contact so a bill can be generated.
		    const fulfillment: CampaignFulfillment = input.fulfillment ?? (input.vendorContactId ? 'External' : 'Internal');
		    if (fulfillment === 'External' && !input.vendorContactId) {
		      throw new Error('An external deliverable needs a vendor contact.');
		    }
		    const deliverable: CampaignDeliverable = {
		      ...input,
		      id: input.id ?? uuid(),
		      fulfillment,
		      vendorContactId: fulfillment === 'Internal' ? undefined : input.vendorContactId,
		      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
		      status: input.status ?? 'Planned',
		      publishedAt: input.publishedAt ? new Date(input.publishedAt) : undefined,
		      createdAt: input.createdAt ? new Date(input.createdAt) : now,
		      updatedAt: input.updatedAt ? new Date(input.updatedAt) : now,
		    };
		    this.db
		      .prepare(
		        `INSERT INTO campaign_deliverables
		          (id, companyId, campaignId, contactId, vendorContactId, assignedUserId, assignedUserName, title, platform,
		           dueDate, status, contentUrl, price, cost, fulfillment, vendorBillId, publishedAt, notes, createdAt, updatedAt)
		         VALUES
		          (@id, @companyId, @campaignId, @contactId, @vendorContactId, @assignedUserId, @assignedUserName, @title, @platform,
		           @dueDate, @status, @contentUrl, @price, @cost, @fulfillment, @vendorBillId, @publishedAt, @notes, @createdAt, @updatedAt)`,
		      )
		      .run(this.serializeCampaignDeliverable(deliverable));
		    this.createActivityEvent({
		      companyId: deliverable.companyId,
		      entityType: 'campaign_deliverable',
		      entityId: deliverable.id,
		      action: 'created',
		      summary: `Campaign deliverable ${deliverable.title} created.`,
		      metadata: { campaignId: deliverable.campaignId, status: deliverable.status },
		    });
		    return deliverable;
		  }

		  updateCampaignDeliverable(id: string, updates: UpdateCampaignDeliverableInput): CampaignDeliverable | undefined {
		    const existing = this.getCampaignDeliverableById(id);
		    if (!existing) return undefined;
		    if (updates.contactId) {
		      const contact = this.getContactById(updates.contactId);
		      if (!contact || contact.companyId !== existing.companyId) throw new Error('Deliverable contact must belong to the selected company.');
		    }
		    const nextFulfillment: CampaignFulfillment =
		      updates.fulfillment === undefined ? (existing.fulfillment ?? 'Internal') : updates.fulfillment;
		    const requestedVendor = updates.vendorContactId === undefined ? existing.vendorContactId : updates.vendorContactId;
		    const nextVendor = nextFulfillment === 'Internal' ? undefined : requestedVendor;
		    if (nextFulfillment === 'External' && !nextVendor) {
		      throw new Error('An external deliverable needs a vendor contact.');
		    }
		    const deliverable: CampaignDeliverable = {
		      ...existing,
		      contactId: updates.contactId === undefined ? existing.contactId : updates.contactId,
		      vendorContactId: nextVendor,
		      fulfillment: nextFulfillment,
		      assignedUserId: updates.assignedUserId === undefined ? existing.assignedUserId : updates.assignedUserId,
		      assignedUserName: updates.assignedUserName === undefined ? existing.assignedUserName : updates.assignedUserName,
		      title: updates.title === undefined ? existing.title : updates.title,
		      platform: updates.platform === undefined ? existing.platform : updates.platform,
		      dueDate: updates.dueDate === undefined ? existing.dueDate : updates.dueDate ? new Date(updates.dueDate) : undefined,
		      status: updates.status === undefined ? existing.status : updates.status,
		      contentUrl: updates.contentUrl === undefined ? existing.contentUrl : updates.contentUrl,
		      price: updates.price === undefined ? existing.price : updates.price,
		      cost: updates.cost === undefined ? existing.cost : updates.cost,
		      vendorBillId: updates.vendorBillId === undefined ? existing.vendorBillId : updates.vendorBillId,
		      publishedAt: updates.publishedAt === undefined ? existing.publishedAt : updates.publishedAt ? new Date(updates.publishedAt) : undefined,
		      notes: updates.notes === undefined ? existing.notes : updates.notes,
		      updatedAt: new Date(),
		    };
		    this.db
		      .prepare(
		        `UPDATE campaign_deliverables SET contactId=@contactId, vendorContactId=@vendorContactId,
		         assignedUserId=@assignedUserId,
		         assignedUserName=@assignedUserName, title=@title, platform=@platform, dueDate=@dueDate,
		         status=@status, contentUrl=@contentUrl, price=@price, cost=@cost, fulfillment=@fulfillment, vendorBillId=@vendorBillId,
		         publishedAt=@publishedAt, notes=@notes,
		         updatedAt=@updatedAt WHERE id=@id`,
		      )
		      .run(this.serializeCampaignDeliverable(deliverable));
		    return this.getCampaignDeliverableById(id);
		  }

		  deleteCampaignDeliverable(id: string): boolean {
		    return this.db.prepare('DELETE FROM campaign_deliverables WHERE id = ?').run(id).changes > 0;
		  }

		  listCampaignAssignments(campaignId: string): CampaignAssignment[] {
		    const rows = this.db
		      .prepare('SELECT * FROM campaign_assignments WHERE campaignId = ? ORDER BY createdAt DESC')
		      .all(campaignId) as any[];
		    return rows.map((row) => this.decodeCampaignAssignment(row));
		  }

		  getCampaignAssignmentById(id: string): CampaignAssignment | undefined {
		    const row = this.db.prepare('SELECT * FROM campaign_assignments WHERE id = ?').get(id) as any;
		    return row ? this.decodeCampaignAssignment(row) : undefined;
		  }

		  createCampaignAssignment(input: CreateCampaignAssignmentInput): CampaignAssignment {
		    const campaign = this.getCrmCampaignById(input.campaignId);
		    const contact = this.getContactById(input.contactId);
		    if (!campaign || campaign.companyId !== input.companyId) throw new Error('Assignment campaign must belong to the selected company.');
		    if (!contact || contact.companyId !== input.companyId) throw new Error('Assignment contact must belong to the selected company.');
		    const now = new Date();
		    const assignment: CampaignAssignment = {
		      ...input,
		      id: input.id ?? uuid(),
		      agreedRate: input.agreedRate === undefined ? undefined : Number(input.agreedRate),
		      status: input.status ?? 'Planned',
		      createdAt: input.createdAt ? new Date(input.createdAt) : now,
		      updatedAt: input.updatedAt ? new Date(input.updatedAt) : now,
		    };
		    this.db
		      .prepare(
		        `INSERT INTO campaign_assignments
		          (id, companyId, campaignId, contactId, role, agreedRate, status, notes, createdAt, updatedAt)
		         VALUES
		          (@id, @companyId, @campaignId, @contactId, @role, @agreedRate, @status, @notes, @createdAt, @updatedAt)`,
		      )
		      .run(this.serializeCampaignAssignment(assignment));
		    this.addContactRole(input.contactId, input.companyId, input.role, 'Manual');
		    return assignment;
		  }

		  updateCampaignAssignment(id: string, updates: UpdateCampaignAssignmentInput): CampaignAssignment | undefined {
		    const existing = this.getCampaignAssignmentById(id);
		    if (!existing) return undefined;
		    const assignment: CampaignAssignment = {
		      ...existing,
		      role: updates.role === undefined ? existing.role : updates.role,
		      agreedRate: updates.agreedRate === undefined ? existing.agreedRate : Number(updates.agreedRate),
		      status: updates.status === undefined ? existing.status : updates.status,
		      notes: updates.notes === undefined ? existing.notes : updates.notes,
		      updatedAt: new Date(),
		    };
		    this.db
		      .prepare(
		        `UPDATE campaign_assignments SET role=@role, agreedRate=@agreedRate, status=@status,
		         notes=@notes, updatedAt=@updatedAt WHERE id=@id`,
		      )
		      .run(this.serializeCampaignAssignment(assignment));
		    return this.getCampaignAssignmentById(id);
		  }

		  deleteCampaignAssignment(id: string): boolean {
		    return this.db.prepare('DELETE FROM campaign_assignments WHERE id = ?').run(id).changes > 0;
		  }

		  listCampaignExpenses(campaignId: string): CampaignExpense[] {
		    const rows = this.db
		      .prepare('SELECT * FROM campaign_expenses WHERE campaignId = ? ORDER BY expenseDate DESC, createdAt DESC')
		      .all(campaignId) as any[];
		    return rows.map((row) => this.decodeCampaignExpense(row));
		  }

		  getCampaignExpenseById(id: string): CampaignExpense | undefined {
		    const row = this.db.prepare('SELECT * FROM campaign_expenses WHERE id = ?').get(id) as any;
		    return row ? this.decodeCampaignExpense(row) : undefined;
		  }

		  createCampaignExpense(input: CreateCampaignExpenseInput): CampaignExpense {
		    const campaign = this.getCrmCampaignById(input.campaignId);
		    if (!campaign || campaign.companyId !== input.companyId) throw new Error('Expense campaign must belong to the selected company.');
		    if (input.contactId) {
		      const contact = this.getContactById(input.contactId);
		      if (!contact || contact.companyId !== input.companyId) throw new Error('Expense contact must belong to the selected company.');
		    }
		    const now = new Date();
		    const expense: CampaignExpense = {
		      ...input,
		      id: input.id ?? uuid(),
		      amount: Number(input.amount || 0),
		      expenseDate: input.expenseDate ? new Date(input.expenseDate) : undefined,
		      status: input.status ?? 'Draft',
		      billable: Boolean(input.billable),
		      createdAt: input.createdAt ? new Date(input.createdAt) : now,
		      updatedAt: input.updatedAt ? new Date(input.updatedAt) : now,
		    };
		    this.db
		      .prepare(
		        `INSERT INTO campaign_expenses
		          (id, companyId, campaignId, contactId, vendorRequestId, description, amount,
		           expenseDate, status, billable, notes, createdAt, updatedAt)
		         VALUES
		          (@id, @companyId, @campaignId, @contactId, @vendorRequestId, @description, @amount,
		           @expenseDate, @status, @billable, @notes, @createdAt, @updatedAt)`,
		      )
		      .run(this.serializeCampaignExpense(expense));
		    // Recognise the cost on the ledger if it was created already approved/paid.
		    this.syncCampaignExpenseJournal(expense);
		    return expense;
		  }

		  updateCampaignExpense(id: string, updates: UpdateCampaignExpenseInput): CampaignExpense | undefined {
		    const existing = this.getCampaignExpenseById(id);
		    if (!existing) return undefined;
		    const expense: CampaignExpense = {
		      ...existing,
		      contactId: updates.contactId === undefined ? existing.contactId : updates.contactId,
		      vendorRequestId: updates.vendorRequestId === undefined ? existing.vendorRequestId : updates.vendorRequestId,
		      description: updates.description === undefined ? existing.description : updates.description,
		      amount: updates.amount === undefined ? existing.amount : Number(updates.amount),
		      expenseDate: updates.expenseDate === undefined ? existing.expenseDate : updates.expenseDate ? new Date(updates.expenseDate) : undefined,
		      status: updates.status === undefined ? existing.status : updates.status,
		      billable: updates.billable === undefined ? existing.billable : Boolean(updates.billable),
		      notes: updates.notes === undefined ? existing.notes : updates.notes,
		      updatedAt: new Date(),
		    };
		    this.db
		      .prepare(
		        `UPDATE campaign_expenses SET contactId=@contactId, vendorRequestId=@vendorRequestId,
		         description=@description, amount=@amount, expenseDate=@expenseDate, status=@status,
		         billable=@billable, notes=@notes, updatedAt=@updatedAt WHERE id=@id`,
		      )
		      .run(this.serializeCampaignExpense(expense));
		    const saved = this.getCampaignExpenseById(id);
		    if (saved) {
		      // Reverse the prior posting (if any) and re-post when still
		      // approved/paid, so amount/date edits are reflected on the ledger.
		      this.removeJournalEntriesBySource('campaign_expense', saved.id);
		      this.syncCampaignExpenseJournal(saved);
		    }
		    return saved;
		  }

		  deleteCampaignExpense(id: string): boolean {
		    // Reverse any ledger posting before removing the expense.
		    this.removeJournalEntriesBySource('campaign_expense', id);
		    return this.db.prepare('DELETE FROM campaign_expenses WHERE id = ?').run(id).changes > 0;
		  }

			  listVendorRequests(companyId: string): VendorRequest[] {
	    const rows = this.db
	      .prepare('SELECT * FROM vendor_requests WHERE companyId = ? ORDER BY createdAt DESC')
	      .all(companyId) as any[];
	    return rows.map((row) => this.decodeVendorRequest(row));
	  }

	  getVendorRequestById(id: string): VendorRequest | undefined {
	    const row = this.db.prepare('SELECT * FROM vendor_requests WHERE id = ?').get(id) as any;
	    return row ? this.decodeVendorRequest(row) : undefined;
	  }

	  createVendorRequest(input: CreateVendorRequestInput): VendorRequest {
	    const now = new Date();
		    const request: VendorRequest = {
		      ...input,
		      id: input.id ?? uuid(),
		      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
		      cost: input.cost === undefined ? undefined : Number(input.cost),
		      status: input.status ?? 'New',
	      requestedByUserId: input.requestedByUserId ?? this.currentActor?.userId,
	      requestedByName: input.requestedByName ?? this.currentActor?.name,
	      createdAt: input.createdAt ? new Date(input.createdAt) : now,
	      updatedAt: input.updatedAt ? new Date(input.updatedAt) : now,
	    };
	    this.db
	      .prepare(
		        `INSERT INTO vendor_requests
		          (id, companyId, contactId, requestedByUserId, requestedByName, name, role, requestType, platform, handle,
		           details, dueDate, cost, status, notes, reviewedByUserId, reviewedByName, reviewedAt, createdAt, updatedAt)
		         VALUES
		          (@id, @companyId, @contactId, @requestedByUserId, @requestedByName, @name, @role, @requestType, @platform, @handle,
		           @details, @dueDate, @cost, @status, @notes, @reviewedByUserId, @reviewedByName, @reviewedAt, @createdAt, @updatedAt)`,
	      )
	      .run({
	        ...request,
	        contactId: request.contactId ?? null,
	        requestedByUserId: request.requestedByUserId ?? null,
		        requestedByName: request.requestedByName ?? null,
		        requestType: request.requestType ?? null,
		        platform: request.platform ?? null,
		        handle: request.handle ?? null,
		        details: request.details ?? null,
		        dueDate: request.dueDate ? request.dueDate.toISOString() : null,
		        cost: request.cost ?? null,
		        notes: request.notes ?? null,
	        reviewedByUserId: null,
	        reviewedByName: null,
	        reviewedAt: null,
	        createdAt: request.createdAt.toISOString(),
	        updatedAt: request.updatedAt.toISOString(),
	      });
	    this.createActivityEvent({
	      companyId: request.companyId,
	      entityType: 'vendor_request',
	      entityId: request.id,
	      action: 'created',
	      summary: `Vendor request ${request.name} created.`,
	      metadata: { role: request.role, status: request.status },
	    });
	    return request;
	  }

	  updateVendorRequest(id: string, updates: UpdateVendorRequestInput): VendorRequest | undefined {
	    const existing = this.getVendorRequestById(id);
	    if (!existing) return undefined;
	    if (updates.contactId) {
	      const contact = this.getContactById(updates.contactId);
	      if (!contact || contact.companyId !== existing.companyId) {
	        throw new Error('Vendor request contact must belong to the selected company.');
	      }
	    }
	    const request: VendorRequest = {
	      ...existing,
	      contactId: updates.contactId === undefined ? existing.contactId : updates.contactId,
	      name: updates.name === undefined ? existing.name : updates.name,
	      role: updates.role === undefined ? existing.role : updates.role,
	      requestType: updates.requestType === undefined ? existing.requestType : updates.requestType,
	      platform: updates.platform === undefined ? existing.platform : updates.platform,
	      handle: updates.handle === undefined ? existing.handle : updates.handle,
	      details: updates.details === undefined ? existing.details : updates.details,
	      dueDate:
	        updates.dueDate === undefined
	          ? existing.dueDate
	          : updates.dueDate
	            ? new Date(updates.dueDate)
	            : undefined,
	      cost: updates.cost === undefined ? existing.cost : updates.cost === null ? undefined : Number(updates.cost),
	      status: updates.status === undefined ? existing.status : updates.status,
	      notes: updates.notes === undefined ? existing.notes : updates.notes,
	      updatedAt: new Date(),
	    };
	    this.db
	      .prepare(
	        `UPDATE vendor_requests SET contactId=@contactId, name=@name, role=@role, requestType=@requestType,
	         platform=@platform, handle=@handle, details=@details, dueDate=@dueDate, cost=@cost,
	         status=@status, notes=@notes, updatedAt=@updatedAt WHERE id=@id`,
	      )
	      .run({
	        id,
	        contactId: request.contactId ?? null,
	        name: request.name,
	        role: request.role,
	        requestType: request.requestType ?? null,
	        platform: request.platform ?? null,
	        handle: request.handle ?? null,
	        details: request.details ?? null,
	        dueDate: request.dueDate ? request.dueDate.toISOString() : null,
	        cost: request.cost ?? null,
	        status: request.status,
	        notes: request.notes ?? null,
	        updatedAt: request.updatedAt.toISOString(),
	      });
	    const result = this.getVendorRequestById(id);
	    if (result) {
	      this.createActivityEvent({
	        companyId: result.companyId,
	        entityType: 'vendor_request',
	        entityId: result.id,
	        action: 'updated',
	        summary: `Vendor request ${result.name} updated.`,
	        metadata: { role: result.role, status: result.status },
	      });
	    }
	    return result;
	  }

	  deleteVendorRequest(id: string): boolean {
	    const existing = this.getVendorRequestById(id);
	    if (!existing) return false;
	    if (existing.status === 'Archived') return true;
	    this.updateVendorRequest(id, { status: 'Archived' });
	    return true;
	  }

	  reviewVendorRequest(id: string, status: VendorRequestStatus, notes?: string): VendorRequest | undefined {
	    const existing = this.db.prepare('SELECT * FROM vendor_requests WHERE id = ?').get(id) as any;
	    if (!existing) return undefined;
	    const now = new Date().toISOString();
	    let contactId = existing.contactId as string | null;
	    if (status === 'Approved' && !contactId) {
	      const contact = this.createContact({
	        companyId: existing.companyId,
	        kind: 'Organization',
	        name: existing.name,
	        roles: [existing.role],
	        influencerPlatform: existing.platform ?? undefined,
	        influencerHandle: existing.handle ?? undefined,
	        notes: existing.details ?? undefined,
	      });
	      contactId = contact.id;
	    } else if (status === 'Approved' && contactId) {
	      this.addContactRole(contactId, existing.companyId, existing.role, 'Manual');
	    }
	    this.db
	      .prepare(
	        `UPDATE vendor_requests SET status=@status, contactId=@contactId, notes=@notes,
	           reviewedByUserId=@reviewedByUserId, reviewedByName=@reviewedByName,
	           reviewedAt=@reviewedAt, updatedAt=@updatedAt WHERE id=@id`,
	      )
	      .run({
	        id,
	        status,
	        contactId,
	        notes: notes ?? existing.notes ?? null,
	        reviewedByUserId: this.currentActor?.userId ?? null,
	        reviewedByName: this.currentActor?.name ?? null,
	        reviewedAt: now,
	        updatedAt: now,
	      });
	    const result = this.decodeVendorRequest(this.db.prepare('SELECT * FROM vendor_requests WHERE id = ?').get(id) as any);
	    this.createActivityEvent({
	      companyId: result.companyId,
	      entityType: 'vendor_request',
	      entityId: result.id,
	      action: 'reviewed',
	      summary: `Vendor request ${result.name} marked ${result.status}.`,
	      metadata: { status: result.status, contactId: result.contactId },
	    });
	    return result;
	  }

	  // ─────────────────────────────────────────────────────────────────────
	  // Contributions — source-agnostic revenue attribution. Every commission
	  // is grounded in a contribution row. See Commissions v2 plan.
	  // ─────────────────────────────────────────────────────────────────────

	  private decodeContribution(row: any): Contribution {
	    return {
	      id: row.id,
	      companyId: row.companyId,
	      userId: row.userId,
	      userName: row.userName ?? undefined,
	      sourceType: row.sourceType as ContributionSourceType,
	      sourceId: row.sourceId,
	      role: row.role as ContributionRole,
	      roleNote: row.roleNote ?? undefined,
	      weightPercent: Number(row.weightPercent) || 0,
	      notes: row.notes ?? undefined,
	      createdAt: new Date(row.createdAt),
	      updatedAt: new Date(row.updatedAt),
	    };
	  }

	  listContributions(
	    companyId: string,
	    options: { sourceType?: ContributionSourceType; sourceId?: string; userId?: string } = {},
	  ): Contribution[] {
	    const conditions: string[] = ['companyId = ?'];
	    const params: any[] = [companyId];
	    if (options.sourceType) { conditions.push('sourceType = ?'); params.push(options.sourceType); }
	    if (options.sourceId) { conditions.push('sourceId = ?'); params.push(options.sourceId); }
	    if (options.userId) { conditions.push('userId = ?'); params.push(options.userId); }
	    const rows = this.db
	      .prepare(`SELECT * FROM contributions WHERE ${conditions.join(' AND ')} ORDER BY createdAt ASC`)
	      .all(...params) as any[];
	    return rows.map((r) => this.decodeContribution(r));
	  }

	  private getContributionsSumWeight(
	    companyId: string,
	    sourceType: ContributionSourceType,
	    sourceId: string,
	    excludeId?: string,
	  ): number {
	    const sql = excludeId
	      ? `SELECT COALESCE(SUM(weightPercent), 0) AS total FROM contributions
	           WHERE companyId = ? AND sourceType = ? AND sourceId = ? AND id != ?`
	      : `SELECT COALESCE(SUM(weightPercent), 0) AS total FROM contributions
	           WHERE companyId = ? AND sourceType = ? AND sourceId = ?`;
	    const row = excludeId
	      ? this.db.prepare(sql).get(companyId, sourceType, sourceId, excludeId)
	      : this.db.prepare(sql).get(companyId, sourceType, sourceId);
	    return Number((row as { total?: number } | undefined)?.total) || 0;
	  }

	  /**
	   * Adds a contributor to a source. Enforces Σweights ≤ 100 per source
	   * (decision #1 in the v2 plan). If a contribution already exists for the
	   * same (user, role) on this source, its weight is updated instead.
	   */
	  setContribution(input: {
	    companyId: string;
	    userId: string;
	    userName?: string;
	    sourceType: ContributionSourceType;
	    sourceId: string;
	    role: ContributionRole;
	    roleNote?: string;
	    weightPercent: number;
	    notes?: string;
	  }): Contribution {
	    if (!contributionRoles.includes(input.role)) {
	      throw new Error(`Unknown contribution role: ${input.role}`);
	    }
	    const weight = Math.max(0, Math.min(100, Number(input.weightPercent) || 0));
	    // Look for an existing row on the same (source, user, role) tuple.
	    const existing = this.db
	      .prepare(
	        `SELECT * FROM contributions
	           WHERE companyId = ? AND sourceType = ? AND sourceId = ? AND userId = ? AND role = ?`,
	      )
	      .get(
	        input.companyId,
	        input.sourceType,
	        input.sourceId,
	        input.userId,
	        input.role,
	      ) as any;

	    const otherWeights = this.getContributionsSumWeight(
	      input.companyId,
	      input.sourceType,
	      input.sourceId,
	      existing?.id,
	    );
	    if (otherWeights + weight > 100.0001) {
	      throw new Error(
	        `Contribution weights would exceed 100% on ${input.sourceType} ${input.sourceId} ` +
	        `(other contributors total ${otherWeights}%, adding ${weight}%).`,
	      );
	    }

	    const now = new Date().toISOString();
	    if (existing) {
	      this.db
	        .prepare(
	          `UPDATE contributions
	             SET userName = ?, weightPercent = ?, roleNote = ?, notes = ?, updatedAt = ?
	             WHERE id = ?`,
	        )
	        .run(
	          input.userName ?? existing.userName ?? null,
	          weight,
	          input.roleNote ?? null,
	          input.notes ?? null,
	          now,
	          existing.id,
	        );
	      const row = this.db
	        .prepare('SELECT * FROM contributions WHERE id = ?')
	        .get(existing.id) as any;
	      return this.decodeContribution(row);
	    }

	    const id = uuid();
	    this.db
	      .prepare(
	        `INSERT INTO contributions
	           (id, companyId, userId, userName, sourceType, sourceId, role, roleNote, weightPercent, notes, createdAt, updatedAt)
	         VALUES
	           (@id, @companyId, @userId, @userName, @sourceType, @sourceId, @role, @roleNote, @weightPercent, @notes, @now, @now)`,
	      )
	      .run({
	        id,
	        companyId: input.companyId,
	        userId: input.userId,
	        userName: input.userName ?? null,
	        sourceType: input.sourceType,
	        sourceId: input.sourceId,
	        role: input.role,
	        roleNote: input.roleNote ?? null,
	        weightPercent: weight,
	        notes: input.notes ?? null,
	        now,
	      });
	    const row = this.db.prepare('SELECT * FROM contributions WHERE id = ?').get(id) as any;
	    return this.decodeContribution(row);
	  }

	  getContributionById(id: string): Contribution | undefined {
	    const row = this.db.prepare('SELECT * FROM contributions WHERE id = ?').get(id) as any;
	    return row ? this.decodeContribution(row) : undefined;
	  }

	  deleteContribution(id: string): boolean {
	    const result = this.db.prepare('DELETE FROM contributions WHERE id = ?').run(id);
	    return result.changes > 0;
	  }

	  /**
	   * Auto-seed default contributors for a newly-created source entity.
	   * - Opportunity: ownerUserId as 'Sales' 100%
	   * - Project:     first member as 'Project Lead' 100%
	   * - Task:        assignees split evenly as 'Contributor'
	   *
	   * Idempotent — won't add a row that already exists for the same tuple.
	   */
	  seedDefaultContributors(input: {
	    companyId: string;
	    sourceType: ContributionSourceType;
	    sourceId: string;
	    userIds: string[];
	    role: ContributionRole;
	  }): void {
	    const users = input.userIds.filter(Boolean);
	    if (!users.length) return;
	    const weight = Math.round((100 / users.length) * 100) / 100; // 33.33 etc.
	    users.forEach((userId, idx) => {
	      // Last contributor absorbs the rounding remainder so Σ = 100.00
	      const w = idx === users.length - 1 ? Number((100 - weight * (users.length - 1)).toFixed(2)) : weight;
	      try {
	        const userRow = this.db
	          .prepare('SELECT name FROM users WHERE id = ?')
	          .get(userId) as { name?: string } | undefined;
	        this.setContribution({
	          companyId: input.companyId,
	          userId,
	          userName: userRow?.name,
	          sourceType: input.sourceType,
	          sourceId: input.sourceId,
	          role: input.role,
	          weightPercent: w,
	        });
	      } catch (error) {
	        console.error('Failed to seed default contributor', error);
	      }
	    });
	  }

	  listCommissionRules(companyId: string): CommissionRule[] {
	    const rows = this.db
	      .prepare('SELECT * FROM commission_rules WHERE companyId = ? ORDER BY serviceType ASC')
	      .all(companyId) as any[];
	    return rows.map((row) => this.decodeCommissionRule(row));
	  }

	  createCommissionRule(input: CreateCommissionRuleInput): CommissionRule {
	    const now = new Date();
	    const rule: CommissionRule = {
	      ...input,
	      id: input.id ?? uuid(),
	      userId: input.userId ?? undefined,
	      role: input.role ?? undefined,
	      serviceType: input.serviceType ?? undefined,
	      rate: Number(input.rate || 0),
	      fixedAmount: input.fixedAmount === undefined ? undefined : Number(input.fixedAmount),
	      priority: Number(input.priority || 0),
	      isActive: input.isActive ?? true,
	      notes: input.notes ?? undefined,
	      createdAt: input.createdAt ? new Date(input.createdAt) : now,
	      updatedAt: input.updatedAt ? new Date(input.updatedAt) : now,
	    };

	    // Manual upsert keyed on (companyId, userId, role, serviceType)
	    const existing = this.db
	      .prepare(
	        `SELECT id FROM commission_rules
	           WHERE companyId = ?
	             AND COALESCE(userId, '') = COALESCE(?, '')
	             AND COALESCE(role, '') = COALESCE(?, '')
	             AND COALESCE(serviceType, '') = COALESCE(?, '')`,
	      )
	      .get(
	        rule.companyId,
	        rule.userId ?? null,
	        rule.role ?? null,
	        rule.serviceType ?? null,
	      ) as { id?: string } | undefined;

	    if (existing?.id) {
	      this.db
	        .prepare(
	          `UPDATE commission_rules
	             SET basis = ?, rateType = ?, rate = ?, fixedAmount = ?,
	                 priority = ?, isActive = ?, notes = ?, updatedAt = ?
	             WHERE id = ?`,
	        )
	        .run(
	          rule.basis,
	          rule.rateType,
	          rule.rate,
	          rule.fixedAmount ?? null,
	          rule.priority,
	          rule.isActive ? 1 : 0,
	          rule.notes ?? null,
	          rule.updatedAt.toISOString(),
	          existing.id,
	        );
	      const refreshed = this.db
	        .prepare('SELECT * FROM commission_rules WHERE id = ?')
	        .get(existing.id) as any;
	      return this.decodeCommissionRule(refreshed);
	    }

	    this.db
	      .prepare(
	        `INSERT INTO commission_rules
	          (id, companyId, userId, role, serviceType, basis, rateType, rate, fixedAmount, priority, isActive, notes, createdAt, updatedAt)
	         VALUES
	          (@id, @companyId, @userId, @role, @serviceType, @basis, @rateType, @rate, @fixedAmount, @priority, @isActive, @notes, @createdAt, @updatedAt)`,
	      )
	      .run({
	        ...rule,
	        userId: rule.userId ?? null,
	        role: rule.role ?? null,
	        serviceType: rule.serviceType ?? null,
	        fixedAmount: rule.fixedAmount ?? null,
	        isActive: rule.isActive ? 1 : 0,
	        notes: rule.notes ?? null,
	        createdAt: rule.createdAt.toISOString(),
	        updatedAt: rule.updatedAt.toISOString(),
	      });

	    const row = this.db
	      .prepare('SELECT * FROM commission_rules WHERE id = ?')
	      .get(rule.id) as any;
	    return this.decodeCommissionRule(row);
	  }

	  updateCommissionRule(
	    id: string,
	    updates: Partial<Omit<CommissionRule, 'id' | 'companyId' | 'createdAt'>>,
	  ): CommissionRule | undefined {
	    const row = this.db
	      .prepare('SELECT * FROM commission_rules WHERE id = ?')
	      .get(id) as any;
	    if (!row) return undefined;
	    const existing = this.decodeCommissionRule(row);
	    const next: CommissionRule = {
	      ...existing,
	      ...updates,
	      updatedAt: new Date(),
	    };
	    this.db
	      .prepare(
	        `UPDATE commission_rules
	           SET userId = ?, role = ?, serviceType = ?, basis = ?, rateType = ?, rate = ?,
	               fixedAmount = ?, priority = ?, isActive = ?, notes = ?, updatedAt = ?
	           WHERE id = ?`,
	      )
	      .run(
	        next.userId ?? null,
	        next.role ?? null,
	        next.serviceType ?? null,
	        next.basis,
	        next.rateType,
	        next.rate,
	        next.fixedAmount ?? null,
	        next.priority,
	        next.isActive ? 1 : 0,
	        next.notes ?? null,
	        next.updatedAt.toISOString(),
	        id,
	      );
	    const refreshed = this.db
	      .prepare('SELECT * FROM commission_rules WHERE id = ?')
	      .get(id) as any;
	    return this.decodeCommissionRule(refreshed);
	  }

	  deleteCommissionRule(id: string): boolean {
	    const result = this.db.prepare('DELETE FROM commission_rules WHERE id = ?').run(id);
	    return result.changes > 0;
	  }

	  /**
	   * Gather all contributors that should share commission for a given invoice.
	   * Walks invoice → linked SO → linked opportunity (via wonSalesOrderId).
	   * Returns a flat deduplicated list.
	   */
	  private gatherContributorsForInvoice(invoice: Invoice): Contribution[] {
	    const seen = new Map<string, Contribution>();
	    const add = (c: Contribution) => {
	      const key = `${c.userId}::${c.role}::${c.sourceType}::${c.sourceId}`;
	      if (!seen.has(key)) seen.set(key, c);
	    };

	    this.listContributions(invoice.companyId, {
	      sourceType: 'invoice',
	      sourceId: invoice.id,
	    }).forEach(add);

	    if (invoice.salesOrderId) {
	      const oppRow = this.db
	        .prepare('SELECT id FROM opportunities WHERE wonSalesOrderId = ? LIMIT 1')
	        .get(invoice.salesOrderId) as { id?: string } | undefined;
	      if (oppRow?.id) {
	        this.listContributions(invoice.companyId, {
	          sourceType: 'opportunity',
	          sourceId: oppRow.id,
	        }).forEach(add);
	      }
	    }

	    return Array.from(seen.values());
	  }

	  /** Compute the per-invoice basis amount for a rule's basis type. */
	  private computeBasisForInvoice(invoice: Invoice, basis: CommissionBasis): number {
	    if (basis === 'Revenue') return Number(invoice.total || 0);
	    if (basis === 'Paid Amount') return Number(this.getInvoicePaidAmount(invoice.id) || 0);
	    if (basis === 'Profit') {
	      const paid = Number(this.getInvoicePaidAmount(invoice.id) || 0);
	      let cost = 0;
	      if (invoice.campaignId) {
	        const expenses = this.db
	          .prepare("SELECT amount FROM campaign_expenses WHERE campaignId = ? AND status IN ('Approved', 'Paid')")
	          .all(invoice.campaignId) as Array<{ amount: number }>;
	        cost += expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
	        const bills = this.db
	          .prepare('SELECT amount FROM vendor_bills WHERE campaignId = ? AND status != ?')
	          .all(invoice.campaignId, 'Draft') as Array<{ amount: number }>;
	        cost += bills.reduce((s, b) => s + Number(b.amount || 0), 0);
	      }
	      return Math.max(0, paid - cost);
	    }
	    return 0;
	  }

	  /**
	   * Idempotent v2 engine — for each contributor on the invoice (or upstream
	   * source linked to it), resolve a rule and upsert a Draft commission row.
   * Re-running for the same invoice updates Draft amounts in place. Approved,
   * Paid, and Voided commissions are immutable unless an explicit accounting
   * rollback first moves them back to Draft.
	   */
	  recomputeCommissionsForInvoice(invoiceId: string): Commission[] {
	    const invoice = this.getInvoiceById(invoiceId);
	    if (!invoice) return [];
	    const contributions = this.gatherContributorsForInvoice(invoice);
	    const result: Commission[] = [];
	    const sourceLabel = `Invoice ${invoice.invoiceNumber}`;

	    let serviceType: string | undefined;
	    if (invoice.salesOrderId) {
	      const oppRow = this.db
	        .prepare('SELECT serviceType FROM opportunities WHERE wonSalesOrderId = ? LIMIT 1')
	        .get(invoice.salesOrderId) as { serviceType?: string } | undefined;
	      serviceType = oppRow?.serviceType;
	    }

	    for (const contribution of contributions) {
	      const userRow = this.db
	        .prepare('SELECT commissionEligible FROM users WHERE id = ?')
	        .get(contribution.userId) as { commissionEligible?: number } | undefined;
	      if (!userRow?.commissionEligible) continue;

	      const rule = this.resolveCommissionRule(
	        invoice.companyId,
	        contribution.userId,
	        contribution.role,
	        serviceType,
	      );
	      if (!rule) continue;

	      const fullBasis = this.computeBasisForInvoice(invoice, rule.basis);
	      const weightedBasis = Number((fullBasis * (contribution.weightPercent / 100)).toFixed(4));
	      const amount =
	        rule.rateType === 'Fixed'
	          ? Number((rule.fixedAmount ?? rule.rate ?? 0).toFixed(2))
	          : Number(((weightedBasis * rule.rate) / 100).toFixed(2));
	      const ruleIdToStore = rule.id.startsWith('user-default:') ? null : rule.id;

	      const existing = this.db
	        .prepare(
	          `SELECT * FROM commissions
	             WHERE companyId = ? AND contributionId = ? AND invoiceId = ?`,
	        )
	        .get(invoice.companyId, contribution.id, invoice.id) as any;

      const calculatedAt = new Date().toISOString();
      if (existing) {
        if (existing.status !== 'Draft') continue;
        this.db
	          .prepare(
	            `UPDATE commissions
	               SET userId = ?, userName = ?, role = ?, ruleId = ?, sourceType = ?, sourceId = ?,
	                   sourceLabel = ?, serviceType = ?, basis = ?, basisAmount = ?,
	                   weightPercent = ?, ratePercent = ?, fixedAmount = ?, amount = ?,
	                   status = CASE WHEN status = 'Voided' THEN 'Voided' ELSE 'Draft' END,
	                   calculatedAt = ?
	               WHERE id = ?`,
	          )
	          .run(
	            contribution.userId,
	            contribution.userName ?? null,
	            contribution.role,
	            ruleIdToStore,
	            contribution.sourceType,
	            contribution.sourceId,
	            sourceLabel,
	            serviceType ?? 'Default',
	            rule.basis,
	            weightedBasis,
	            contribution.weightPercent,
	            rule.rateType === 'Percent' ? rule.rate : null,
	            rule.rateType === 'Fixed' ? rule.fixedAmount ?? rule.rate : null,
	            amount,
	            calculatedAt,
	            existing.id,
	          );
	        const refreshed = this.db
	          .prepare('SELECT * FROM commissions WHERE id = ?')
	          .get(existing.id) as any;
	        result.push(this.decodeCommission(refreshed));
	        continue;
	      }

	      const id = uuid();
	      this.db
	        .prepare(
	          `INSERT INTO commissions
	             (id, companyId, userId, userName, contributionId, sourceType, sourceId, sourceLabel,
	              invoiceId, role, ruleId, serviceType, basis, basisAmount, weightPercent,
	              ratePercent, fixedAmount, amount, status, opportunityId, contactId, calculatedAt)
	           VALUES
	             (@id, @companyId, @userId, @userName, @contributionId, @sourceType, @sourceId, @sourceLabel,
	              @invoiceId, @role, @ruleId, @serviceType, @basis, @basisAmount, @weightPercent,
	              @ratePercent, @fixedAmount, @amount, 'Draft', @opportunityId, @contactId, @calculatedAt)`,
	        )
	        .run({
	          id,
	          companyId: invoice.companyId,
	          userId: contribution.userId,
	          userName: contribution.userName ?? null,
	          contributionId: contribution.id,
	          sourceType: contribution.sourceType,
	          sourceId: contribution.sourceId,
	          sourceLabel,
	          invoiceId: invoice.id,
	          role: contribution.role,
	          ruleId: ruleIdToStore,
	          serviceType: serviceType ?? 'Default',
	          basis: rule.basis,
	          basisAmount: weightedBasis,
	          weightPercent: contribution.weightPercent,
	          ratePercent: rule.rateType === 'Percent' ? rule.rate : null,
	          fixedAmount: rule.rateType === 'Fixed' ? rule.fixedAmount ?? rule.rate : null,
	          amount,
	          opportunityId: contribution.sourceType === 'opportunity' ? contribution.sourceId : null,
	          contactId: invoice.contactId ?? null,
	          calculatedAt,
	        });
	      const refreshed = this.db
	        .prepare('SELECT * FROM commissions WHERE id = ?')
	        .get(id) as any;
	      result.push(this.decodeCommission(refreshed));
	    }

	    return result;
	  }

	  /** Replay recompute across every Draft commission in a company. */
	  recomputeCommissionsForCompany(companyId: string): number {
	    const rows = this.db
	      .prepare(
	        `SELECT DISTINCT invoiceId FROM commissions
	           WHERE companyId = ? AND invoiceId IS NOT NULL AND status = 'Draft'`,
	      )
	      .all(companyId) as Array<{ invoiceId: string }>;
	    let touched = 0;
	    rows.forEach((row) => {
	      const updates = this.recomputeCommissionsForInvoice(row.invoiceId);
	      touched += updates.length;
	    });
	    return touched;
	  }

	  /** Void all non-Paid commissions linked to an invoice. */
	  voidCommissionsForInvoice(invoiceId: string): number {
	    const result = this.db
	      .prepare(
	        `UPDATE commissions
	           SET status = 'Voided', voidedAt = ?
	           WHERE invoiceId = ? AND status != 'Paid' AND status != 'Voided'`,
	      )
	      .run(new Date().toISOString(), invoiceId);
	    return result.changes ?? 0;
	  }

	  /**
	   * Walk specificity ordering to find the best rule for a given
	   * (user, role, serviceType) context. Most specific match wins, ties
	   * broken by priority (DESC) then createdAt (DESC).
	   *
	   * Precedence order (most to least specific):
	   *   1. user + role + serviceType
	   *   2. user + role
	   *   3. user + serviceType
	   *   4. user
	   *   5. role + serviceType
	   *   6. role
	   *   7. serviceType
	   *   8. any (the company default)
	   *
	   * Falls back to the user's defaultCommissionRate (a synthetic rule)
	   * when no row matches.
	   */
	  resolveCommissionRule(
	    companyId: string,
	    userId: string,
	    role: ContributionRole | undefined,
	    serviceType: string | undefined,
	  ): CommissionRule | undefined {
	    const rules = this.db
	      .prepare(
	        `SELECT * FROM commission_rules
	           WHERE companyId = ? AND isActive = 1
	             AND (userId = ? OR userId IS NULL)
	             AND (role = ? OR role IS NULL)
	             AND (serviceType = ? OR serviceType IS NULL OR serviceType = '')`,
	      )
	      .all(companyId, userId, role ?? null, serviceType ?? null) as any[];
	    if (!rules.length) {
	      // Fallback: user's defaultCommissionRate creates a synthetic rule.
	      const user = this.db
	        .prepare('SELECT * FROM users WHERE id = ?')
	        .get(userId) as any;
	      if (user?.commissionEligible && user?.defaultCommissionRate != null) {
	        return {
	          id: `user-default:${userId}`,
	          companyId,
	          userId,
	          role: undefined,
	          serviceType: undefined,
	          basis: (user.defaultCommissionBasis as CommissionBasis) || 'Revenue',
	          rateType: 'Percent' as CommissionRateType,
	          rate: Number(user.defaultCommissionRate || 0),
	          fixedAmount: undefined,
	          priority: -1,
	          isActive: true,
	          notes: 'User default rate',
	          createdAt: new Date(),
	          updatedAt: new Date(),
	        };
	      }
	      return undefined;
	    }
	    const decoded = rules.map((r) => this.decodeCommissionRule(r));
	    // Score: 4 = user+role+service, 3 = user+role, etc. Specificity weight.
	    const specificity = (r: CommissionRule) =>
	      (r.userId ? 4 : 0) + (r.role ? 2 : 0) + (r.serviceType ? 1 : 0);
	    decoded.sort((a, b) => {
	      const sa = specificity(a);
	      const sb = specificity(b);
	      if (sa !== sb) return sb - sa;
	      if (b.priority !== a.priority) return b.priority - a.priority;
	      return b.createdAt.getTime() - a.createdAt.getTime();
	    });
	    return decoded[0];
	  }

		  listCommissions(companyId: string): Commission[] {
		    const rows = this.db
		      .prepare('SELECT * FROM commissions WHERE companyId = ? ORDER BY calculatedAt DESC')
		      .all(companyId) as any[];
		    return rows.map((row) => this.decodeCommission(row));
		  }

		  getCommissionById(id: string): Commission | undefined {
		    const row = this.db.prepare('SELECT * FROM commissions WHERE id = ?').get(id) as any;
		    return row ? this.decodeCommission(row) : undefined;
		  }

		  /**
		   * Legacy v1 entry point. v2 prefers approveCommission / payCommission
		   * / voidCommission so the journal entries are posted correctly.
		   * Kept for backwards compat with anything still calling it.
		   */
		  updateCommissionStatus(id: string, status: CommissionStatus): Commission | undefined {
		    if (status === 'Approved') return this.approveCommission(id);
		    if (status === 'Paid')     return this.payCommission(id);
		    // Reset to Draft: only clear approval/payment metadata; don't reverse a
		    // posted journal automatically — caller should use voidCommission.
		    const existing = this.getCommissionById(id);
		    if (!existing) return undefined;
		    this.db
		      .prepare('UPDATE commissions SET status = ? WHERE id = ?')
		      .run(status, id);
		    return this.getCommissionById(id);
		  }

		  /**
		   * Approve a Draft commission. Posts the accrual journal:
		   *   DR Commission Expense (5900)
		   *   CR Commissions Payable (2300)
		   * Idempotent — re-approving a row that's already Approved is a no-op.
		   */
		  approveCommission(id: string): Commission | undefined {
		    const existing = this.getCommissionById(id);
		    if (!existing) return undefined;
		    if (existing.status === 'Approved' || existing.status === 'Paid') {
		      return existing;
		    }
		    if (existing.status === 'Voided') {
		      throw new Error('Voided commissions cannot be re-approved.');
		    }
		    if (!existing.amount || existing.amount <= 0) {
		      throw new Error('Cannot approve a commission with zero amount.');
		    }

		    const now = new Date();
		    const actorUserId = this.currentActor?.userId ?? null;
		    this.db
		      .prepare(
		        `UPDATE commissions
		           SET status = 'Approved', approvedAt = ?, approvedByUserId = ?
		           WHERE id = ?`,
		      )
		      .run(now.toISOString(), actorUserId, id);

		    try {
		      this.postCommissionAccrualJournal(existing, now);
		    } catch (error) {
		      console.error('Failed to post commission accrual journal', error);
		    }

		    const result = this.getCommissionById(id);
		    if (result) {
		      this.createActivityEvent({
		        companyId: result.companyId,
		        entityType: 'commission',
		        entityId: result.id,
		        action: 'approved',
		        summary: `Commission approved for ${result.userName || 'user'} — ${result.amount}.`,
		        metadata: { amount: result.amount, sourceLabel: result.sourceLabel },
		      });
		    }
		    return result;
		  }

		  /**
		   * Mark an Approved commission as Paid. Posts the settlement journal:
		   *   DR Commissions Payable (2300)
		   *   CR Cash (1000)
		   * If called on a Draft row, the accrual is posted first so the books
		   * stay balanced.
		   */
		  payCommission(id: string): Commission | undefined {
		    const existing = this.getCommissionById(id);
		    if (!existing) return undefined;
		    if (existing.status === 'Paid') return existing;
		    if (existing.status === 'Voided') {
		      throw new Error('Voided commissions cannot be paid.');
		    }
		    if (!existing.amount || existing.amount <= 0) {
		      throw new Error('Cannot pay a commission with zero amount.');
		    }
		    // If somehow paying a Draft directly, post the accrual first.
		    if (existing.status === 'Draft') {
		      this.approveCommission(id);
		    }
		    const now = new Date();
		    const actorUserId = this.currentActor?.userId ?? null;
		    this.db
		      .prepare(
		        `UPDATE commissions
		           SET status = 'Paid', paidAt = ?, paidByUserId = ?
		           WHERE id = ?`,
		      )
		      .run(now.toISOString(), actorUserId, id);

		    try {
		      this.postCommissionPaymentJournal(existing, now);
		    } catch (error) {
		      console.error('Failed to post commission payment journal', error);
		    }

		    const result = this.getCommissionById(id);
		    if (result) {
		      this.createActivityEvent({
		        companyId: result.companyId,
		        entityType: 'commission',
		        entityId: result.id,
		        action: 'paid',
		        summary: `Commission paid to ${result.userName || 'user'} — ${result.amount}.`,
		        metadata: { amount: result.amount, sourceLabel: result.sourceLabel },
		      });
		    }
		    return result;
		  }

		  /**
		   * Void a commission. Posts reversing entries if any journals were
		   * previously posted, so the ledger ends up flat. Paid commissions
		   * reverse both the accrual and the payment.
		   */
		  voidCommission(id: string, reason?: string): Commission | undefined {
		    const existing = this.getCommissionById(id);
		    if (!existing) return undefined;
		    if (existing.status === 'Voided') return existing;
		    const wasApproved = existing.status === 'Approved' || existing.status === 'Paid';
		    const wasPaid = existing.status === 'Paid';
		    const now = new Date();
		    this.db
		      .prepare('UPDATE commissions SET status = ?, voidedAt = ? WHERE id = ?')
		      .run('Voided', now.toISOString(), id);

		    try {
		      if (wasApproved) {
		        // Reverse the accrual:  DR Payable / CR Expense
		        const expenseAcct = this.getSystemAccountId(existing.companyId, '5900');
		        const payableAcct = this.getSystemAccountId(existing.companyId, '2300');
		        this.createJournalEntry({
		          companyId: existing.companyId,
		          sourceType: 'commission_reversal',
		          sourceId: existing.id,
		          memo: `Commission ${existing.sourceLabel || existing.id} reversal (accrual)${reason ? ` — ${reason}` : ''}`,
		          entryDate: now,
		          lines: [
		            { id: uuid(), accountId: payableAcct, description: 'Reverse commission payable', debit: existing.amount, credit: 0 },
		            { id: uuid(), accountId: expenseAcct, description: 'Reverse commission expense', debit: 0, credit: existing.amount },
		          ],
		        });
		      }
		      if (wasPaid) {
		        // Reverse the payment:  DR Cash / CR Payable
		        const cashAcct = this.getSystemAccountId(existing.companyId, '1000');
		        const payableAcct = this.getSystemAccountId(existing.companyId, '2300');
		        this.createJournalEntry({
		          companyId: existing.companyId,
		          sourceType: 'commission_reversal',
		          sourceId: `${existing.id}:payment`,
		          memo: `Commission ${existing.sourceLabel || existing.id} reversal (payment)${reason ? ` — ${reason}` : ''}`,
		          entryDate: now,
		          lines: [
		            { id: uuid(), accountId: cashAcct, description: 'Reverse cash out', debit: existing.amount, credit: 0 },
		            { id: uuid(), accountId: payableAcct, description: 'Reverse commission payable', debit: 0, credit: existing.amount },
		          ],
		        });
		      }
		    } catch (error) {
		      console.error('Failed to post commission reversal journal', error);
		    }

		    const result = this.getCommissionById(id);
		    if (result) {
		      this.createActivityEvent({
		        companyId: result.companyId,
		        entityType: 'commission',
		        entityId: result.id,
		        action: 'voided',
		        summary: `Commission voided for ${result.userName || 'user'} — ${result.amount}.`,
		        metadata: { amount: result.amount, reason: reason ?? null },
		      });
		    }
		    return result;
		  }

		  private postCommissionAccrualJournal(commission: Commission, entryDate: Date) {
		    const existing = this.db
		      .prepare(
		        "SELECT id FROM journal_entries WHERE sourceType = 'commission_accrual' AND sourceId = ? LIMIT 1",
		      )
		      .get(commission.id) as { id?: string } | undefined;
		    if (existing?.id) return;
		    const expenseAcct = this.getSystemAccountId(commission.companyId, '5900');
		    const payableAcct = this.getSystemAccountId(commission.companyId, '2300');
		    this.createJournalEntry({
		      companyId: commission.companyId,
		      sourceType: 'commission_accrual',
		      sourceId: commission.id,
		      memo: `Commission accrual — ${commission.userName || 'user'} on ${commission.sourceLabel || ''}`,
		      entryDate,
		      lines: [
		        { id: uuid(), accountId: expenseAcct, description: 'Commission expense', debit: commission.amount, credit: 0 },
		        { id: uuid(), accountId: payableAcct, description: 'Commission payable', debit: 0, credit: commission.amount },
		      ],
		    });
		  }

  private postCommissionPaymentJournal(commission: Commission, entryDate: Date) {
		    const existing = this.db
		      .prepare(
		        "SELECT id FROM journal_entries WHERE sourceType = 'commission_payment' AND sourceId = ? LIMIT 1",
		      )
		      .get(commission.id) as { id?: string } | undefined;
		    if (existing?.id) return;
		    const cashAcct = this.getSystemAccountId(commission.companyId, '1000');
		    const payableAcct = this.getSystemAccountId(commission.companyId, '2300');
		    this.createJournalEntry({
		      companyId: commission.companyId,
		      sourceType: 'commission_payment',
		      sourceId: commission.id,
		      memo: `Commission payout — ${commission.userName || 'user'} on ${commission.sourceLabel || ''}`,
		      entryDate,
		      lines: [
		        { id: uuid(), accountId: payableAcct, description: 'Clear commission payable', debit: commission.amount, credit: 0 },
		        { id: uuid(), accountId: cashAcct, description: 'Cash paid out', debit: 0, credit: commission.amount },
		      ],
    });
  }

  private rollbackPaymentSensitiveCommissions(invoice: Invoice, opportunityId?: string) {
    const rows = this.db
      .prepare(
        `SELECT * FROM commissions
           WHERE basis IN ('Paid Amount', 'Profit')
             AND status != 'Voided'
             AND (invoiceId = ? OR (? IS NOT NULL AND opportunityId = ?))`,
      )
      .all(invoice.id, opportunityId ?? null, opportunityId ?? null) as any[];

    for (const row of rows) {
      const commission = this.decodeCommission(row);
      const previousStatus = commission.status;
      const previousAmount = commission.amount;
      this.removeJournalEntriesBySource('commission_accrual', commission.id);
      this.removeJournalEntriesBySource('commission_payment', commission.id);
      this.db
        .prepare(
          `UPDATE commissions
             SET status = 'Draft',
                 approvedAt = NULL,
                 paidAt = NULL,
                 voidedAt = NULL,
                 approvedByUserId = NULL,
                 paidByUserId = NULL
           WHERE id = ?`,
        )
        .run(commission.id);
      this.createActivityEvent({
        companyId: commission.companyId,
        entityType: 'commission',
        entityId: commission.id,
        action: 'payment_reversal_adjusted',
        summary: `Commission adjusted after payment reversal for ${invoice.invoiceNumber}.`,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          previousAmount,
          previousStatus,
        },
      });
    }
  }

  /**
   * Computes the basis amount for a commission rule applied to an
		   * opportunity. Handles the three documented basis types instead of
		   * silently using expectedRevenue for all of them.
		   *
		   * - Revenue:     opportunity.expectedRevenue (forecast); falls back to
		   *                the linked invoice total when a wonSalesOrder is set.
		   * - Paid Amount: sum of payments on the invoice linked via
		   *                opportunity.wonSalesOrderId. 0 if not yet invoiced/paid.
		   * - Profit:      Paid Amount minus campaign expenses & vendor bills
		   *                linked to the same invoice's campaign. 0 if no costs.
		   */
		  private computeCommissionBasisAmount(
		    opportunity: Opportunity,
		    basis: CommissionBasis,
		  ): number {
		    if (basis === 'Revenue') {
		      // Prefer the actual invoice total if billed; otherwise use forecast.
		      const invoice = this.getInvoiceForWonOpportunity(opportunity);
		      if (invoice) return Number(invoice.total || 0);
		      return Number(opportunity.expectedRevenue || 0);
		    }

		    if (basis === 'Paid Amount') {
		      const invoice = this.getInvoiceForWonOpportunity(opportunity);
		      if (!invoice) return 0;
		      return Number(this.getInvoicePaidAmount(invoice.id) || 0);
		    }

		    if (basis === 'Profit') {
		      const invoice = this.getInvoiceForWonOpportunity(opportunity);
		      if (!invoice) return 0;
		      const paid = Number(this.getInvoicePaidAmount(invoice.id) || 0);
		      const cost = this.getOpportunityCost(opportunity, invoice);
		      return Math.max(0, paid - cost);
		    }

		    return Number(opportunity.expectedRevenue || 0);
		  }

		  private getInvoiceForWonOpportunity(opportunity: Opportunity): Invoice | undefined {
		    // Preferred path: opportunity → won sales order → invoice.
		    if (opportunity.wonSalesOrderId) {
		      const so = this.getSalesOrderById(opportunity.wonSalesOrderId);
		      if (so?.invoiceId) {
		        const invoice = this.getInvoiceById(so.invoiceId);
		        if (invoice) return invoice;
		      }
		    }
		    // Fallback: a campaign tied to this opportunity may have generated an
		    // invoice directly (campaign invoices carry no salesOrderId).
		    const campaignRow = this.db
		      .prepare('SELECT invoiceId FROM crm_campaigns WHERE opportunityId = ? AND invoiceId IS NOT NULL ORDER BY updatedAt DESC LIMIT 1')
		      .get(opportunity.id) as { invoiceId?: string } | undefined;
		    if (campaignRow?.invoiceId) {
		      return this.getInvoiceById(campaignRow.invoiceId);
		    }
		    return undefined;
		  }

		  private getOpportunityCost(opportunity: Opportunity, invoice: Invoice): number {
		    let cost = 0;
		    if (invoice.campaignId) {
		      // Only count expenses that are actually recognised (Approved/Paid) —
		      // mirroring what hits the ledger. Draft/Submitted/Rejected don't count.
		      const expenses = this.db
		        .prepare("SELECT amount FROM campaign_expenses WHERE campaignId = ? AND status IN ('Approved', 'Paid')")
		        .all(invoice.campaignId) as Array<{ amount: number }>;
		      cost += expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
		      const vendorBills = this.db
		        .prepare('SELECT amount FROM vendor_bills WHERE campaignId = ? AND status != ?')
		        .all(invoice.campaignId, 'Draft') as Array<{ amount: number }>;
		      cost += vendorBills.reduce((s, b) => s + Number(b.amount || 0), 0);
		    }
		    return cost;
		  }

		  /**
		   * Find the opportunity linked to an invoice via the won-SO chain.
		   * Used by invoice / payment hooks to trigger commission recalc.
		   */
		  findOpportunityIdForInvoice(invoice: Invoice): string | undefined {
		    if (!invoice.salesOrderId) return undefined;
		    const row = this.db
		      .prepare('SELECT id FROM opportunities WHERE wonSalesOrderId = ? LIMIT 1')
		      .get(invoice.salesOrderId) as { id?: string } | undefined;
		    return row?.id;
		  }

		  calculateCommissionsForOpportunity(opportunityId: string): Commission[] {
	    const opportunity = this.getOpportunityById(opportunityId);
	    // Allow recalc beyond stage=Won so that triggers from InvoiceCreated /
	    // PaymentReceived can still adjust basis-driven amounts on opportunities
	    // that have already been won and progressed.
	    if (!opportunity) return [];
	    if (opportunity.stage !== 'Won') {
	      return [];
	    }
	    const ruleRow =
	      (this.db
	        .prepare('SELECT * FROM commission_rules WHERE companyId = ? AND serviceType = ? AND isActive = 1 LIMIT 1')
	        .get(opportunity.companyId, opportunity.serviceType) as any) ||
	      (this.db
	        .prepare('SELECT * FROM commission_rules WHERE companyId = ? AND serviceType = ? AND isActive = 1 LIMIT 1')
	        .get(opportunity.companyId, 'Default') as any);
	    if (!ruleRow || !opportunity.ownerUserId) return [];
	    const rule = this.decodeCommissionRule(ruleRow);
	    const basisAmount = this.computeCommissionBasisAmount(opportunity, rule.basis);
	    const amount =
	      rule.rateType === 'Fixed'
	        ? Number(rule.fixedAmount || rule.rate || 0)
	        : Number(((basisAmount * rule.rate) / 100).toFixed(2));
	    const calculatedAt = new Date().toISOString();
	    this.db
	      .prepare(
	        `INSERT INTO commissions
	          (id, companyId, opportunityId, contactId, userId, userName, serviceType, basis, basisAmount, amount, status, calculatedAt)
	         VALUES
	          (@id, @companyId, @opportunityId, @contactId, @userId, @userName, @serviceType, @basis, @basisAmount, @amount, 'Draft', @calculatedAt)
         ON CONFLICT(opportunityId, userId, serviceType)
         DO UPDATE SET basis=excluded.basis, basisAmount=excluded.basisAmount, amount=excluded.amount,
           status='Draft', calculatedAt=excluded.calculatedAt
         WHERE commissions.status = 'Draft'`,
	      )
	      .run({
	        id: uuid(),
	        companyId: opportunity.companyId,
	        opportunityId: opportunity.id,
	        contactId: opportunity.contactId,
	        userId: opportunity.ownerUserId,
	        userName: opportunity.ownerName ?? null,
	        serviceType: opportunity.serviceType,
	        basis: rule.basis,
	        basisAmount,
	        amount,
	        calculatedAt,
	      });
	    return this.listCommissions(opportunity.companyId).filter((item) => item.opportunityId === opportunity.id);
	  }

	  private contactToClient(c: Contact): Client {
	    if (c.clientId) {
	      const row = this.db.prepare('SELECT * FROM clients WHERE id = ?').get(c.clientId) as any;
	      if (row) {
	        return {
	          ...this.decodeClient(row),
	          name: c.name,
	          email: c.email || row.email,
	          address: c.address || row.address,
	          contactName: c.contactPerson ?? row.contactName ?? undefined,
	          phone: c.phone ?? row.phone ?? undefined,
	          vatNumber: c.taxNumber ?? row.vatNumber ?? undefined,
	          notes: c.notes ?? row.notes ?? undefined,
	        };
	      }
	    }
	    return {
      id: c.clientId || c.id,
      reference: c.clientId || c.id,
      name: c.name,
      email: c.email || '',
      address: c.address || '',
      companyId: c.companyId,
      contactName: c.contactPerson,
      phone: c.phone,
      vatNumber: c.taxNumber,
      notes: c.notes,
      status: 'Active',
    };
  }

	  private contactToSupplier(c: Contact): Supplier {
	    if (c.supplierId) {
	      const row = this.db.prepare('SELECT * FROM suppliers WHERE id = ?').get(c.supplierId) as any;
	      if (row) {
	        return {
	          ...this.decodeSupplier(row),
	          name: c.name,
	          contactName: c.contactPerson ?? row.contactName ?? undefined,
	          email: c.email ?? row.email ?? undefined,
	          phone: c.phone ?? row.phone ?? undefined,
	          notes: c.notes ?? row.notes ?? undefined,
	        };
	      }
	    }
	    return {
      id: c.supplierId || c.id,
      companyId: c.companyId,
      reference: c.supplierId || c.id,
      name: c.name,
      contactName: c.contactPerson,
      email: c.email,
      phone: c.phone,
      notes: c.notes,
      isActive: true,
    };
  }

  // ─── Clients ─────────────────────────────────────────────────────────────

  listClients(companyId: string): Client[] {
    const contacts = this.listContacts(companyId, 'Client');
    if (contacts.length > 0) return contacts.map((c) => this.contactToClient(c));
    const rows = this.db
      .prepare('SELECT * FROM clients WHERE companyId = ? ORDER BY name ASC')
      .all(companyId) as any[];
    return rows.map((row) => this.decodeClient(row));
  }

  getClientById(id: string): Client | undefined {
    const contactByClientId = (this.db
      .prepare(`SELECT c.*, GROUP_CONCAT(r.role) as roleList FROM contacts c LEFT JOIN contact_roles r ON r.contactId = c.id WHERE c.clientId = ? GROUP BY c.id`)
      .get(id) as any);
    if (contactByClientId) return this.contactToClient(this.decodeContact(contactByClientId));
    const contactById = (this.db
      .prepare(`SELECT c.*, GROUP_CONCAT(r.role) as roleList FROM contacts c LEFT JOIN contact_roles r ON r.contactId = c.id WHERE c.id = ? GROUP BY c.id`)
      .get(id) as any);
    if (contactById) return this.contactToClient(this.decodeContact(contactById));
    const row = this.db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as any;
    return row ? this.decodeClient(row) : undefined;
  }

  private getNumberingDataSource(entityType: NumberingEntityType): {
    table: 'clients' | 'suppliers' | 'inventory_items' | 'purchase_orders' | 'purchase_requisitions' | 'sales_orders' | 'vendor_bills' | 'invoices' | 'deliveries';
    column: 'reference' | 'sku' | 'orderNumber' | 'requisitionNumber' | 'billNumber' | 'invoiceNumber' | 'deliveryNumber';
  } {
    switch (entityType) {
      case 'client':
        return { table: 'clients', column: 'reference' };
      case 'supplier':
        return { table: 'suppliers', column: 'reference' };
      case 'inventory_item':
        return { table: 'inventory_items', column: 'sku' };
      case 'purchase_order':
        return { table: 'purchase_orders', column: 'orderNumber' };
      case 'purchase_requisition':
        return { table: 'purchase_requisitions', column: 'requisitionNumber' };
      case 'sales_order':
        return { table: 'sales_orders', column: 'orderNumber' };
      case 'sales_invoice':
        return { table: 'invoices', column: 'invoiceNumber' };
      case 'vendor_invoice':
        return { table: 'vendor_bills', column: 'billNumber' };
      case 'delivery':
        return { table: 'deliveries', column: 'deliveryNumber' };
    }
  }

  private decodeNumberingSetting(row: any): CompanyNumberingSetting {
    const nextNumber = Math.max(1, Number(row.nextNumber) || 1);
    const padLength = Math.max(1, Number(row.padLength) || 1);
    return {
      companyId: row.companyId,
      entityType: row.entityType as NumberingEntityType,
      prefix: row.prefix,
      padLength,
      nextNumber,
      sample: `${row.prefix}${String(nextNumber).padStart(padLength, '0')}`,
      updatedAt: new Date(row.updatedAt),
    };
  }

  private getRawNumberingSetting(companyId: string, entityType: NumberingEntityType) {
    const existing = this.db
      .prepare('SELECT * FROM company_numbering_settings WHERE companyId = ? AND entityType = ?')
      .get(companyId, entityType) as any;
    if (existing) return existing;

    const defaults = defaultNumberingSettings[entityType];
    const nowIso = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO company_numbering_settings (companyId, entityType, prefix, padLength, nextNumber, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(companyId, entityType, defaults.prefix, defaults.padLength, 1, nowIso);
    return {
      companyId,
      entityType,
      prefix: defaults.prefix,
      padLength: defaults.padLength,
      nextNumber: 1,
      updatedAt: nowIso,
    };
  }

  private getMaxExistingSequenceNumber(
    companyId: string,
    entityType: NumberingEntityType,
    prefix: string,
  ) {
    const source = this.getNumberingDataSource(entityType);
    const rows = this.db
      .prepare(`SELECT ${source.column} as value FROM ${source.table} WHERE companyId = ?`)
      .all(companyId) as Array<{ value: string | null }>;
    const matcher = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);
    return rows.reduce((max, row) => {
      const match = matcher.exec(String(row.value || '').trim());
      if (!match) return max;
      const value = Number(match[1]);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0);
  }

  private getEffectiveNumberingSetting(
    companyId: string,
    entityType: NumberingEntityType,
  ): CompanyNumberingSetting {
    const row = this.getRawNumberingSetting(companyId, entityType);
    const setting = this.decodeNumberingSetting(row);
    const maxExisting = this.getMaxExistingSequenceNumber(companyId, entityType, setting.prefix);
    if (setting.nextNumber <= maxExisting) {
      setting.nextNumber = maxExisting + 1;
      setting.sample = `${setting.prefix}${String(setting.nextNumber).padStart(setting.padLength, '0')}`;
    }
    return setting;
  }

  listCompanyNumberingSettings(companyId: string): CompanyNumberingSetting[] {
    return numberingEntityTypes.map((entityType) =>
      this.getEffectiveNumberingSetting(companyId, entityType),
    );
  }

  updateCompanyNumberingSetting(
    companyId: string,
    entityType: NumberingEntityType,
    updates: { prefix?: string; padLength?: number; nextNumber?: number },
  ): CompanyNumberingSetting {
    this.getRawNumberingSetting(companyId, entityType);
    const existing = this.getEffectiveNumberingSetting(companyId, entityType);
    const prefix = updates.prefix !== undefined ? updates.prefix.trim() : existing.prefix;
    if (!prefix) {
      throw new Error('Prefix is required.');
    }
    const padLength =
      updates.padLength === undefined ? existing.padLength : Math.trunc(Number(updates.padLength));
    const nextNumber =
      updates.nextNumber === undefined ? existing.nextNumber : Math.trunc(Number(updates.nextNumber));
    if (!Number.isFinite(padLength) || padLength < 1 || padLength > 12) {
      throw new Error('Pad length must be between 1 and 12.');
    }
    if (!Number.isFinite(nextNumber) || nextNumber < 1) {
      throw new Error('Next number must be at least 1.');
    }

    this.db
      .prepare(
        'UPDATE company_numbering_settings SET prefix = ?, padLength = ?, nextNumber = ?, updatedAt = ? WHERE companyId = ? AND entityType = ?',
      )
      .run(prefix, padLength, nextNumber, new Date().toISOString(), companyId, entityType);

    return this.getEffectiveNumberingSetting(companyId, entityType);
  }

  private decodeCompanyFinanceSettings(row: any): CompanyFinanceSettings {
    return {
      companyId: row.companyId,
      fiscalYearStartMonth: Math.min(12, Math.max(1, Number(row.fiscalYearStartMonth) || 1)),
      lockedThroughDate: row.lockedThroughDate ? new Date(row.lockedThroughDate) : undefined,
      currencyCode: String(row.currencyCode || 'USD').toUpperCase(),
      poApprovalThreshold: Math.max(0, Number(row.poApprovalThreshold) || 0),
      updatedAt: new Date(row.updatedAt),
    };
  }

  getCompanyFinanceSettings(companyId: string): CompanyFinanceSettings {
    this.ensureCompanyFinanceSettings();
    const row = this.db
      .prepare('SELECT * FROM company_finance_settings WHERE companyId = ?')
      .get(companyId) as any;
    if (row) return this.decodeCompanyFinanceSettings(row);
    const nowIso = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO company_finance_settings (companyId, fiscalYearStartMonth, lockedThroughDate, currencyCode, updatedAt) VALUES (?, ?, ?, ?, ?)',
      )
      .run(companyId, 1, null, 'USD', nowIso);
    return {
      companyId,
      fiscalYearStartMonth: 1,
      currencyCode: 'USD',
      poApprovalThreshold: 0,
      updatedAt: new Date(nowIso),
    };
  }

  updateCompanyFinanceSettings(
    companyId: string,
    updates: { fiscalYearStartMonth?: number; lockedThroughDate?: Date | null; currencyCode?: string; poApprovalThreshold?: number },
  ): CompanyFinanceSettings {
    const existing = this.getCompanyFinanceSettings(companyId);
    const fiscalYearStartMonth =
      updates.fiscalYearStartMonth === undefined
        ? existing.fiscalYearStartMonth
        : Math.trunc(Number(updates.fiscalYearStartMonth));
    if (!Number.isFinite(fiscalYearStartMonth) || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) {
      throw new Error('Fiscal year start month must be between 1 and 12.');
    }

    const lockedThroughDate =
      updates.lockedThroughDate === undefined
        ? existing.lockedThroughDate
        : updates.lockedThroughDate === null
          ? undefined
          : updates.lockedThroughDate;
    const currencyCode = updates.currencyCode === undefined
      ? existing.currencyCode
      : String(updates.currencyCode || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currencyCode)) {
      throw new Error('Currency code must be a valid 3-letter ISO code.');
    }

    const poApprovalThreshold =
      updates.poApprovalThreshold === undefined
        ? existing.poApprovalThreshold
        : Math.max(0, Number(updates.poApprovalThreshold) || 0);

    this.db
      .prepare(
        'UPDATE company_finance_settings SET fiscalYearStartMonth = ?, lockedThroughDate = ?, currencyCode = ?, poApprovalThreshold = ?, updatedAt = ? WHERE companyId = ?',
      )
      .run(
        fiscalYearStartMonth,
        lockedThroughDate ? lockedThroughDate.toISOString() : null,
        currencyCode,
        poApprovalThreshold,
        new Date().toISOString(),
        companyId,
      );
    return this.getCompanyFinanceSettings(companyId);
  }

  private decodeInvoiceTemplate(row: any): InvoiceTemplate {
    return {
      id: row.id,
      companyId: row.companyId,
      name: row.name,
      docType: row.docType === 'delivery' ? 'delivery' : 'invoice',
      layout: invoiceTemplateLayouts.includes(row.layout) ? row.layout : 'classic',
      isDefault: Boolean(row.isDefault),
      primaryColor: row.primaryColor || '#111827',
      accentColor: row.accentColor || '#2563eb',
      logoUrl: row.logoUrl ?? undefined,
      headerImageUrl: row.headerImageUrl ?? undefined,
      footerImageUrl: row.footerImageUrl ?? undefined,
      letterheadPdfUrl: row.letterheadPdfUrl ?? undefined,
      letterheadImageUrl: row.letterheadImageUrl ?? undefined,
      stampUrl: row.stampUrl ?? undefined,
      signatureUrl: row.signatureUrl ?? undefined,
      signatureLabel: row.signatureLabel ?? undefined,
      paymentInstructions: row.paymentInstructions ?? undefined,
      terms: row.terms ?? undefined,
      footerNote: row.footerNote ?? undefined,
      watermarkEnabled: row.watermarkEnabled === undefined ? false : Boolean(row.watermarkEnabled),
      watermarkText: row.watermarkText ?? undefined,
      watermarkOpacity: Number.isFinite(Number(row.watermarkOpacity)) ? Number(row.watermarkOpacity) : 0.12,
      showCompanyAddress: row.showCompanyAddress === undefined ? true : Boolean(row.showCompanyAddress),
      showTaxId: row.showTaxId === undefined ? true : Boolean(row.showTaxId),
      columns: row.invoiceColumns ? this.parseJson<InvoiceColumn[]>(row.invoiceColumns) ?? undefined : undefined,
      bankAccounts: row.bankAccounts ? this.parseJson<InvoiceBankAccount[]>(row.bankAccounts) ?? undefined : undefined,
      qrEnabled: row.qrEnabled === undefined ? true : Boolean(row.qrEnabled),
      qrPosition: (['left', 'center', 'right'].includes(row.qrPosition) ? row.qrPosition : 'center') as InvoiceTemplate['qrPosition'],
      sectionBreaks: row.sectionBreaks ? this.parseJson<InvoiceTemplate['sectionBreaks']>(row.sectionBreaks) ?? undefined : undefined,
      doc: row.doc ? this.parseJson<unknown>(row.doc) ?? undefined : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  listInvoiceTemplates(companyId: string, docType: 'invoice' | 'delivery' = 'invoice'): InvoiceTemplate[] {
    this.ensureInvoiceTemplateDefaults();
    const rows = this.db
      .prepare(
        `SELECT * FROM invoice_templates WHERE companyId = ? AND COALESCE(docType, 'invoice') = ? ORDER BY isDefault DESC, name ASC`,
      )
      .all(companyId, docType) as any[];
    return rows.map((row) => this.decodeInvoiceTemplate(row));
  }

  getInvoiceTemplateById(id: string): InvoiceTemplate | undefined {
    const row = this.db.prepare('SELECT * FROM invoice_templates WHERE id = ?').get(id) as any;
    return row ? this.decodeInvoiceTemplate(row) : undefined;
  }

  /**
   * Resolve the template an invoice will actually render with, using the same
   * precedence as the renderer (explicit template → company default → first).
   * Used to freeze a snapshot onto the invoice so later template edits never
   * change how an already-issued invoice looks.
   */
  resolveInvoiceTemplateSnapshot(companyId: string, templateId?: string): InvoiceTemplate | undefined {
    const templates = this.listInvoiceTemplates(companyId);
    return (
      (templateId ? templates.find((t) => t.id === templateId) : undefined) ??
      templates.find((t) => t.isDefault) ??
      templates[0]
    );
  }

  createInvoiceTemplate(template: CreateInvoiceTemplateInput): InvoiceTemplate {
    const nowIso = new Date().toISOString();
    const newTemplate: InvoiceTemplate = {
      ...template,
      id: uuid(),
      layout: invoiceTemplateLayouts.includes(template.layout) ? template.layout : 'classic',
      primaryColor: template.primaryColor || '#111827',
      accentColor: template.accentColor || '#2563eb',
      watermarkEnabled: template.watermarkEnabled === true,
      watermarkText: template.watermarkText || 'DRAFT',
      watermarkOpacity: Number.isFinite(Number(template.watermarkOpacity))
        ? Math.max(0.05, Math.min(0.4, Number(template.watermarkOpacity)))
        : 0.12,
      showCompanyAddress: template.showCompanyAddress !== false,
      showTaxId: template.showTaxId !== false,
      createdAt: new Date(nowIso),
      updatedAt: new Date(nowIso),
    };

    const trx = this.db.transaction(() => {
      if (newTemplate.isDefault) {
        this.db
          .prepare('UPDATE invoice_templates SET isDefault = 0, updatedAt = ? WHERE companyId = ?')
          .run(nowIso, newTemplate.companyId);
      }
      this.db
        .prepare(
          `INSERT INTO invoice_templates (
            id, companyId, name, docType, layout, isDefault, primaryColor, accentColor,
            logoUrl, headerImageUrl, footerImageUrl, letterheadPdfUrl, letterheadImageUrl,
            stampUrl, signatureUrl, signatureLabel, invoiceColumns, bankAccounts, qrEnabled, qrPosition, sectionBreaks, doc,
            paymentInstructions, terms, footerNote, watermarkEnabled, watermarkText, watermarkOpacity, showCompanyAddress, showTaxId,
            createdAt, updatedAt
          ) VALUES (
            @id, @companyId, @name, @docType, @layout, @isDefault, @primaryColor, @accentColor,
            @logoUrl, @headerImageUrl, @footerImageUrl, @letterheadPdfUrl, @letterheadImageUrl,
            @stampUrl, @signatureUrl, @signatureLabel, @invoiceColumns, @bankAccounts, @qrEnabled, @qrPosition, @sectionBreaks, @doc,
            @paymentInstructions, @terms, @footerNote, @watermarkEnabled, @watermarkText, @watermarkOpacity, @showCompanyAddress, @showTaxId,
            @createdAt, @updatedAt
          )`,
        )
        .run({
          ...newTemplate,
          docType: newTemplate.docType === 'delivery' ? 'delivery' : 'invoice',
          isDefault: newTemplate.isDefault ? 1 : 0,
          logoUrl: newTemplate.logoUrl ?? null,
          headerImageUrl: newTemplate.headerImageUrl ?? null,
          footerImageUrl: newTemplate.footerImageUrl ?? null,
          letterheadPdfUrl: newTemplate.letterheadPdfUrl ?? null,
          letterheadImageUrl: newTemplate.letterheadImageUrl ?? null,
          stampUrl: newTemplate.stampUrl ?? null,
          signatureUrl: newTemplate.signatureUrl ?? null,
          signatureLabel: newTemplate.signatureLabel ?? null,
          invoiceColumns: newTemplate.columns ? JSON.stringify(newTemplate.columns) : null,
          bankAccounts: newTemplate.bankAccounts ? JSON.stringify(newTemplate.bankAccounts) : null,
          qrEnabled: newTemplate.qrEnabled === false ? 0 : 1,
          qrPosition: newTemplate.qrPosition ?? 'center',
          sectionBreaks: newTemplate.sectionBreaks ? JSON.stringify(newTemplate.sectionBreaks) : null,
          doc: newTemplate.doc ? JSON.stringify(newTemplate.doc) : null,
          paymentInstructions: newTemplate.paymentInstructions ?? null,
          terms: newTemplate.terms ?? null,
          footerNote: newTemplate.footerNote ?? null,
          watermarkEnabled: newTemplate.watermarkEnabled ? 1 : 0,
          watermarkText: newTemplate.watermarkText ?? null,
          watermarkOpacity: newTemplate.watermarkOpacity ?? 0.12,
          showCompanyAddress: newTemplate.showCompanyAddress ? 1 : 0,
          showTaxId: newTemplate.showTaxId ? 1 : 0,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
    });
    trx();

    return this.getInvoiceTemplateById(newTemplate.id) ?? newTemplate;
  }

  updateInvoiceTemplate(
    id: string,
    updates: Partial<Omit<InvoiceTemplate, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>,
  ): InvoiceTemplate | undefined {
    const existing = this.getInvoiceTemplateById(id);
    if (!existing) return undefined;
    const nowIso = new Date().toISOString();
    const merged: InvoiceTemplate = {
      ...existing,
      ...updates,
      layout: updates.layout && invoiceTemplateLayouts.includes(updates.layout) ? updates.layout : existing.layout,
      primaryColor: updates.primaryColor || existing.primaryColor,
      accentColor: updates.accentColor || existing.accentColor,
      watermarkEnabled: updates.watermarkEnabled ?? existing.watermarkEnabled,
      watermarkText: updates.watermarkText ?? existing.watermarkText,
      watermarkOpacity: updates.watermarkOpacity === undefined
        ? existing.watermarkOpacity
        : Math.max(0.05, Math.min(0.4, Number(updates.watermarkOpacity))),
      showCompanyAddress: updates.showCompanyAddress ?? existing.showCompanyAddress,
      showTaxId: updates.showTaxId ?? existing.showTaxId,
      updatedAt: new Date(nowIso),
    };

    const trx = this.db.transaction(() => {
      if (merged.isDefault) {
        this.db
          .prepare('UPDATE invoice_templates SET isDefault = 0, updatedAt = ? WHERE companyId = ? AND id != ?')
          .run(nowIso, existing.companyId, id);
      }
      this.db
        .prepare(
          `UPDATE invoice_templates SET
            name=@name, layout=@layout, isDefault=@isDefault, primaryColor=@primaryColor,
            accentColor=@accentColor, logoUrl=@logoUrl, headerImageUrl=@headerImageUrl,
            footerImageUrl=@footerImageUrl, letterheadPdfUrl=@letterheadPdfUrl, letterheadImageUrl=@letterheadImageUrl,
            stampUrl=@stampUrl, signatureUrl=@signatureUrl, signatureLabel=@signatureLabel,
            invoiceColumns=@invoiceColumns, bankAccounts=@bankAccounts, qrEnabled=@qrEnabled, qrPosition=@qrPosition, sectionBreaks=@sectionBreaks, doc=@doc,
            paymentInstructions=@paymentInstructions, terms=@terms, footerNote=@footerNote, watermarkEnabled=@watermarkEnabled,
            watermarkText=@watermarkText, watermarkOpacity=@watermarkOpacity,
            showCompanyAddress=@showCompanyAddress, showTaxId=@showTaxId, updatedAt=@updatedAt
          WHERE id=@id`,
        )
        .run({
          ...merged,
          id,
          isDefault: merged.isDefault ? 1 : 0,
          logoUrl: merged.logoUrl ?? null,
          headerImageUrl: merged.headerImageUrl ?? null,
          footerImageUrl: merged.footerImageUrl ?? null,
          letterheadPdfUrl: merged.letterheadPdfUrl ?? null,
          letterheadImageUrl: merged.letterheadImageUrl ?? null,
          stampUrl: merged.stampUrl ?? null,
          signatureUrl: merged.signatureUrl ?? null,
          signatureLabel: merged.signatureLabel ?? null,
          invoiceColumns: merged.columns ? JSON.stringify(merged.columns) : null,
          bankAccounts: merged.bankAccounts ? JSON.stringify(merged.bankAccounts) : null,
          qrEnabled: merged.qrEnabled === false ? 0 : 1,
          qrPosition: merged.qrPosition ?? 'center',
          sectionBreaks: merged.sectionBreaks ? JSON.stringify(merged.sectionBreaks) : null,
          doc: merged.doc ? JSON.stringify(merged.doc) : null,
          paymentInstructions: merged.paymentInstructions ?? null,
          terms: merged.terms ?? null,
          footerNote: merged.footerNote ?? null,
          watermarkEnabled: merged.watermarkEnabled ? 1 : 0,
          watermarkText: merged.watermarkText ?? null,
          watermarkOpacity: merged.watermarkOpacity ?? 0.12,
          showCompanyAddress: merged.showCompanyAddress ? 1 : 0,
          showTaxId: merged.showTaxId ? 1 : 0,
          updatedAt: nowIso,
        });
    });
    trx();

    return this.getInvoiceTemplateById(id);
  }

  deleteInvoiceTemplate(id: string): boolean {
    const existing = this.getInvoiceTemplateById(id);
    if (!existing) return false;
    const templateCount = this.db
      .prepare('SELECT COUNT(*) as count FROM invoice_templates WHERE companyId = ?')
      .get(existing.companyId) as { count: number };
    if (templateCount.count <= 1) {
      throw new Error('At least one invoice template is required.');
    }
    this.db.prepare('UPDATE invoices SET templateId = NULL WHERE templateId = ?').run(id);
    this.db.prepare('DELETE FROM invoice_templates WHERE id = ?').run(id);
    if (existing.isDefault) {
      const replacement = this.db
        .prepare('SELECT id FROM invoice_templates WHERE companyId = ? ORDER BY name ASC LIMIT 1')
        .get(existing.companyId) as { id: string } | undefined;
      if (replacement) {
        this.updateInvoiceTemplate(replacement.id, { isDefault: true });
      }
    }
    return true;
  }

  private assertOpenFinancialDate(companyId: string, date: Date, label = 'Transaction date') {
    const settings = this.getCompanyFinanceSettings(companyId);
    if (!settings.lockedThroughDate) return;
    if (date.getTime() <= settings.lockedThroughDate.getTime()) {
      throw new Error(
        `${label} falls in a locked accounting period. Unlock the period or use a later date.`,
      );
    }
  }

  private nextConfiguredSequenceValue(companyId: string, entityType: NumberingEntityType) {
    const setting = this.getEffectiveNumberingSetting(companyId, entityType);
    const value = `${setting.prefix}${String(setting.nextNumber).padStart(setting.padLength, '0')}`;
    this.db
      .prepare(
        'UPDATE company_numbering_settings SET nextNumber = ?, updatedAt = ? WHERE companyId = ? AND entityType = ?',
      )
      .run(setting.nextNumber + 1, new Date().toISOString(), companyId, entityType);
    return value;
  }

  private nextClientReference(companyId: string) {
    return this.nextConfiguredSequenceValue(companyId, 'client');
  }

  private nextSupplierReference(companyId: string) {
    return this.nextConfiguredSequenceValue(companyId, 'supplier');
  }

  private nextInventorySku(companyId: string) {
    return this.nextConfiguredSequenceValue(companyId, 'inventory_item');
  }

  private nextPurchaseOrderNumber(companyId: string) {
    return this.nextConfiguredSequenceValue(companyId, 'purchase_order');
  }

  private nextSalesOrderNumber(companyId: string) {
    return this.nextConfiguredSequenceValue(companyId, 'sales_order');
  }

  private nextSalesInvoiceNumber(companyId: string) {
    return this.nextConfiguredSequenceValue(companyId, 'sales_invoice');
  }

  private nextVendorInvoiceNumber(companyId: string) {
    return this.nextConfiguredSequenceValue(companyId, 'vendor_invoice');
  }

  createClient(client: CreateClientInput): Client {
    const newClient: Client = {
      ...client,
      id: uuid(),
      reference: this.nextClientReference(client.companyId),
      contactName: client.contactName ?? undefined,
      phone: client.phone ?? undefined,
      vatNumber: client.vatNumber ?? undefined,
      creditLimit:
        client.creditLimit === undefined || client.creditLimit === null
          ? undefined
          : Number(client.creditLimit),
      creditNumber: client.creditNumber ?? undefined,
      paymentMethod: client.paymentMethod ?? undefined,
      status: client.status ?? 'Active',
      notes: client.notes ?? undefined,
    };
    this.db
      .prepare(
        'INSERT INTO clients (id, reference, name, email, address, companyId, contactName, phone, vatNumber, creditLimit, creditNumber, paymentMethod, status, notes) VALUES (@id, @reference, @name, @email, @address, @companyId, @contactName, @phone, @vatNumber, @creditLimit, @creditNumber, @paymentMethod, @status, @notes)',
      )
      .run({
        ...newClient,
        contactName: newClient.contactName ?? null,
        phone: newClient.phone ?? null,
        vatNumber: newClient.vatNumber ?? null,
        creditLimit: newClient.creditLimit ?? null,
        creditNumber: newClient.creditNumber ?? null,
        paymentMethod: newClient.paymentMethod ?? null,
        status: newClient.status ?? null,
        notes: newClient.notes ?? null,
      });
	    this.createActivityEvent({
	      companyId: newClient.companyId,
      entityType: 'client',
      entityId: newClient.id,
      action: 'created',
      summary: `Client ${newClient.name} created.`,
      metadata: { status: newClient.status },
	    });
	    this.createContact({
	      companyId: newClient.companyId,
	      kind: 'Organization',
	      name: newClient.name,
	      email: newClient.email,
	      address: newClient.address,
	      contactPerson: newClient.contactName,
	      phone: newClient.phone,
	      taxNumber: newClient.vatNumber,
	      notes: newClient.notes,
	      roles: ['Client'],
	      clientId: newClient.id,
	    });
	    return newClient;
	  }

  updateClient(id: string, updates: Partial<Omit<Client, 'id'>>) {
    const existing = this.db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as any;
    if (!existing) return undefined;
    const updated = {
      ...existing,
      name: updates.name ?? existing.name,
      email: updates.email ?? existing.email,
      address: updates.address ?? existing.address,
      companyId: updates.companyId ?? existing.companyId,
      contactName: updates.contactName ?? existing.contactName ?? null,
      phone: updates.phone ?? existing.phone ?? null,
      vatNumber: updates.vatNumber ?? existing.vatNumber ?? null,
      creditLimit:
        updates.creditLimit === undefined ? existing.creditLimit ?? null : updates.creditLimit,
      creditNumber: updates.creditNumber ?? existing.creditNumber ?? null,
      paymentMethod: updates.paymentMethod ?? existing.paymentMethod ?? null,
      status: updates.status ?? existing.status ?? 'Active',
      notes: updates.notes ?? existing.notes ?? null,
    };
    this.db
      .prepare(
        'UPDATE clients SET name=@name, email=@email, address=@address, companyId=@companyId, contactName=@contactName, phone=@phone, vatNumber=@vatNumber, creditLimit=@creditLimit, creditNumber=@creditNumber, paymentMethod=@paymentMethod, status=@status, notes=@notes WHERE id=@id',
      )
      .run(updated);
    const result = this.decodeClient(updated);
    this.createActivityEvent({
      companyId: result.companyId,
      entityType: 'client',
      entityId: result.id,
      action: 'updated',
      summary: `Client ${result.name} updated.`,
      metadata: { status: result.status },
    });
    return result;
  }

  listSuppliers(companyId: string): Supplier[] {
    const contacts = this.listContacts(companyId, 'Vendor');
    if (contacts.length > 0) return contacts.map((c) => this.contactToSupplier(c));
    const rows = this.db
      .prepare('SELECT * FROM suppliers WHERE companyId = ? ORDER BY name ASC')
      .all(companyId) as any[];
    return rows.map((row) => this.decodeSupplier(row));
  }

  getSupplierById(id: string): Supplier | undefined {
    const contactBySupplierId = (this.db
      .prepare(`SELECT c.*, GROUP_CONCAT(r.role) as roleList FROM contacts c LEFT JOIN contact_roles r ON r.contactId = c.id WHERE c.supplierId = ? GROUP BY c.id`)
      .get(id) as any);
    if (contactBySupplierId) return this.contactToSupplier(this.decodeContact(contactBySupplierId));
    const contactById = (this.db
      .prepare(`SELECT c.*, GROUP_CONCAT(r.role) as roleList FROM contacts c LEFT JOIN contact_roles r ON r.contactId = c.id WHERE c.id = ? GROUP BY c.id`)
      .get(id) as any);
    if (contactById) return this.contactToSupplier(this.decodeContact(contactById));
    const row = this.db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id) as any;
    return row ? this.decodeSupplier(row) : undefined;
  }

  createSupplier(input: CreateSupplierInput): Supplier {
    const supplier: Supplier = {
      ...input,
      id: uuid(),
      reference: this.nextSupplierReference(input.companyId),
      isActive: input.isActive ?? true,
      paymentTermsDays:
        input.paymentTermsDays === undefined || input.paymentTermsDays === null
          ? undefined
          : Number(input.paymentTermsDays),
    };

    this.db
      .prepare(
        'INSERT INTO suppliers (id, companyId, reference, name, contactName, email, phone, paymentTermsDays, notes, isActive) VALUES (@id, @companyId, @reference, @name, @contactName, @email, @phone, @paymentTermsDays, @notes, @isActive)',
      )
      .run({
        ...supplier,
        contactName: supplier.contactName ?? null,
        email: supplier.email ?? null,
        phone: supplier.phone ?? null,
        paymentTermsDays: supplier.paymentTermsDays ?? null,
        notes: supplier.notes ?? null,
        isActive: supplier.isActive ? 1 : 0,
      });

	    this.createActivityEvent({
	      companyId: supplier.companyId,
      entityType: 'supplier',
      entityId: supplier.id,
      action: 'created',
	      summary: `Supplier ${supplier.name} created.`,
	    });
	    this.createContact({
	      companyId: supplier.companyId,
	      kind: 'Organization',
	      name: supplier.name,
	      contactPerson: supplier.contactName,
	      email: supplier.email,
	      phone: supplier.phone,
	      notes: supplier.notes,
	      roles: ['Vendor'],
	      supplierId: supplier.id,
	    });

	    return supplier;
	  }

  listInventoryItems(companyId: string): InventoryItem[] {
    const rows = this.db
      .prepare('SELECT * FROM inventory_items WHERE companyId = ? ORDER BY name ASC')
      .all(companyId) as any[];
    return rows.map((row) => this.decodeInventoryItem(row));
  }

  getInventoryItemById(id: string): InventoryItem | undefined {
    const row = this.db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id) as any;
    return row ? this.decodeInventoryItem(row) : undefined;
  }

  getInventoryItemBySku(companyId: string, sku: string): InventoryItem | undefined {
    const row = this.db
      .prepare('SELECT * FROM inventory_items WHERE companyId = ? AND sku = ? LIMIT 1')
      .get(companyId, sku) as any;
    return row ? this.decodeInventoryItem(row) : undefined;
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  private decodeWarehouse(row: any): Warehouse {
    return {
      id: row.id,
      companyId: row.companyId,
      name: row.name,
      code: row.code ?? undefined,
      address: row.address ?? undefined,
      isDefault: Boolean(row.isDefault),
      isActive: Boolean(row.isActive),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  listWarehouses(companyId: string): Warehouse[] {
    const rows = this.db
      .prepare('SELECT * FROM warehouses WHERE companyId = ? ORDER BY isDefault DESC, name ASC')
      .all(companyId) as any[];
    return rows.map((r) => this.decodeWarehouse(r));
  }

  getWarehouseById(id: string): Warehouse | undefined {
    const row = this.db.prepare('SELECT * FROM warehouses WHERE id = ?').get(id) as any;
    return row ? this.decodeWarehouse(row) : undefined;
  }

  getWarehouseByName(companyId: string, name: string): Warehouse | undefined {
    const row = this.db
      .prepare('SELECT * FROM warehouses WHERE companyId = ? AND name = ?')
      .get(companyId, String(name || '').trim()) as any;
    return row ? this.decodeWarehouse(row) : undefined;
  }

  /** The company's default warehouse (explicit default, else the first active one). */
  getDefaultWarehouse(companyId: string): Warehouse | undefined {
    const active = this.listWarehouses(companyId).filter((w) => w.isActive);
    return active.find((w) => w.isDefault) ?? active[0];
  }

  /**
   * Resolve where incoming stock (e.g. a PO receipt) should land: the preferred
   * location if it's an active warehouse, otherwise the company default. Keeps
   * received stock inside managed warehouses instead of orphan locations.
   */
  resolveStockLocation(companyId: string, preferred?: string | null): string {
    const value = (preferred ?? '').trim();
    if (value && this.isActiveWarehouse(companyId, value)) return value;
    return this.getDefaultWarehouse(companyId)?.name ?? this.normalizeInventoryLocation(preferred);
  }

  /** Enforcement helper: is this location a registered, active warehouse? */
  isActiveWarehouse(companyId: string, name: string): boolean {
    const row = this.db
      .prepare('SELECT isActive FROM warehouses WHERE companyId = ? AND name = ?')
      .get(companyId, String(name || '').trim()) as any;
    return Boolean(row && row.isActive);
  }

  createWarehouse(input: {
    companyId: string;
    name: string;
    code?: string;
    address?: string;
    isDefault?: boolean;
    isActive?: boolean;
  }): Warehouse {
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Warehouse name is required.');
    if (this.getWarehouseByName(input.companyId, name)) {
      throw new Error(`A warehouse named "${name}" already exists.`);
    }
    const now = new Date().toISOString();
    const id = uuid();
    const tx = this.db.transaction(() => {
      if (input.isDefault) {
        this.db.prepare('UPDATE warehouses SET isDefault = 0 WHERE companyId = ?').run(input.companyId);
      }
      this.db
        .prepare(
          `INSERT INTO warehouses (id, companyId, name, code, address, isDefault, isActive, createdAt, updatedAt)
           VALUES (@id, @companyId, @name, @code, @address, @isDefault, @isActive, @now, @now)`,
        )
        .run({
          id,
          companyId: input.companyId,
          name,
          code: input.code ?? null,
          address: input.address ?? null,
          isDefault: input.isDefault ? 1 : 0,
          isActive: input.isActive === false ? 0 : 1,
          now,
        });
    });
    tx();
    return this.getWarehouseById(id)!;
  }

  updateWarehouse(
    id: string,
    updates: { name?: string; code?: string; address?: string; isDefault?: boolean; isActive?: boolean },
  ): Warehouse | undefined {
    const existing = this.getWarehouseById(id);
    if (!existing) return undefined;
    const now = new Date().toISOString();
    const newName = updates.name !== undefined ? String(updates.name).trim() : existing.name;
    if (!newName) throw new Error('Warehouse name is required.');
    const renamed = newName !== existing.name;
    if (renamed) {
      const clash = this.getWarehouseByName(existing.companyId, newName);
      if (clash && clash.id !== id) throw new Error(`A warehouse named "${newName}" already exists.`);
    }
    const tx = this.db.transaction(() => {
      if (updates.isDefault === true) {
        this.db.prepare('UPDATE warehouses SET isDefault = 0 WHERE companyId = ?').run(existing.companyId);
      }
      this.db
        .prepare(
          `UPDATE warehouses SET name=@name, code=@code, address=@address, isDefault=@isDefault, isActive=@isActive, updatedAt=@now WHERE id=@id`,
        )
        .run({
          id,
          name: newName,
          code: updates.code !== undefined ? updates.code || null : existing.code ?? null,
          address: updates.address !== undefined ? updates.address || null : existing.address ?? null,
          isDefault: updates.isDefault !== undefined ? (updates.isDefault ? 1 : 0) : existing.isDefault ? 1 : 0,
          isActive: updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : existing.isActive ? 1 : 0,
          now,
        });
      // A rename cascades to every place the old name is used as a location key.
      if (renamed) {
        const p = [newName, existing.companyId, existing.name] as const;
        this.db.prepare('UPDATE inventory_location_balances SET location = ? WHERE companyId = ? AND location = ?').run(...p);
        this.db.prepare('UPDATE inventory_issues SET location = ? WHERE companyId = ? AND location = ?').run(...p);
        this.db.prepare('UPDATE inventory_transfers SET fromLocation = ? WHERE companyId = ? AND fromLocation = ?').run(...p);
        this.db.prepare('UPDATE inventory_transfers SET toLocation = ? WHERE companyId = ? AND toLocation = ?').run(...p);
        this.db.prepare('UPDATE inventory_items SET location = ? WHERE companyId = ? AND location = ?').run(...p);
      }
    });
    tx();
    return this.getWarehouseById(id)!;
  }

  deleteWarehouse(id: string): boolean {
    const existing = this.getWarehouseById(id);
    if (!existing) return false;
    const stock = this.db
      .prepare('SELECT COALESCE(SUM(quantity),0) AS q FROM inventory_location_balances WHERE companyId = ? AND location = ?')
      .get(existing.companyId, existing.name) as any;
    if (Number(stock?.q || 0) > 0) {
      throw new Error('Cannot delete a warehouse that still holds stock. Move or issue it first.');
    }
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM warehouses WHERE id = ?').run(id);
      // Drop any leftover zero-quantity balance rows for this location.
      this.db.prepare('DELETE FROM inventory_location_balances WHERE companyId = ? AND location = ?').run(existing.companyId, existing.name);
    });
    tx();
    return true;
  }

  listInventoryLocationBalances(
    companyId: string,
    inventoryItemId?: string,
  ): InventoryLocationBalance[] {
    const rows = inventoryItemId
      ? (this.db
          .prepare(
            'SELECT * FROM inventory_location_balances WHERE companyId = ? AND inventoryItemId = ? ORDER BY quantity DESC, location ASC',
          )
          .all(companyId, inventoryItemId) as any[])
      : (this.db
          .prepare(
            'SELECT * FROM inventory_location_balances WHERE companyId = ? ORDER BY inventoryItemId ASC, quantity DESC, location ASC',
          )
          .all(companyId) as any[]);
    return rows.map((row) => this.decodeInventoryLocationBalance(row));
  }

  private normalizeInventoryLocation(location?: string | null): string {
    const normalized = String(location || '').trim();
    return normalized || 'Unassigned';
  }

  private getLocationBalance(
    companyId: string,
    inventoryItemId: string,
    location: string,
  ): InventoryLocationBalance | undefined {
    const row = this.db
      .prepare(
        'SELECT * FROM inventory_location_balances WHERE companyId = ? AND inventoryItemId = ? AND location = ?',
      )
      .get(companyId, inventoryItemId, location) as any;
    return row ? this.decodeInventoryLocationBalance(row) : undefined;
  }

  private setLocationBalance(
    companyId: string,
    inventoryItemId: string,
    location: string,
    quantity: number,
  ) {
    if (quantity <= 0.0001) {
      this.db
        .prepare(
          'DELETE FROM inventory_location_balances WHERE companyId = ? AND inventoryItemId = ? AND location = ?',
        )
        .run(companyId, inventoryItemId, location);
      return;
    }

    this.db
      .prepare(
        `INSERT INTO inventory_location_balances (companyId, inventoryItemId, location, quantity)
         VALUES (@companyId, @inventoryItemId, @location, @quantity)
         ON CONFLICT(companyId, inventoryItemId, location)
         DO UPDATE SET quantity = excluded.quantity`,
      )
      .run({
        companyId,
        inventoryItemId,
        location,
        quantity: Number(quantity.toFixed(4)),
      });
  }

  private incrementLocationBalance(
    companyId: string,
    inventoryItemId: string,
    location: string,
    quantityChange: number,
  ) {
    const normalizedLocation = this.normalizeInventoryLocation(location);
    const existing = this.getLocationBalance(companyId, inventoryItemId, normalizedLocation);
    const nextQuantity = Number(((existing?.quantity || 0) + quantityChange).toFixed(4));
    if (nextQuantity < -0.0001) {
      throw new Error(`Location ${normalizedLocation} does not have enough stock.`);
    }
    this.setLocationBalance(companyId, inventoryItemId, normalizedLocation, Math.max(0, nextQuantity));
  }

  createInventoryItem(input: CreateInventoryItemInput): InventoryItem {
    const tracksInventory = input.tracksInventory ?? true;
    const item: InventoryItem = {
      ...input,
      id: uuid(),
      sku: this.nextInventorySku(input.companyId),
      barcode: input.barcode ?? undefined,
      vatApplicable: input.vatApplicable ?? true,
      tracksInventory,
      onHand: tracksInventory ? Number(input.onHand || 0) : 0,
      reorderPoint: tracksInventory ? Number(input.reorderPoint || 0) : 0,
      unitCost: Number(input.unitCost || 0),
      salePrice:
        input.salePrice === undefined || input.salePrice === null
          ? undefined
          : Number(input.salePrice),
      customFields: this.normalizeCustomFields(input.companyId, 'inventory_item', input.customFields),
    };

    this.db
      .prepare(
        'INSERT INTO inventory_items (id, companyId, sku, barcode, name, category, unit, vatApplicable, tracksInventory, onHand, reorderPoint, unitCost, salePrice, preferredVendor, preferredSupplierId, location, customFields) VALUES (@id, @companyId, @sku, @barcode, @name, @category, @unit, @vatApplicable, @tracksInventory, @onHand, @reorderPoint, @unitCost, @salePrice, @preferredVendor, @preferredSupplierId, @location, @customFields)',
      )
      .run({
        ...item,
        barcode: item.barcode ?? null,
        vatApplicable: item.vatApplicable ? 1 : 0,
        tracksInventory: item.tracksInventory ? 1 : 0,
        salePrice: item.salePrice ?? null,
        preferredVendor: item.preferredVendor ?? null,
        preferredSupplierId: item.preferredSupplierId ?? null,
        location: item.location ?? null,
        customFields: item.customFields ? JSON.stringify(item.customFields) : null,
      });

    if (item.tracksInventory && item.onHand !== 0) {
      this.setLocationBalance(
        item.companyId,
        item.id,
        this.normalizeInventoryLocation(item.location),
        item.onHand,
      );
    }

    if (item.tracksInventory && item.onHand !== 0) {
      this.createStockMovement({
        companyId: item.companyId,
        inventoryItemId: item.id,
        movementType: 'Opening',
        quantityChange: item.onHand,
        unitCost: item.unitCost,
        referenceType: 'opening',
        note: 'Opening balance',
      });
    }

    this.createActivityEvent({
      companyId: item.companyId,
      entityType: 'inventory_item',
      entityId: item.id,
      action: 'created',
      summary: `Inventory item ${item.name} (${item.sku}) created.`,
      metadata: { onHand: item.onHand, unitCost: item.unitCost },
    });

    return item;
  }

  listStockMovements(companyId: string, inventoryItemId?: string): StockMovement[] {
    const query = inventoryItemId
      ? 'SELECT * FROM stock_movements WHERE companyId = ? AND inventoryItemId = ? ORDER BY createdAt DESC'
      : 'SELECT * FROM stock_movements WHERE companyId = ? ORDER BY createdAt DESC LIMIT 250';
    const rows = inventoryItemId
      ? (this.db.prepare(query).all(companyId, inventoryItemId) as any[])
      : (this.db.prepare(query).all(companyId) as any[]);
    return rows.map((row) => this.decodeStockMovement(row));
  }

  createInventoryAdjustment(
    companyId: string,
    inventoryItemId: string,
    quantityChange: number,
    note?: string,
    location?: string,
  ): StockMovement {
    const item = this.getInventoryItemById(inventoryItemId);
    if (!item || item.companyId !== companyId) {
      throw new Error('Inventory item does not belong to this company.');
    }

    const targetLocation = this.normalizeInventoryLocation(location || item.location);
    if (quantityChange < 0) {
      const balance = this.getLocationBalance(companyId, inventoryItemId, targetLocation);
      if ((balance?.quantity || 0) + quantityChange < -0.0001) {
        throw new Error(`Insufficient stock in ${targetLocation}.`);
      }
    }

    this.db
      .prepare('UPDATE inventory_items SET onHand = onHand + ? WHERE id = ? AND companyId = ?')
      .run(quantityChange, inventoryItemId, companyId);
    this.incrementLocationBalance(companyId, inventoryItemId, targetLocation, quantityChange);
    const movement = this.createStockMovement({
      companyId,
      inventoryItemId,
      movementType: 'Adjustment',
      quantityChange,
      unitCost: item.unitCost,
      referenceType: 'manual_adjustment',
      note: note
        ? `${note} (${targetLocation})`
        : `Manual adjustment at ${targetLocation}`,
    });
    this.createActivityEvent({
      companyId,
      entityType: 'inventory_item',
      entityId: inventoryItemId,
      action: 'adjusted',
      summary: `Inventory adjusted for ${item.name}.`,
      metadata: { quantityChange, note, location: targetLocation },
    });
    return movement;
  }

  createInventoryIssue(input: CreateInventoryIssueInput): InventoryIssue {
    const item = this.getInventoryItemById(input.inventoryItemId);
    if (!item || item.companyId !== input.companyId) {
      throw new Error('Inventory item does not belong to this company.');
    }
    const quantity = Number(input.quantity || 0);
    if (quantity <= 0) {
      throw new Error('Issue quantity must be greater than zero.');
    }
    if (item.onHand < quantity - 0.0001) {
      throw new Error('Issue quantity exceeds stock on hand.');
    }

    const location = this.normalizeInventoryLocation(input.location || item.location);
    const locationBalance = this.getLocationBalance(input.companyId, item.id, location);
    if ((locationBalance?.quantity || 0) < quantity - 0.0001) {
      throw new Error(`Issue quantity exceeds stock available in ${location}.`);
    }

    if (input.projectId) {
      const project = this.getProjectById(input.projectId);
      if (!project || project.companyId !== input.companyId) {
        throw new Error('Project does not belong to this company.');
      }
    }
    if (input.taskId) {
      const task = this.getTaskById(input.taskId);
      if (!task || task.companyId !== input.companyId) {
        throw new Error('Task does not belong to this company.');
      }
    }

    const issue: InventoryIssue = {
      ...input,
      id: uuid(),
      quantity: Number(quantity.toFixed(4)),
      location,
      issuedAt: input.issuedAt ? new Date(input.issuedAt) : new Date(),
      issuedTo: input.issuedTo ?? undefined,
      note: input.note ?? undefined,
      projectId: input.projectId ?? undefined,
      taskId: input.taskId ?? undefined,
    };

    let lotAllocation: Array<{ lotId: string; lotNumber: string; quantity: number }> = [];
    const trx = this.db.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO inventory_issues (id, companyId, inventoryItemId, quantity, location, issuedAt, issuedTo, note, projectId, taskId) VALUES (@id, @companyId, @inventoryItemId, @quantity, @location, @issuedAt, @issuedTo, @note, @projectId, @taskId)',
        )
        .run({
          ...issue,
          issuedAt: issue.issuedAt.toISOString(),
          issuedTo: issue.issuedTo ?? null,
          note: issue.note ?? null,
          projectId: issue.projectId ?? null,
          taskId: issue.taskId ?? null,
        });
      this.db
        .prepare('UPDATE inventory_items SET onHand = onHand - ? WHERE id = ? AND companyId = ?')
        .run(issue.quantity, item.id, item.companyId);
      this.incrementLocationBalance(issue.companyId, issue.inventoryItemId, issue.location, -issue.quantity);
      // Keep lot balances reconciled: draw the issued quantity from the
      // earliest-expiry lots at this location (best-effort — see helper).
      lotAllocation = this.drawDownLotsFEFO(
        issue.companyId,
        issue.inventoryItemId,
        issue.quantity,
        issue.location,
      );
      const lotNote =
        lotAllocation.length > 0
          ? ` [FEFO: ${lotAllocation.map((a) => `${a.lotNumber}×${a.quantity}`).join(', ')}]`
          : '';
      this.createStockMovement({
        companyId: issue.companyId,
        inventoryItemId: issue.inventoryItemId,
        movementType: 'Issue',
        quantityChange: -issue.quantity,
        unitCost: item.unitCost,
        referenceType: 'inventory_issue',
        referenceId: issue.id,
        lotId: lotAllocation.length === 1 ? lotAllocation[0].lotId : undefined,
        note: (issue.note
          ? `${issue.note} (${issue.location})`
          : `Issued from ${issue.location}`) + lotNote,
      });
    });
    trx();

    this.createActivityEvent({
      companyId: issue.companyId,
      entityType: 'inventory_item',
      entityId: issue.inventoryItemId,
      action: 'issued',
      summary: `${item.name} issued from ${issue.location}.`,
      metadata: {
        quantity: issue.quantity,
        issuedTo: issue.issuedTo,
        projectId: issue.projectId,
        taskId: issue.taskId,
        lots: lotAllocation,
      },
    });
    return issue;
  }

  createInventoryTransfer(input: CreateInventoryTransferInput): InventoryTransfer {
    const item = this.getInventoryItemById(input.inventoryItemId);
    if (!item || item.companyId !== input.companyId) {
      throw new Error('Inventory item does not belong to this company.');
    }
    const quantity = Number(input.quantity || 0);
    if (quantity <= 0) {
      throw new Error('Transfer quantity must be greater than zero.');
    }
    const fromLocation = this.normalizeInventoryLocation(input.fromLocation || item.location);
    const toLocation = this.normalizeInventoryLocation(input.toLocation);
    if (fromLocation === toLocation) {
      throw new Error('Transfer requires different source and destination locations.');
    }
    const fromBalance = this.getLocationBalance(input.companyId, item.id, fromLocation);
    if ((fromBalance?.quantity || 0) < quantity - 0.0001) {
      throw new Error(`Transfer quantity exceeds stock available in ${fromLocation}.`);
    }

    const transfer: InventoryTransfer = {
      ...input,
      id: uuid(),
      quantity: Number(quantity.toFixed(4)),
      fromLocation,
      toLocation,
      transferredAt: input.transferredAt ? new Date(input.transferredAt) : new Date(),
      note: input.note ?? undefined,
    };

    const trx = this.db.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO inventory_transfers (id, companyId, inventoryItemId, quantity, fromLocation, toLocation, transferredAt, note) VALUES (@id, @companyId, @inventoryItemId, @quantity, @fromLocation, @toLocation, @transferredAt, @note)',
        )
        .run({
          ...transfer,
          transferredAt: transfer.transferredAt.toISOString(),
          note: transfer.note ?? null,
        });
      this.incrementLocationBalance(transfer.companyId, transfer.inventoryItemId, transfer.fromLocation, -transfer.quantity);
      this.incrementLocationBalance(transfer.companyId, transfer.inventoryItemId, transfer.toLocation, transfer.quantity);
      this.createStockMovement({
        companyId: transfer.companyId,
        inventoryItemId: transfer.inventoryItemId,
        movementType: 'Transfer Out',
        quantityChange: -transfer.quantity,
        unitCost: item.unitCost,
        referenceType: 'inventory_transfer',
        referenceId: transfer.id,
        note: `${transfer.fromLocation} -> ${transfer.toLocation}${transfer.note ? ` (${transfer.note})` : ''}`,
      });
      this.createStockMovement({
        companyId: transfer.companyId,
        inventoryItemId: transfer.inventoryItemId,
        movementType: 'Transfer In',
        quantityChange: transfer.quantity,
        unitCost: item.unitCost,
        referenceType: 'inventory_transfer',
        referenceId: transfer.id,
        note: `${transfer.fromLocation} -> ${transfer.toLocation}${transfer.note ? ` (${transfer.note})` : ''}`,
      });
      if (!item.location || item.location === transfer.fromLocation) {
        this.db
          .prepare('UPDATE inventory_items SET location = ? WHERE id = ?')
          .run(transfer.toLocation, item.id);
      }
    });
    trx();

    this.createActivityEvent({
      companyId: transfer.companyId,
      entityType: 'inventory_item',
      entityId: transfer.inventoryItemId,
      action: 'transferred',
      summary: `${item.name} transferred to ${transfer.toLocation}.`,
      metadata: {
        quantity: transfer.quantity,
        fromLocation: transfer.fromLocation,
        toLocation: transfer.toLocation,
      },
    });
    return transfer;
  }

  listPurchaseOrders(companyId: string): PurchaseOrder[] {
    const rows = this.db
      .prepare('SELECT * FROM purchase_orders WHERE companyId = ? ORDER BY orderDate DESC')
      .all(companyId) as any[];
    return rows.map((row) => this.decodePurchaseOrder(row));
  }

  listPurchaseReceipts(companyId: string, purchaseOrderId?: string): PurchaseReceipt[] {
    const rows = purchaseOrderId
      ? ((this.db
          .prepare(
            'SELECT * FROM purchase_receipts WHERE companyId = ? AND purchaseOrderId = ? ORDER BY receivedAt DESC',
          )
          .all(companyId, purchaseOrderId) as any[]))
      : ((this.db
          .prepare('SELECT * FROM purchase_receipts WHERE companyId = ? ORDER BY receivedAt DESC')
          .all(companyId) as any[]));
    return rows.map((row) => this.decodePurchaseReceipt(row));
  }

  getPurchaseOrderById(id: string): PurchaseOrder | undefined {
    const row = this.db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id) as any;
    return row ? this.decodePurchaseOrder(row) : undefined;
  }

  createPurchaseOrder(input: CreatePurchaseOrderInput): PurchaseOrder {
    const normalizedItems = this.normalizePurchaseOrderItems(input.items);
    if (!normalizedItems.length) {
      throw new Error('Purchase order requires at least one line item.');
    }

    const requestedStatus: PurchaseOrderStatus = input.status ?? 'Draft';
    if (requestedStatus === 'Partially Received') {
      throw new Error('Purchase orders cannot start as Partially Received.');
    }
    const totalAmount = Number(
      normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2),
    );

    // Approval gate: orders at/above the company threshold start as a pending
    // Draft and cannot move past Draft until an approver signs off.
    const threshold = this.getCompanyFinanceSettings(input.companyId).poApprovalThreshold;
    const requiresApproval = threshold > 0 && totalAmount >= threshold;
    const approvalStatus: PurchaseOrder['approvalStatus'] = requiresApproval ? 'pending' : 'not_required';

    // A pending order is forced to Draft; auto-receive only runs once approved.
    const status: PurchaseOrderStatus = requiresApproval ? 'Draft' : requestedStatus;
    const shouldAutoReceive = !requiresApproval && status === 'Received';
    const order: PurchaseOrder = {
      ...input,
      id: uuid(),
      orderNumber: this.nextPurchaseOrderNumber(input.companyId),
      supplierId: input.supplierId ?? undefined,
      orderDate: new Date(input.orderDate),
      expectedDate: input.expectedDate ? new Date(input.expectedDate) : undefined,
      status: shouldAutoReceive ? 'Ordered' : status,
      items: normalizedItems,
      totalAmount,
      notes: input.notes ?? undefined,
      receivedAt: undefined,
      approvalStatus,
      approvedBy: undefined,
      approvedAt: undefined,
      rejectionReason: undefined,
    };

    this.db
      .prepare(
        'INSERT INTO purchase_orders (id, companyId, orderNumber, supplierName, supplierId, contactId, orderDate, expectedDate, status, items, totalAmount, notes, receivedAt, approvalStatus, approvedBy, approvedAt, rejectionReason) VALUES (@id, @companyId, @orderNumber, @supplierName, @supplierId, @contactId, @orderDate, @expectedDate, @status, @items, @totalAmount, @notes, @receivedAt, @approvalStatus, @approvedBy, @approvedAt, @rejectionReason)',
      )
      .run({
        ...order,
        supplierId: order.supplierId ?? null,
        contactId: order.contactId ?? null,
        orderDate: order.orderDate.toISOString(),
        expectedDate: order.expectedDate ? order.expectedDate.toISOString() : null,
        items: JSON.stringify(order.items),
        notes: order.notes ?? null,
        receivedAt: null,
        approvalStatus: order.approvalStatus,
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
      });

    if (input.contactId) {
      this.addContactRole(input.contactId, input.companyId, 'Vendor', 'PurchaseOrder');
    }

    if (requiresApproval) {
      this.notify({
        companyId: order.companyId,
        userIds: this.listUserIdsByCompanyRoles(order.companyId, ['Admin', 'Manager']),
        type: 'po_approval',
        title: `PO needs approval: ${order.orderNumber}`,
        body: `${order.supplierName} — ${order.totalAmount}. Review and approve in Purchasing.`,
        link: '/operations',
        entityType: 'purchase_order',
        entityId: order.id,
      });
    }

    if (shouldAutoReceive) {
      const receivedOrder = this.receivePurchaseOrder(order.id, {
        receivedAt: new Date(),
        notes: `Initial receipt for ${order.orderNumber}`,
        items: order.items.map((item, lineIndex) => ({
          lineIndex,
          quantity: item.quantity,
        })),
      });
      return receivedOrder;
    }

    this.createActivityEvent({
      companyId: order.companyId,
      entityType: 'purchase_order',
      entityId: order.id,
      action: 'created',
      summary: `Purchase order ${order.orderNumber} created.`,
      metadata: { status: order.status, totalAmount: order.totalAmount },
    });

    return order;
  }

  updatePurchaseOrderStatus(id: string, status: PurchaseOrderStatus): PurchaseOrder | undefined {
    const existing = this.getPurchaseOrderById(id);
    if (!existing) return undefined;

    if (status === 'Partially Received') {
      throw new Error('Use purchase receipts to mark an order as partially received.');
    }

    if ((status === 'Ordered' || status === 'Received') && existing.approvalStatus === 'pending') {
      throw new Error('Purchase order must be approved before it can be ordered or received.');
    }
    if ((status === 'Ordered' || status === 'Received') && existing.approvalStatus === 'rejected') {
      throw new Error('This purchase order was rejected and cannot be ordered or received.');
    }

    if (status === 'Received') {
      const remainingItems = this.getRemainingReceiptItems(existing);
      if (!remainingItems.length) {
        this.db
          .prepare('UPDATE purchase_orders SET status = ?, receivedAt = ? WHERE id = ?')
          .run('Received', existing.receivedAt ? existing.receivedAt.toISOString() : new Date().toISOString(), id);
        const result = this.getPurchaseOrderById(id);
        if (result) {
          this.createActivityEvent({
            companyId: result.companyId,
            entityType: 'purchase_order',
            entityId: result.id,
            action: 'status_changed',
            summary: `Purchase order ${result.orderNumber} marked as Received.`,
            metadata: { status: result.status },
          });
        }
        return result;
      }
      return this.receivePurchaseOrder(id, {
        receivedAt: new Date(),
        notes: `Final receipt for ${existing.orderNumber}`,
        items: remainingItems.map((item) => ({
          lineIndex: item.lineIndex,
          quantity: item.remainingQuantity,
        })),
      });
    }

    this.db
      .prepare('UPDATE purchase_orders SET status = ?, receivedAt = ? WHERE id = ?')
      .run(status, status === 'Draft' ? null : existing.receivedAt ? existing.receivedAt.toISOString() : null, id);
    const result = this.getPurchaseOrderById(id);
    if (result) {
      this.createActivityEvent({
        companyId: result.companyId,
        entityType: 'purchase_order',
        entityId: result.id,
        action: 'status_changed',
        summary: `Purchase order ${result.orderNumber} moved to ${result.status}.`,
        metadata: { status: result.status },
      });
    }
    return result;
  }

  approvePurchaseOrder(id: string, approverName: string): PurchaseOrder | undefined {
    const existing = this.getPurchaseOrderById(id);
    if (!existing) return undefined;
    if (existing.approvalStatus !== 'pending') {
      throw new Error('Only purchase orders awaiting approval can be approved.');
    }
    this.db
      .prepare('UPDATE purchase_orders SET approvalStatus = ?, approvedBy = ?, approvedAt = ?, rejectionReason = NULL WHERE id = ?')
      .run('approved', approverName || 'Approver', new Date().toISOString(), id);
    const result = this.getPurchaseOrderById(id);
    if (result) {
      this.createActivityEvent({
        companyId: result.companyId,
        entityType: 'purchase_order',
        entityId: result.id,
        action: 'approved',
        summary: `Purchase order ${result.orderNumber} approved by ${approverName || 'an approver'}.`,
        metadata: { totalAmount: result.totalAmount },
      });
    }
    return result;
  }

  rejectPurchaseOrder(id: string, approverName: string, reason?: string): PurchaseOrder | undefined {
    const existing = this.getPurchaseOrderById(id);
    if (!existing) return undefined;
    if (existing.approvalStatus !== 'pending') {
      throw new Error('Only purchase orders awaiting approval can be rejected.');
    }
    this.db
      .prepare('UPDATE purchase_orders SET approvalStatus = ?, approvedBy = ?, approvedAt = ?, rejectionReason = ? WHERE id = ?')
      .run('rejected', approverName || 'Approver', new Date().toISOString(), reason ?? null, id);
    const result = this.getPurchaseOrderById(id);
    if (result) {
      this.createActivityEvent({
        companyId: result.companyId,
        entityType: 'purchase_order',
        entityId: result.id,
        action: 'rejected',
        summary: `Purchase order ${result.orderNumber} rejected by ${approverName || 'an approver'}.`,
        metadata: { reason: reason ?? null },
      });
    }
    return result;
  }

  listSalesOrders(companyId: string): SalesOrder[] {
    const rows = this.db
      .prepare('SELECT * FROM sales_orders WHERE companyId = ? ORDER BY orderDate DESC')
      .all(companyId) as any[];
    return rows.map((row) => this.decodeSalesOrder(row));
  }

  getSalesOrderById(id: string): SalesOrder | undefined {
    const row = this.db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(id) as any;
    return row ? this.decodeSalesOrder(row) : undefined;
  }

  createSalesOrder(input: CreateSalesOrderInput): SalesOrder {
    const normalizedItems = this.normalizeSalesOrderItems(input.items);
    if (!normalizedItems.length) {
      throw new Error('Sales order requires at least one line item.');
    }

    const totalAmount = Number(
      normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2),
    );
    const order: SalesOrder = {
      ...input,
      id: uuid(),
      orderNumber: input.orderNumber || this.nextSalesOrderNumber(input.companyId),
      orderDate: new Date(input.orderDate),
      expectedDate: input.expectedDate ? new Date(input.expectedDate) : undefined,
      status: input.status ?? 'Draft',
      items: normalizedItems,
      totalAmount,
      notes: input.notes ?? undefined,
      invoiceId: undefined,
    };

    this.db
      .prepare(
        'INSERT INTO sales_orders (id, companyId, orderNumber, clientId, contactId, orderDate, expectedDate, status, items, totalAmount, notes, invoiceId) VALUES (@id, @companyId, @orderNumber, @clientId, @contactId, @orderDate, @expectedDate, @status, @items, @totalAmount, @notes, @invoiceId)',
      )
      .run({
        ...order,
        contactId: order.contactId ?? null,
        orderDate: order.orderDate.toISOString(),
        expectedDate: order.expectedDate ? order.expectedDate.toISOString() : null,
        items: JSON.stringify(order.items),
        notes: order.notes ?? null,
        invoiceId: null,
      });

    if (input.contactId) {
      this.addContactRole(input.contactId, input.companyId, 'Client', 'SalesOrder');
    }

    this.createActivityEvent({
      companyId: order.companyId,
      entityType: 'sales_order',
      entityId: order.id,
      action: 'created',
      summary: `Sales order ${order.orderNumber} created.`,
      metadata: { status: order.status, totalAmount: order.totalAmount, clientId: order.clientId },
    });

    return order;
  }

  updateSalesOrderStatus(id: string, status: SalesOrderStatus): SalesOrder | undefined {
    const existing = this.getSalesOrderById(id);
    if (!existing) return undefined;
    if (existing.invoiceId && status !== 'Invoiced') {
      throw new Error('Invoiced sales orders cannot be moved back. Edit the linked invoice instead.');
    }
    if (status === 'Invoiced' && !existing.invoiceId) {
      throw new Error('Create an invoice from the sales order to mark it as Invoiced.');
    }

    this.db.prepare('UPDATE sales_orders SET status = ? WHERE id = ?').run(status, id);
    const result = this.getSalesOrderById(id);
    if (result) {
      this.createActivityEvent({
        companyId: result.companyId,
        entityType: 'sales_order',
        entityId: result.id,
        action: 'status_changed',
        summary: `Sales order ${result.orderNumber} moved to ${result.status}.`,
        metadata: { status: result.status, invoiceId: result.invoiceId },
      });
    }
    return result;
  }

  // ============================================================
  // Deliveries / Fulfillment
  // ============================================================

  listDeliveries(companyId: string): Delivery[] {
    const rows = this.db
      .prepare('SELECT * FROM deliveries WHERE companyId = ? ORDER BY createdAt DESC')
      .all(companyId) as any[];
    return rows.map((row) => this.decodeDelivery(row));
  }

  listDeliveriesForSalesOrder(salesOrderId: string): Delivery[] {
    const rows = this.db
      .prepare('SELECT * FROM deliveries WHERE salesOrderId = ? ORDER BY createdAt DESC')
      .all(salesOrderId) as any[];
    return rows.map((row) => this.decodeDelivery(row));
  }

  getDeliveryById(id: string): Delivery | undefined {
    const row = this.db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id) as any;
    return row ? this.decodeDelivery(row) : undefined;
  }

  createDelivery(input: {
    salesOrderId: string;
    items: Array<{ salesOrderLineIndex: number; quantity: number; location?: string }>;
    carrier?: string;
    trackingNumber?: string;
    notes?: string;
    scheduledFor?: Date;
  }): Delivery {
    const order = this.getSalesOrderById(input.salesOrderId);
    if (!order) {
      throw new Error('Sales order not found.');
    }
    if (order.status === 'Cancelled' || order.status === 'Draft') {
      throw new Error('Only confirmed or invoiced sales orders can be fulfilled.');
    }

    const deliveredByLine = this.getDeliveredQuantityByLine(order.id);
    const normalized = input.items
      .map((item) => ({
        salesOrderLineIndex: Number(item.salesOrderLineIndex),
        quantity: Number(item.quantity),
        location: item.location ? String(item.location) : undefined,
      }))
      .filter((item) => Number.isInteger(item.salesOrderLineIndex) && Number.isFinite(item.quantity) && item.quantity > 0);

    if (!normalized.length) {
      throw new Error('Delivery requires at least one positive line quantity.');
    }

    const deliveryItems: DeliveryLineItem[] = normalized.map((item) => {
      const soLine = order.items[item.salesOrderLineIndex];
      if (!soLine) {
        throw new Error(`Sales order line ${item.salesOrderLineIndex} does not exist.`);
      }
      const previouslyDelivered = deliveredByLine.get(item.salesOrderLineIndex) || 0;
      const remaining = Number((soLine.quantity - previouslyDelivered).toFixed(4));
      if (remaining <= 0) {
        throw new Error(`Line ${item.salesOrderLineIndex} is already fully delivered.`);
      }
      if (item.quantity > remaining + 0.0001) {
        throw new Error(`Delivery quantity for line ${item.salesOrderLineIndex} exceeds the remaining amount (${remaining}).`);
      }
      return {
        salesOrderLineIndex: item.salesOrderLineIndex,
        inventoryItemId: soLine.inventoryItemId,
        sku: soLine.sku,
        description: soLine.description,
        quantity: Number(item.quantity.toFixed(4)),
        location: item.location,
      };
    });

    const delivery: Delivery = {
      id: uuid(),
      companyId: order.companyId,
      deliveryNumber: this.nextConfiguredSequenceValue(order.companyId, 'delivery'),
      salesOrderId: order.id,
      status: 'Pending',
      items: deliveryItems,
      carrier: input.carrier,
      trackingNumber: input.trackingNumber,
      notes: input.notes,
      scheduledFor: input.scheduledFor,
      createdAt: new Date(),
    };

    this.db
      .prepare(
        `INSERT INTO deliveries (id, companyId, deliveryNumber, salesOrderId, status, items, carrier, trackingNumber, notes, scheduledFor, dispatchedAt, deliveredAt, cancelledAt, createdAt)
         VALUES (@id, @companyId, @deliveryNumber, @salesOrderId, @status, @items, @carrier, @trackingNumber, @notes, @scheduledFor, @dispatchedAt, @deliveredAt, @cancelledAt, @createdAt)`,
      )
      .run({
        ...delivery,
        items: JSON.stringify(delivery.items),
        carrier: delivery.carrier ?? null,
        trackingNumber: delivery.trackingNumber ?? null,
        notes: delivery.notes ?? null,
        scheduledFor: delivery.scheduledFor ? delivery.scheduledFor.toISOString() : null,
        dispatchedAt: null,
        deliveredAt: null,
        cancelledAt: null,
        createdAt: delivery.createdAt.toISOString(),
      });

    this.createActivityEvent({
      companyId: delivery.companyId,
      entityType: 'delivery',
      entityId: delivery.id,
      action: 'created',
      summary: `Delivery ${delivery.deliveryNumber} created for sales order ${order.orderNumber}.`,
      metadata: { salesOrderId: order.id, status: delivery.status, lineCount: delivery.items.length },
    });

    return delivery;
  }

  markDeliveryShipped(id: string, dispatchedAt?: Date): Delivery {
    const delivery = this.getDeliveryById(id);
    if (!delivery) throw new Error('Delivery not found.');
    if (delivery.status !== 'Pending') {
      throw new Error(`Delivery cannot be shipped from status "${delivery.status}".`);
    }
    const order = this.getSalesOrderById(delivery.salesOrderId);
    if (!order) throw new Error('Linked sales order not found.');

    const shipAt = dispatchedAt || new Date();
    const updateItemQty = this.db.prepare(
      'UPDATE inventory_items SET onHand = onHand - ? WHERE id = ? AND companyId = ?',
    );

    const trx = this.db.transaction(() => {
      delivery.items.forEach((line) => {
        if (!line.inventoryItemId) return;
        const inventoryItem = this.getInventoryItemById(line.inventoryItemId);
        if (!inventoryItem || !inventoryItem.tracksInventory) return;
        const location = this.normalizeInventoryLocation(line.location || inventoryItem.location);
        // decrement on-hand (allow negative; surface warnings on stock movement)
        updateItemQty.run(line.quantity, line.inventoryItemId, delivery.companyId);
        this.incrementLocationBalance(
          delivery.companyId,
          line.inventoryItemId,
          location,
          -line.quantity,
        );
        this.createStockMovement({
          companyId: delivery.companyId,
          inventoryItemId: line.inventoryItemId,
          movementType: 'Issue',
          quantityChange: -line.quantity,
          unitCost: inventoryItem.unitCost,
          referenceType: 'delivery',
          referenceId: delivery.id,
          note: `Dispatched on ${delivery.deliveryNumber} (SO ${order.orderNumber})`,
        });
      });

      this.db
        .prepare('UPDATE deliveries SET status = ?, dispatchedAt = ? WHERE id = ?')
        .run('Shipped', shipAt.toISOString(), id);
    });

    trx();

    const updated = this.getDeliveryById(id);
    if (!updated) throw new Error('Delivery not found after dispatch.');
    this.createActivityEvent({
      companyId: updated.companyId,
      entityType: 'delivery',
      entityId: updated.id,
      action: 'shipped',
      summary: `Delivery ${updated.deliveryNumber} dispatched.`,
      metadata: {
        salesOrderId: updated.salesOrderId,
        carrier: updated.carrier,
        trackingNumber: updated.trackingNumber,
      },
    });

    // Auto-follow-up: remind the rep to confirm safe arrival.
    if (order.contactId) {
      try {
        this.scheduleAutomaticFollowup({
          companyId: updated.companyId,
          contactId: order.contactId,
          trigger: 'DeliveryShipped',
          sourceType: 'delivery',
          sourceId: updated.id,
          summary: `Shipment ${updated.deliveryNumber} dispatched — confirm arrival.`,
          nextAction: updated.trackingNumber
            ? `Confirm receipt (tracking: ${updated.trackingNumber}).`
            : 'Confirm the client received the shipment.',
          offsetDays: 3,
          category: 'Call',
        });
      } catch (error) {
        console.error('Failed to schedule DeliveryShipped follow-up', error);
      }
    }

    return updated;
  }

  markDeliveryDelivered(id: string, deliveredAt?: Date): Delivery {
    const delivery = this.getDeliveryById(id);
    if (!delivery) throw new Error('Delivery not found.');
    if (delivery.status !== 'Shipped') {
      throw new Error(`Delivery must be shipped before it can be marked delivered (current: ${delivery.status}).`);
    }
    const at = deliveredAt || new Date();
    this.db
      .prepare('UPDATE deliveries SET status = ?, deliveredAt = ? WHERE id = ?')
      .run('Delivered', at.toISOString(), id);
    const updated = this.getDeliveryById(id);
    if (!updated) throw new Error('Delivery not found after update.');
    this.createActivityEvent({
      companyId: updated.companyId,
      entityType: 'delivery',
      entityId: updated.id,
      action: 'delivered',
      summary: `Delivery ${updated.deliveryNumber} marked as delivered (POD recorded).`,
      metadata: { salesOrderId: updated.salesOrderId, deliveredAt: at.toISOString() },
    });
    return updated;
  }

  // ============================================================
  // WhatsApp (Green API) — instance + messages
  // ============================================================

  private whatsappKey(): Buffer {
    const raw = process.env.WHATSAPP_ENCRYPTION_KEY || 'taskflow-dev-only-not-for-production-use';
    return crypto.createHash('sha256').update(raw).digest();
  }

  private encryptApiToken(token: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.whatsappKey(), iv);
    const enc = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
  }

  private decryptApiToken(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new Error('Stored WhatsApp token is malformed.');
    }
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const data = Buffer.from(parts[3], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.whatsappKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  private decodeWhatsappInstance(row: any): WhatsAppInstance {
    return {
      id: row.id,
      companyId: row.companyId,
      idInstance: row.idInstance,
      phoneNumber: row.phoneNumber ?? undefined,
      displayName: row.displayName ?? undefined,
      state: row.state as WhatsAppInstanceState,
      webhookToken: row.webhookToken,
      lastSyncedAt: row.lastSyncedAt ? new Date(row.lastSyncedAt) : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  getWhatsappInstanceForCompany(companyId: string): WhatsAppInstance | undefined {
    const row = this.db
      .prepare('SELECT * FROM whatsapp_instances WHERE companyId = ?')
      .get(companyId) as any;
    return row ? this.decodeWhatsappInstance(row) : undefined;
  }

  getWhatsappInstanceByWebhookToken(token: string): WhatsAppInstance | undefined {
    if (!token) return undefined;
    const row = this.db
      .prepare('SELECT * FROM whatsapp_instances WHERE webhookToken = ?')
      .get(token) as any;
    return row ? this.decodeWhatsappInstance(row) : undefined;
  }

  /** Returns instance credentials (decrypted) for use by the Green API service. */
  getWhatsappCredentials(
    companyId: string,
  ): { idInstance: string; apiToken: string; apiHost?: string } | undefined {
    const row = this.db
      .prepare('SELECT idInstance, apiTokenEncrypted, apiHost FROM whatsapp_instances WHERE companyId = ?')
      .get(companyId) as any;
    if (!row) return undefined;
    return {
      idInstance: row.idInstance,
      apiToken: this.decryptApiToken(row.apiTokenEncrypted),
      apiHost: row.apiHost ?? undefined,
    };
  }

  upsertWhatsappInstance(
    companyId: string,
    input: {
      idInstance: string;
      apiToken: string;
      apiHost?: string;
      phoneNumber?: string;
      displayName?: string;
    },
  ): WhatsAppInstance {
    const idInstance = String(input.idInstance || '').trim();
    const apiToken = String(input.apiToken || '').trim();
    if (!idInstance) throw new Error('idInstance is required.');
    if (!apiToken) throw new Error('apiToken is required.');

    const now = new Date().toISOString();
    const existing = this.getWhatsappInstanceForCompany(companyId);
    const encrypted = this.encryptApiToken(apiToken);
    if (existing) {
      this.db
        .prepare(
          `UPDATE whatsapp_instances SET idInstance = ?, apiTokenEncrypted = ?, apiHost = ?,
             phoneNumber = COALESCE(?, phoneNumber), displayName = COALESCE(?, displayName), updatedAt = ?
             WHERE companyId = ?`,
        )
        .run(
          idInstance,
          encrypted,
          input.apiHost ?? null,
          input.phoneNumber ?? null,
          input.displayName ?? null,
          now,
          companyId,
        );
    } else {
      this.db
        .prepare(
          `INSERT INTO whatsapp_instances (id, companyId, idInstance, apiTokenEncrypted, apiHost, phoneNumber, displayName, state, webhookToken, createdAt, updatedAt)
           VALUES (@id, @companyId, @idInstance, @apiTokenEncrypted, @apiHost, @phoneNumber, @displayName, @state, @webhookToken, @createdAt, @updatedAt)`,
        )
        .run({
          id: uuid(),
          companyId,
          idInstance,
          apiTokenEncrypted: encrypted,
          apiHost: input.apiHost ?? null,
          phoneNumber: input.phoneNumber ?? null,
          displayName: input.displayName ?? null,
          state: 'notAuthorized',
          webhookToken: crypto.randomBytes(24).toString('hex'),
          createdAt: now,
          updatedAt: now,
        });
    }
    const refreshed = this.getWhatsappInstanceForCompany(companyId);
    if (!refreshed) throw new Error('Failed to persist WhatsApp instance.');
    return refreshed;
  }

  updateWhatsappInstanceState(
    companyId: string,
    state: WhatsAppInstanceState,
    phoneNumber?: string,
    displayName?: string,
  ): WhatsAppInstance | undefined {
    const existing = this.getWhatsappInstanceForCompany(companyId);
    if (!existing) return undefined;
    this.db
      .prepare(
        `UPDATE whatsapp_instances SET state = ?, phoneNumber = COALESCE(?, phoneNumber),
           displayName = COALESCE(?, displayName), lastSyncedAt = ?, updatedAt = ?
           WHERE companyId = ?`,
      )
      .run(
        state,
        phoneNumber ?? null,
        displayName ?? null,
        new Date().toISOString(),
        new Date().toISOString(),
        companyId,
      );
    return this.getWhatsappInstanceForCompany(companyId);
  }

  deleteWhatsappInstance(companyId: string): boolean {
    const existing = this.getWhatsappInstanceForCompany(companyId);
    if (!existing) return false;
    const trx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM whatsapp_messages WHERE instanceId = ?').run(existing.id);
      this.db.prepare('DELETE FROM whatsapp_instances WHERE companyId = ?').run(companyId);
    });
    trx();
    return true;
  }

  private decodeWhatsappMessage(row: any): WhatsAppMessage {
    return {
      id: row.id,
      companyId: row.companyId,
      instanceId: row.instanceId,
      direction: row.direction as WhatsAppMessageDirection,
      externalId: row.externalId ?? undefined,
      chatId: row.chatId,
      phone: row.phone,
      contactId: row.contactId ?? undefined,
      type: row.type as WhatsAppMessageType,
      body: row.body ?? '',
      mediaUrl: row.mediaUrl ?? undefined,
      fileName: row.fileName ?? undefined,
      status: row.status as WhatsAppMessageStatus,
      error: row.error ?? undefined,
      contextEntityType: row.contextEntityType ?? undefined,
      contextEntityId: row.contextEntityId ?? undefined,
      actorUserId: row.actorUserId ?? undefined,
      actorName: row.actorName ?? undefined,
      sentAt: row.sentAt ? new Date(row.sentAt) : undefined,
      deliveredAt: row.deliveredAt ? new Date(row.deliveredAt) : undefined,
      readAt: row.readAt ? new Date(row.readAt) : undefined,
      receivedAt: row.receivedAt ? new Date(row.receivedAt) : undefined,
      createdAt: new Date(row.createdAt),
    };
  }

  private digitsOnly(value: string | null | undefined): string {
    return String(value || '').replace(/\D/g, '');
  }

  listWhatsappMessages(
    companyId: string,
    options: { chatId?: string; contactId?: string; phone?: string; limit?: number } = {},
  ): WhatsAppMessage[] {
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
    const conditions: string[] = ['companyId = ?'];
    const params: any[] = [companyId];
    if (options.chatId) {
      conditions.push('chatId = ?');
      params.push(options.chatId);
    }
    if (options.contactId) {
      conditions.push('contactId = ?');
      params.push(options.contactId);
    }
    if (options.phone) {
      conditions.push('phone = ?');
      params.push(this.digitsOnly(options.phone));
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM whatsapp_messages WHERE ${conditions.join(' AND ')} ORDER BY createdAt DESC LIMIT ?`,
      )
      .all(...params, limit) as any[];
    return rows.map((row) => this.decodeWhatsappMessage(row));
  }

  // -------- chat settings (visibility / privacy) --------

  getWhatsappChatSettings(companyId: string, chatId: string): WhatsAppChatSettings {
    const row = this.db
      .prepare('SELECT * FROM whatsapp_chat_settings WHERE companyId = ? AND chatId = ?')
      .get(companyId, chatId) as any;
    if (!row) {
      return {
        companyId,
        chatId,
        visibility: 'shared',
        ownerUserId: undefined,
        updatedAt: new Date(0),
      };
    }
    return {
      companyId: row.companyId,
      chatId: row.chatId,
      visibility: (row.visibility as WhatsAppChatVisibility) || 'shared',
      ownerUserId: row.ownerUserId ?? undefined,
      updatedAt: new Date(row.updatedAt),
    };
  }

  setWhatsappChatSettings(
    companyId: string,
    chatId: string,
    updates: { visibility?: WhatsAppChatVisibility; ownerUserId?: string | null },
  ): WhatsAppChatSettings {
    const current = this.getWhatsappChatSettings(companyId, chatId);
    const visibility = updates.visibility ?? current.visibility;
    const ownerUserId =
      updates.ownerUserId === null
        ? undefined
        : updates.ownerUserId ?? current.ownerUserId;
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO whatsapp_chat_settings (companyId, chatId, visibility, ownerUserId, updatedAt)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(companyId, chatId) DO UPDATE SET
           visibility = excluded.visibility,
           ownerUserId = excluded.ownerUserId,
           updatedAt = excluded.updatedAt`,
      )
      .run(companyId, chatId, visibility, ownerUserId ?? null, updatedAt);
    return this.getWhatsappChatSettings(companyId, chatId);
  }

  /**
   * Returns map of chatId → settings for a company. Used by chats list to
   * filter and badge chats consistently.
   */
  listWhatsappChatSettings(companyId: string): Map<string, WhatsAppChatSettings> {
    const rows = this.db
      .prepare('SELECT * FROM whatsapp_chat_settings WHERE companyId = ?')
      .all(companyId) as any[];
    const map = new Map<string, WhatsAppChatSettings>();
    rows.forEach((row) => {
      map.set(row.chatId, {
        companyId: row.companyId,
        chatId: row.chatId,
        visibility: (row.visibility as WhatsAppChatVisibility) || 'shared',
        ownerUserId: row.ownerUserId ?? undefined,
        updatedAt: new Date(row.updatedAt),
      });
    });
    return map;
  }

  /**
   * True if the viewer is allowed to see this chat under its current
   * privacy setting. Admin and Manager always see all; Employee sees only
   * shared chats and private chats they own.
   */
  canViewWhatsappChat(
    settings: WhatsAppChatSettings,
    viewer: { userId: string; role?: string } | undefined,
  ): boolean {
    if (!viewer) return false;
    if (settings.visibility !== 'private') return true;
    const role = viewer.role;
    if (role === 'Admin' || role === 'Manager') return true;
    return settings.ownerUserId === viewer.userId;
  }

  /** Best-effort lookup of a contact id for a given phone number. */
  private findContactIdByPhone(companyId: string, phone: string): string | undefined {
    if (!phone) return undefined;
    const digits = phone.replace(/\D/g, '');
    if (!digits) return undefined;
    const candidate = `%${digits.slice(-9)}`;
    const row = this.db
      .prepare(
        `SELECT id FROM contacts WHERE companyId = ? AND REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ? LIMIT 1`,
      )
      .get(companyId, candidate) as { id?: string } | undefined;
    return row?.id;
  }

  createWhatsappMessage(
    input: Omit<WhatsAppMessage, 'id' | 'createdAt'> & { createdAt?: Date },
  ): WhatsAppMessage {
    // Idempotency: if the same externalId already exists for the company,
    // update the existing record instead of inserting a duplicate.
    if (input.externalId) {
      const existing = this.db
        .prepare('SELECT * FROM whatsapp_messages WHERE externalId = ? AND companyId = ?')
        .get(input.externalId, input.companyId) as any;
      if (existing) {
        // refresh status / timestamps without changing the row id
        this.db
          .prepare(
            `UPDATE whatsapp_messages
               SET status = ?, body = COALESCE(?, body), mediaUrl = COALESCE(?, mediaUrl),
                   fileName = COALESCE(?, fileName),
                   sentAt = COALESCE(sentAt, ?), deliveredAt = COALESCE(deliveredAt, ?),
                   readAt = COALESCE(readAt, ?), receivedAt = COALESCE(receivedAt, ?),
                   error = COALESCE(?, error)
               WHERE id = ?`,
          )
          .run(
            input.status,
            input.body ?? null,
            input.mediaUrl ?? null,
            input.fileName ?? null,
            input.sentAt ? input.sentAt.toISOString() : null,
            input.deliveredAt ? input.deliveredAt.toISOString() : null,
            input.readAt ? input.readAt.toISOString() : null,
            input.receivedAt ? input.receivedAt.toISOString() : null,
            input.error ?? null,
            existing.id,
          );
        return this.decodeWhatsappMessage(
          this.db.prepare('SELECT * FROM whatsapp_messages WHERE id = ?').get(existing.id) as any,
        );
      }
    }

    // Normalize phone to digits-only so chatId-based filters always match.
    const normalizedPhone = this.digitsOnly(input.phone);

    // Auto-link to a contact by phone if not provided
    const linkedContactId =
      input.contactId || this.findContactIdByPhone(input.companyId, normalizedPhone);

    const message: WhatsAppMessage = {
      ...input,
      phone: normalizedPhone,
      contactId: linkedContactId,
      id: uuid(),
      createdAt: input.createdAt || new Date(),
    } as WhatsAppMessage;
    this.db
      .prepare(
        `INSERT INTO whatsapp_messages (
           id, companyId, instanceId, direction, externalId, chatId, phone, contactId,
           type, body, mediaUrl, fileName, status, error, contextEntityType, contextEntityId,
           actorUserId, actorName,
           sentAt, deliveredAt, readAt, receivedAt, createdAt
         ) VALUES (
           @id, @companyId, @instanceId, @direction, @externalId, @chatId, @phone, @contactId,
           @type, @body, @mediaUrl, @fileName, @status, @error, @contextEntityType, @contextEntityId,
           @actorUserId, @actorName,
           @sentAt, @deliveredAt, @readAt, @receivedAt, @createdAt
         )`,
      )
      .run({
        ...message,
        externalId: message.externalId ?? null,
        contactId: message.contactId ?? null,
        body: message.body ?? null,
        mediaUrl: message.mediaUrl ?? null,
        fileName: message.fileName ?? null,
        error: message.error ?? null,
        contextEntityType: message.contextEntityType ?? null,
        contextEntityId: message.contextEntityId ?? null,
        actorUserId: message.actorUserId ?? null,
        actorName: message.actorName ?? null,
        sentAt: message.sentAt ? message.sentAt.toISOString() : null,
        deliveredAt: message.deliveredAt ? message.deliveredAt.toISOString() : null,
        readAt: message.readAt ? message.readAt.toISOString() : null,
        receivedAt: message.receivedAt ? message.receivedAt.toISOString() : null,
        createdAt: message.createdAt.toISOString(),
      });
    return message;
  }

  listWhatsappChats(
    companyId: string,
    viewer?: { userId: string; role?: string },
  ): Array<{
    chatId: string;
    phone: string;
    contactId?: string;
    contactName?: string;
    lastMessageAt: Date;
    lastMessageBody: string;
    lastMessageDirection: WhatsAppMessageDirection;
    unreadCount: number;
    messageCount: number;
    visibility: WhatsAppChatVisibility;
    ownerUserId?: string;
  }> {
    const rows = this.db
      .prepare(
        `SELECT
           m.chatId as chatId,
           m.phone as phone,
           MAX(m.createdAt) as lastAt,
           COUNT(*) as messageCount,
           SUM(CASE WHEN m.direction = 'inbound' AND m.readAt IS NULL THEN 1 ELSE 0 END) as unreadCount
         FROM whatsapp_messages m
         WHERE m.companyId = ?
         GROUP BY m.chatId
         ORDER BY lastAt DESC`,
      )
      .all(companyId) as any[];

    const lastMessageStmt = this.db.prepare(
      `SELECT body, direction, contactId
         FROM whatsapp_messages
         WHERE companyId = ? AND chatId = ?
         ORDER BY createdAt DESC LIMIT 1`,
    );
    const contactNameStmt = this.db.prepare('SELECT name FROM contacts WHERE id = ?');

    const settingsMap = this.listWhatsappChatSettings(companyId);
    const out: Array<{
      chatId: string;
      phone: string;
      contactId?: string;
      contactName?: string;
      lastMessageAt: Date;
      lastMessageBody: string;
      lastMessageDirection: WhatsAppMessageDirection;
      unreadCount: number;
      messageCount: number;
      visibility: WhatsAppChatVisibility;
      ownerUserId?: string;
    }> = [];

    rows.forEach((row) => {
      const settings: WhatsAppChatSettings = settingsMap.get(row.chatId) || {
        companyId,
        chatId: row.chatId,
        visibility: 'shared',
        ownerUserId: undefined,
        updatedAt: new Date(0),
      };
      if (viewer && !this.canViewWhatsappChat(settings, viewer)) return;
      const last = lastMessageStmt.get(companyId, row.chatId) as any;
      const contactId = last?.contactId || undefined;
      const contactName = contactId
        ? ((contactNameStmt.get(contactId) as any)?.name ?? undefined)
        : undefined;
      out.push({
        chatId: row.chatId,
        phone: row.phone,
        contactId,
        contactName,
        lastMessageAt: new Date(row.lastAt),
        lastMessageBody: last?.body ?? '',
        lastMessageDirection: (last?.direction as WhatsAppMessageDirection) || 'inbound',
        unreadCount: Number(row.unreadCount) || 0,
        messageCount: Number(row.messageCount) || 0,
        visibility: settings.visibility,
        ownerUserId: settings.ownerUserId,
      });
    });

    return out;
  }

  markWhatsappChatRead(companyId: string, chatId: string): number {
    const now = new Date().toISOString();
    const res = this.db
      .prepare(
        `UPDATE whatsapp_messages
           SET readAt = ?, status = CASE WHEN status = 'pending' OR status = 'sent' OR status = 'delivered' THEN 'read' ELSE status END
           WHERE companyId = ? AND chatId = ? AND direction = 'inbound' AND readAt IS NULL`,
      )
      .run(now, companyId, chatId);
    return res.changes ?? 0;
  }

  /**
   * Backfills history from Green API response payload. Returns inserted count.
   */
  importWhatsappHistory(
    companyId: string,
    instanceId: string,
    chatId: string,
    rawMessages: any[],
  ): number {
    let inserted = 0;
    rawMessages.forEach((raw) => {
      try {
        const externalId = String(raw?.idMessage || '');
        if (!externalId) return;
        const type = String(raw?.type || raw?.typeMessage || '').toLowerCase();
        const direction: WhatsAppMessageDirection = type === 'incoming' ? 'inbound' : 'outbound';
        const body =
          raw?.textMessage ||
          raw?.text ||
          raw?.textMessageData?.textMessage ||
          raw?.extendedTextMessageData?.text ||
          raw?.caption ||
          '';
        const mediaUrl = raw?.downloadUrl || raw?.fileMessageData?.downloadUrl;
        const fileName = raw?.fileName || raw?.fileMessageData?.fileName;
        const messageType: WhatsAppMessageType = mediaUrl ? 'file' : 'text';
        const status: WhatsAppMessageStatus =
          direction === 'inbound'
            ? 'delivered'
            : ((String(raw?.statusMessage || raw?.status || '').toLowerCase() as WhatsAppMessageStatus) ||
              'sent');
        const ts = Number(raw?.timestamp) || Math.floor(Date.now() / 1000);
        const when = new Date(ts * 1000);
        const phone = chatId.replace(/@c\.us$/, '');
        const before = this.db
          .prepare('SELECT 1 FROM whatsapp_messages WHERE externalId = ? AND companyId = ?')
          .get(externalId, companyId);
        this.createWhatsappMessage({
          companyId,
          instanceId,
          direction,
          externalId,
          chatId,
          phone,
          type: messageType,
          body,
          mediaUrl,
          fileName,
          status,
          sentAt: direction === 'outbound' ? when : undefined,
          receivedAt: direction === 'inbound' ? when : undefined,
          createdAt: when,
        });
        if (!before) inserted += 1;
      } catch {
        /* skip malformed entry */
      }
    });
    return inserted;
  }

  updateWhatsappMessageStatus(
    externalId: string,
    status: WhatsAppMessageStatus,
    timestamp?: Date,
  ): WhatsAppMessage | undefined {
    if (!externalId) return undefined;
    const ts = (timestamp || new Date()).toISOString();
    const setColumn =
      status === 'delivered'
        ? 'deliveredAt = ?'
        : status === 'read'
          ? 'readAt = ?'
          : status === 'sent'
            ? 'sentAt = COALESCE(sentAt, ?)'
            : 'createdAt = COALESCE(createdAt, ?)';
    this.db
      .prepare(`UPDATE whatsapp_messages SET status = ?, ${setColumn} WHERE externalId = ?`)
      .run(status, ts, externalId);
    const row = this.db
      .prepare('SELECT * FROM whatsapp_messages WHERE externalId = ?')
      .get(externalId) as any;
    return row ? this.decodeWhatsappMessage(row) : undefined;
  }

  cancelDelivery(id: string, reason?: string): Delivery {
    const delivery = this.getDeliveryById(id);
    if (!delivery) throw new Error('Delivery not found.');
    if (delivery.status === 'Cancelled') return delivery;
    if (delivery.status === 'Delivered') {
      throw new Error('Delivered shipments cannot be cancelled. Create a return instead.');
    }

    const order = this.getSalesOrderById(delivery.salesOrderId);
    const cancelledAt = new Date();

    const wasShipped = delivery.status === 'Shipped';
    const updateItemQty = this.db.prepare(
      'UPDATE inventory_items SET onHand = onHand + ? WHERE id = ? AND companyId = ?',
    );

    const trx = this.db.transaction(() => {
      if (wasShipped) {
        // reverse stock movements
        delivery.items.forEach((line) => {
          if (!line.inventoryItemId) return;
          const inventoryItem = this.getInventoryItemById(line.inventoryItemId);
          if (!inventoryItem || !inventoryItem.tracksInventory) return;
          const location = this.normalizeInventoryLocation(line.location || inventoryItem.location);
          updateItemQty.run(line.quantity, line.inventoryItemId, delivery.companyId);
          this.incrementLocationBalance(
            delivery.companyId,
            line.inventoryItemId,
            location,
            line.quantity,
          );
          this.createStockMovement({
            companyId: delivery.companyId,
            inventoryItemId: line.inventoryItemId,
            movementType: 'Adjustment',
            quantityChange: line.quantity,
            unitCost: inventoryItem.unitCost,
            referenceType: 'delivery',
            referenceId: delivery.id,
            note: `Reversal of ${delivery.deliveryNumber}${reason ? ` (${reason})` : ''}`,
          });
        });
      }

      this.db
        .prepare('UPDATE deliveries SET status = ?, cancelledAt = ?, notes = COALESCE(notes, ?) WHERE id = ?')
        .run('Cancelled', cancelledAt.toISOString(), reason ?? null, id);
    });

    trx();

    const updated = this.getDeliveryById(id);
    if (!updated) throw new Error('Delivery not found after cancellation.');
    this.createActivityEvent({
      companyId: updated.companyId,
      entityType: 'delivery',
      entityId: updated.id,
      action: 'cancelled',
      summary: `Delivery ${updated.deliveryNumber} cancelled${wasShipped ? ' (stock reversed)' : ''}.`,
      metadata: { salesOrderId: order?.id, reason, reversed: wasShipped },
    });
    return updated;
  }

  receivePurchaseOrder(
    id: string,
    input: {
      receivedAt?: Date | string;
      notes?: string;
      items: Array<{
        lineIndex: number;
        quantity: number;
        lotNumber?: string;
        expiryDate?: Date | string;
        manufactureDate?: Date | string;
      }>;
    },
  ): PurchaseOrder {
    const order = this.getPurchaseOrderById(id);
    if (!order) {
      throw new Error('Purchase order not found.');
    }
    if (order.status === 'Cancelled') {
      throw new Error('Cancelled purchase orders cannot be received.');
    }
    if (order.approvalStatus === 'pending' || order.approvalStatus === 'rejected') {
      throw new Error('Purchase order must be approved before it can be received.');
    }

    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
    const receivedByLine = this.getReceivedQuantityByLine(order.id);
    const normalizedItems = input.items
      .map((item) => ({
        lineIndex: Number(item.lineIndex),
        quantity: Number(item.quantity),
        lotNumber: item.lotNumber?.trim() || undefined,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
        manufactureDate: item.manufactureDate ? new Date(item.manufactureDate) : undefined,
      }))
      .filter((item) => Number.isInteger(item.lineIndex) && Number.isFinite(item.quantity) && item.quantity > 0);

    if (!normalizedItems.length) {
      throw new Error('Receipt requires at least one positive quantity.');
    }

    const receiptItems = normalizedItems.map((item) => {
      const orderItem = order.items[item.lineIndex];
      if (!orderItem) {
        throw new Error(`Purchase order line ${item.lineIndex} does not exist.`);
      }
      const previouslyReceived = receivedByLine.get(item.lineIndex) || 0;
      const remainingQuantity = Number((orderItem.quantity - previouslyReceived).toFixed(4));
      if (remainingQuantity <= 0) {
        throw new Error(`Purchase order line ${item.lineIndex} has already been fully received.`);
      }
      if (item.quantity > remainingQuantity + 0.0001) {
        throw new Error(`Receipt quantity for line ${item.lineIndex} exceeds the remaining amount.`);
      }

      return {
        lineIndex: item.lineIndex,
        inventoryItemId: orderItem.inventoryItemId,
        sku: orderItem.sku,
        description: orderItem.description,
        quantity: Number(item.quantity.toFixed(4)),
        unitCost: orderItem.unitCost,
        lotNumber: item.lotNumber,
        expiryDate: item.expiryDate,
        manufactureDate: item.manufactureDate,
      };
    });

    const receipt: PurchaseReceipt = {
      id: uuid(),
      companyId: order.companyId,
      purchaseOrderId: order.id,
      receivedAt,
      notes: input.notes ?? undefined,
      items: receiptItems,
    };

    const insertReceipt = this.db.prepare(
      'INSERT INTO purchase_receipts (id, companyId, purchaseOrderId, receivedAt, notes, items) VALUES (@id, @companyId, @purchaseOrderId, @receivedAt, @notes, @items)',
    );
    const updateById = this.db.prepare(
      'UPDATE inventory_items SET onHand = onHand + ? WHERE id = ? AND companyId = ?',
    );
    const updateOrder = this.db.prepare(
      'UPDATE purchase_orders SET status = ?, receivedAt = ? WHERE id = ?',
    );

    const trx = this.db.transaction(() => {
      insertReceipt.run({
        ...receipt,
        receivedAt: receipt.receivedAt.toISOString(),
        notes: receipt.notes ?? null,
        items: JSON.stringify(receipt.items),
      });

      receipt.items.forEach((item) => {
        let inventoryItemId = item.inventoryItemId;
        let inventoryItem = inventoryItemId ? this.getInventoryItemById(inventoryItemId) : undefined;
        if (!inventoryItem && item.sku) {
          inventoryItem = this.getInventoryItemBySku(order.companyId, item.sku);
          inventoryItemId = inventoryItem?.id;
        }
        if (inventoryItemId) {
          if (!inventoryItem?.tracksInventory) {
            return;
          }
          const stockLocation = this.resolveStockLocation(order.companyId, inventoryItem?.location);
          if (item.lotNumber) {
            // GRN with batch capture: createInventoryLot handles the onHand +
            // location balance + traceable stock movement for this lot.
            this.createInventoryLot({
              companyId: order.companyId,
              inventoryItemId,
              lotNumber: item.lotNumber,
              quantity: item.quantity,
              location: stockLocation,
              unitCost: item.unitCost,
              expiryDate: item.expiryDate,
              manufactureDate: item.manufactureDate,
              supplierId: order.supplierId,
              receivedAt: receipt.receivedAt,
              note: `GRN from ${order.orderNumber}`,
            });
          } else {
            updateById.run(item.quantity, inventoryItemId, order.companyId);
            this.incrementLocationBalance(
              order.companyId,
              inventoryItemId,
              stockLocation,
              item.quantity,
            );
            this.createStockMovement({
              companyId: order.companyId,
              inventoryItemId,
              movementType: 'Receipt',
              quantityChange: item.quantity,
              unitCost: item.unitCost,
              referenceType: 'purchase_order',
              referenceId: order.id,
              note: `Receipt from ${order.orderNumber}`,
            });
          }
        }
      });

      const refreshedByLine = new Map(receivedByLine);
      receipt.items.forEach((item) => {
        refreshedByLine.set(
          item.lineIndex,
          Number(((refreshedByLine.get(item.lineIndex) || 0) + item.quantity).toFixed(4)),
        );
      });
      const allReceived = order.items.every((item, lineIndex) => {
        const totalReceived = refreshedByLine.get(lineIndex) || 0;
        return totalReceived >= item.quantity - 0.0001;
      });
      updateOrder.run(
        allReceived ? 'Received' : 'Partially Received',
        receipt.receivedAt.toISOString(),
        order.id,
      );
    });

    trx();

    const updated = this.getPurchaseOrderById(order.id);
    if (!updated) {
      throw new Error('Purchase order not found after receipt.');
    }
    this.createActivityEvent({
      companyId: updated.companyId,
      entityType: 'purchase_order',
      entityId: updated.id,
      action: 'received',
      summary: `Receipt recorded for purchase order ${updated.orderNumber}.`,
      metadata: {
        status: updated.status,
        receivedLines: receipt.items.map((item) => ({
          lineIndex: item.lineIndex,
          quantity: item.quantity,
        })),
      },
    });
    return updated;
  }

  // ── Purchase requisitions ─────────────────────────────────────────────────

  private normalizeRequisitionItems(
    items: PurchaseRequisitionLineItem[],
  ): PurchaseRequisitionLineItem[] {
    const normalized = (items || [])
      .map((item) => ({
        inventoryItemId: item.inventoryItemId || undefined,
        sku: item.sku || undefined,
        description: String(item.description || '').trim(),
        quantity: Number(item.quantity || 0),
        estimatedUnitCost: Number(item.estimatedUnitCost || 0),
      }))
      .filter((item) => item.description.length > 0 && item.quantity > 0);
    if (normalized.length === 0) {
      throw new Error('A requisition needs at least one line with a description and quantity.');
    }
    return normalized;
  }

  listPurchaseRequisitions(companyId: string): PurchaseRequisition[] {
    const rows = this.db
      .prepare('SELECT * FROM purchase_requisitions WHERE companyId = ? ORDER BY createdAt DESC')
      .all(companyId) as any[];
    return rows.map((row) => this.decodePurchaseRequisition(row));
  }

  getPurchaseRequisitionById(id: string): PurchaseRequisition | undefined {
    const row = this.db.prepare('SELECT * FROM purchase_requisitions WHERE id = ?').get(id) as any;
    return row ? this.decodePurchaseRequisition(row) : undefined;
  }

  createPurchaseRequisition(input: CreatePurchaseRequisitionInput): PurchaseRequisition {
    const items = this.normalizeRequisitionItems(input.items);
    const nowIso = new Date().toISOString();
    const requisition: PurchaseRequisition = {
      id: uuid(),
      companyId: input.companyId,
      requisitionNumber: this.nextConfiguredSequenceValue(input.companyId, 'purchase_requisition'),
      requestedByUserId: this.currentActor?.userId,
      department: input.department,
      status: 'Draft',
      items,
      neededBy: input.neededBy ? new Date(input.neededBy) : undefined,
      notes: input.notes,
      preferredSupplierId: input.preferredSupplierId,
      createdAt: new Date(nowIso),
      updatedAt: new Date(nowIso),
    };
    this.db
      .prepare(
        'INSERT INTO purchase_requisitions (id, companyId, requisitionNumber, requestedByUserId, department, status, items, neededBy, notes, preferredSupplierId, approvedByUserId, approvedAt, rejectionReason, purchaseOrderId, createdAt, updatedAt) VALUES (@id, @companyId, @requisitionNumber, @requestedByUserId, @department, @status, @items, @neededBy, @notes, @preferredSupplierId, NULL, NULL, NULL, NULL, @createdAt, @updatedAt)',
      )
      .run({
        ...requisition,
        requestedByUserId: requisition.requestedByUserId ?? null,
        department: requisition.department ?? null,
        items: JSON.stringify(requisition.items),
        neededBy: requisition.neededBy ? requisition.neededBy.toISOString() : null,
        notes: requisition.notes ?? null,
        preferredSupplierId: requisition.preferredSupplierId ?? null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    this.createActivityEvent({
      companyId: requisition.companyId,
      entityType: 'purchase_requisition',
      entityId: requisition.id,
      action: 'created',
      summary: `Purchase requisition ${requisition.requisitionNumber} created.`,
      metadata: { lines: requisition.items.length },
    });
    return requisition;
  }

  private setRequisitionStatus(
    id: string,
    status: PurchaseRequisitionStatus,
    extra: Partial<Pick<PurchaseRequisition, 'approvedByUserId' | 'approvedAt' | 'rejectionReason' | 'purchaseOrderId'>> = {},
  ): PurchaseRequisition {
    const existing = this.getPurchaseRequisitionById(id);
    if (!existing) throw new Error('Purchase requisition not found.');
    const nowIso = new Date().toISOString();
    this.db
      .prepare(
        'UPDATE purchase_requisitions SET status = ?, approvedByUserId = COALESCE(?, approvedByUserId), approvedAt = COALESCE(?, approvedAt), rejectionReason = ?, purchaseOrderId = COALESCE(?, purchaseOrderId), updatedAt = ? WHERE id = ?',
      )
      .run(
        status,
        extra.approvedByUserId ?? null,
        extra.approvedAt ? extra.approvedAt.toISOString() : null,
        extra.rejectionReason ?? null,
        extra.purchaseOrderId ?? null,
        nowIso,
        id,
      );
    return this.getPurchaseRequisitionById(id)!;
  }

  submitPurchaseRequisition(id: string): PurchaseRequisition {
    const existing = this.getPurchaseRequisitionById(id);
    if (!existing) throw new Error('Purchase requisition not found.');
    if (existing.status !== 'Draft') {
      throw new Error('Only draft requisitions can be submitted.');
    }
    return this.setRequisitionStatus(id, 'Submitted');
  }

  approvePurchaseRequisition(id: string): PurchaseRequisition {
    const existing = this.getPurchaseRequisitionById(id);
    if (!existing) throw new Error('Purchase requisition not found.');
    if (existing.status !== 'Submitted') {
      throw new Error('Only submitted requisitions can be approved.');
    }
    this.createActivityEvent({
      companyId: existing.companyId,
      entityType: 'purchase_requisition',
      entityId: id,
      action: 'approved',
      summary: `Purchase requisition ${existing.requisitionNumber} approved.`,
    });
    return this.setRequisitionStatus(id, 'Approved', {
      approvedByUserId: this.currentActor?.userId,
      approvedAt: new Date(),
    });
  }

  rejectPurchaseRequisition(id: string, reason?: string): PurchaseRequisition {
    const existing = this.getPurchaseRequisitionById(id);
    if (!existing) throw new Error('Purchase requisition not found.');
    if (existing.status !== 'Submitted') {
      throw new Error('Only submitted requisitions can be rejected.');
    }
    return this.setRequisitionStatus(id, 'Rejected', { rejectionReason: reason });
  }

  /** Convert an approved requisition into a purchase order for the given supplier. */
  convertRequisitionToPurchaseOrder(id: string, supplierId: string): PurchaseOrder {
    const requisition = this.getPurchaseRequisitionById(id);
    if (!requisition) throw new Error('Purchase requisition not found.');
    if (requisition.status !== 'Approved') {
      throw new Error('Only approved requisitions can be converted to a purchase order.');
    }
    if (requisition.purchaseOrderId) {
      throw new Error('This requisition has already been converted.');
    }
    const supplier = this.getSupplierById(supplierId);
    if (!supplier || supplier.companyId !== requisition.companyId) {
      throw new Error('Supplier does not belong to this company.');
    }

    const order = this.createPurchaseOrder({
      companyId: requisition.companyId,
      supplierName: supplier.name,
      supplierId: supplier.id,
      orderDate: new Date(),
      status: 'Draft',
      notes: `From requisition ${requisition.requisitionNumber}${requisition.notes ? ` — ${requisition.notes}` : ''}`,
      items: requisition.items.map((item) => ({
        inventoryItemId: item.inventoryItemId,
        sku: item.sku,
        description: item.description,
        quantity: item.quantity,
        unitCost: item.estimatedUnitCost,
        lineTotal: Number((item.quantity * item.estimatedUnitCost).toFixed(2)),
      })),
    });

    this.setRequisitionStatus(id, 'Converted', { purchaseOrderId: order.id });
    this.createActivityEvent({
      companyId: requisition.companyId,
      entityType: 'purchase_requisition',
      entityId: id,
      action: 'converted',
      summary: `Requisition ${requisition.requisitionNumber} converted to purchase order ${order.orderNumber}.`,
      metadata: { purchaseOrderId: order.id },
    });
    return order;
  }

  deletePurchaseRequisition(id: string): boolean {
    const existing = this.getPurchaseRequisitionById(id);
    if (!existing) return false;
    if (existing.status === 'Converted') {
      throw new Error('Converted requisitions cannot be deleted.');
    }
    this.db.prepare('DELETE FROM purchase_requisitions WHERE id = ?').run(id);
    return true;
  }

  private decodePurchaseRequisition(row: any): PurchaseRequisition {
    const parsedItems = this.parseJson<any[]>(row.items);
    return {
      id: row.id,
      companyId: row.companyId,
      requisitionNumber: row.requisitionNumber,
      requestedByUserId: row.requestedByUserId ?? undefined,
      department: row.department ?? undefined,
      status: row.status as PurchaseRequisitionStatus,
      items: (Array.isArray(parsedItems) ? parsedItems : []).map((item: any) => ({
        inventoryItemId: item.inventoryItemId ?? undefined,
        sku: item.sku ?? undefined,
        description: String(item.description || ''),
        quantity: Number(item.quantity) || 0,
        estimatedUnitCost: Number(item.estimatedUnitCost) || 0,
      })),
      neededBy: row.neededBy ? new Date(row.neededBy) : undefined,
      notes: row.notes ?? undefined,
      preferredSupplierId: row.preferredSupplierId ?? undefined,
      approvedByUserId: row.approvedByUserId ?? undefined,
      approvedAt: row.approvedAt ? new Date(row.approvedAt) : undefined,
      rejectionReason: row.rejectionReason ?? undefined,
      purchaseOrderId: row.purchaseOrderId ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  // ── Standalone expenses ───────────────────────────────────────────────────

  listExpenses(companyId: string): Expense[] {
    const rows = this.db
      .prepare('SELECT * FROM expenses WHERE companyId = ? ORDER BY expenseDate DESC, createdAt DESC')
      .all(companyId) as any[];
    return rows.map((row) => this.decodeExpense(row));
  }

  getExpenseById(id: string): Expense | undefined {
    const row = this.db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as any;
    return row ? this.decodeExpense(row) : undefined;
  }

  createExpense(input: CreateExpenseInput): Expense {
    const category = (input.category || '').trim();
    if (!category) throw new Error('Expense category is required.');
    const amount = Number(input.amount || 0);
    if (!(amount > 0)) throw new Error('Expense amount must be greater than zero.');
    if (input.projectId) {
      const project = this.getProjectById(input.projectId);
      if (!project || project.companyId !== input.companyId) {
        throw new Error('Project does not belong to this company.');
      }
    }
    const nowIso = new Date().toISOString();
    const expense: Expense = {
      id: uuid(),
      companyId: input.companyId,
      expenseDate: input.expenseDate ? new Date(input.expenseDate) : new Date(),
      category,
      vendor: input.vendor?.trim() || undefined,
      amount: Number(amount.toFixed(2)),
      description: input.description?.trim() || undefined,
      paymentMethod: input.paymentMethod?.trim() || undefined,
      reference: input.reference?.trim() || undefined,
      projectId: input.projectId || undefined,
      attachmentUrl: input.attachmentUrl || undefined,
      createdAt: new Date(nowIso),
      updatedAt: new Date(nowIso),
    };
    this.db
      .prepare(
        'INSERT INTO expenses (id, companyId, expenseDate, category, vendor, amount, description, paymentMethod, reference, projectId, attachmentUrl, createdAt, updatedAt) VALUES (@id, @companyId, @expenseDate, @category, @vendor, @amount, @description, @paymentMethod, @reference, @projectId, @attachmentUrl, @createdAt, @updatedAt)',
      )
      .run({
        ...expense,
        expenseDate: expense.expenseDate.toISOString(),
        vendor: expense.vendor ?? null,
        description: expense.description ?? null,
        paymentMethod: expense.paymentMethod ?? null,
        reference: expense.reference ?? null,
        projectId: expense.projectId ?? null,
        attachmentUrl: expense.attachmentUrl ?? null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    this.createActivityEvent({
      companyId: expense.companyId,
      entityType: 'expense',
      entityId: expense.id,
      action: 'created',
      summary: `Expense recorded: ${expense.category} (${expense.amount}).`,
      metadata: { amount: expense.amount, vendor: expense.vendor ?? null },
    });
    return expense;
  }

  deleteExpense(id: string): boolean {
    const existing = this.getExpenseById(id);
    if (!existing) return false;
    this.db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
    return true;
  }

  private sumExpensesBetween(companyId: string, fromIso: string, toIso: string): number {
    const row = this.db
      .prepare(
        'SELECT COALESCE(SUM(amount), 0) as amount FROM expenses WHERE companyId = ? AND expenseDate >= ? AND expenseDate < ?',
      )
      .get(companyId, fromIso, toIso) as { amount: number };
    return Number(row.amount || 0);
  }

  private decodeExpense(row: any): Expense {
    return {
      id: row.id,
      companyId: row.companyId,
      expenseDate: new Date(row.expenseDate),
      category: row.category,
      vendor: row.vendor ?? undefined,
      amount: Number(row.amount) || 0,
      description: row.description ?? undefined,
      paymentMethod: row.paymentMethod ?? undefined,
      reference: row.reference ?? undefined,
      projectId: row.projectId ?? undefined,
      attachmentUrl: row.attachmentUrl ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  listInvoices(companyId: string): Invoice[] {
    const rows = this.db
      .prepare('SELECT * FROM invoices WHERE companyId = ?')
      .all(companyId) as any[];
    return rows.map((row) => this.decodeInvoice(row));
  }

  getInvoiceById(id: string): Invoice | undefined {
    const row = this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any;
    return row ? this.decodeInvoice(row) : undefined;
  }

  private assertUniqueInvoiceNumber(companyId: string, invoiceNumber: string, ignoreInvoiceId?: string) {
    const row = this.db
      .prepare(
        'SELECT id FROM invoices WHERE companyId = ? AND invoiceNumber = ? AND (? IS NULL OR id != ?) LIMIT 1',
      )
      .get(companyId, invoiceNumber, ignoreInvoiceId ?? null, ignoreInvoiceId ?? null);
    if (row) {
      throw new Error(`Invoice number ${invoiceNumber} already exists for this company.`);
    }
  }

  createInvoice(
    invoice: Omit<Invoice, 'id' | 'invoiceNumber'> & {
      invoiceNumber?: string;
      issueDate: Date | string;
      dueDate: Date | string;
    },
  ) {
    const normalizedLineItems = this.normalizeInvoiceLineItems(invoice.lineItems);
    const computedTotal = normalizedLineItems.reduce((sum, item) => sum + item.amount, 0);
    const newInvoice: Invoice = {
      ...invoice,
      id: uuid(),
      invoiceNumber: invoice.invoiceNumber || this.nextSalesInvoiceNumber(invoice.companyId),
      issueDate: new Date(invoice.issueDate),
      dueDate: new Date(invoice.dueDate),
      lineItems: normalizedLineItems,
      total: Number(computedTotal.toFixed(2)),
    };
    this.assertOpenFinancialDate(newInvoice.companyId, newInvoice.issueDate, 'Invoice issue date');
    this.assertUniqueInvoiceNumber(newInvoice.companyId, newInvoice.invoiceNumber);
    const snapshot = this.resolveInvoiceTemplateSnapshot(newInvoice.companyId, newInvoice.templateId);
    this.db
      .prepare(
        'INSERT INTO invoices (id, invoiceNumber, companyId, clientId, contactId, salesOrderId, templateId, templateSnapshot, campaignId, issueDate, dueDate, lineItems, total, status, notes, currency, taxRate, sentAt, paidAt) VALUES (@id, @invoiceNumber, @companyId, @clientId, @contactId, @salesOrderId, @templateId, @templateSnapshot, @campaignId, @issueDate, @dueDate, @lineItems, @total, @status, @notes, @currency, @taxRate, @sentAt, @paidAt)',
      )
      .run({
        ...newInvoice,
        contactId: newInvoice.contactId ?? null,
        salesOrderId: newInvoice.salesOrderId ?? null,
        templateId: newInvoice.templateId ?? null,
        templateSnapshot: snapshot ? JSON.stringify(snapshot) : null,
        campaignId: newInvoice.campaignId ?? null,
        issueDate: newInvoice.issueDate.toISOString(),
        dueDate: newInvoice.dueDate.toISOString(),
        lineItems: JSON.stringify(normalizedLineItems),
        notes: newInvoice.notes ?? null,
        currency: newInvoice.currency ?? 'USD',
        taxRate: newInvoice.taxRate ?? 0,
        sentAt: newInvoice.sentAt ? newInvoice.sentAt.toISOString() : null,
        paidAt: newInvoice.paidAt ? newInvoice.paidAt.toISOString() : null,
      });

    if (invoice.contactId) {
      this.addContactRole(invoice.contactId, invoice.companyId, 'Client', 'Invoice');
    }
    if (newInvoice.salesOrderId) {
      this.db
        .prepare('UPDATE sales_orders SET status = ?, invoiceId = ? WHERE id = ?')
        .run('Invoiced', newInvoice.id, newInvoice.salesOrderId);
    }
    // Only recognise revenue once the invoice leaves Draft. A Draft (e.g. a
    // freshly generated campaign invoice) is a working document and must not
    // hit the ledger until it is issued/Sent. postInvoiceJournal is idempotent,
    // so the posting happens on the Draft→Sent/Paid transition instead.
    if (newInvoice.status !== 'Draft') {
      try {
        this.postInvoiceJournal(newInvoice);
      } catch (error) {
        console.error('Failed to auto-post invoice journal', error);
      }
    }
    // Trigger commission recalc for any opportunity linked via the won-SO.
    // This is the InvoiceCreated trigger: a Revenue-basis commission can now
    // use the actual invoice total instead of the original forecast.
    try {
      const oppId = this.findOpportunityIdForInvoice(newInvoice);
      if (oppId) this.calculateCommissionsForOpportunity(oppId);
      // v2 engine: one commission row per contributor per invoice
      this.recomputeCommissionsForInvoice(newInvoice.id);
    } catch (error) {
      console.error('Failed to recalc commissions on invoice create', error);
    }

    this.createActivityEvent({
      companyId: newInvoice.companyId,
      entityType: 'invoice',
      entityId: newInvoice.id,
      action: 'created',
      summary: `Invoice ${newInvoice.invoiceNumber} created.`,
      metadata: { status: newInvoice.status, total: newInvoice.total, clientId: newInvoice.clientId, salesOrderId: newInvoice.salesOrderId },
    });
    if (newInvoice.status === 'Paid' && newInvoice.total > 0) {
      this.createPayment({
        invoiceId: newInvoice.id,
        amount: newInvoice.total,
        method: 'Manual settlement',
        note: 'Created as fully paid',
        paidAt: newInvoice.paidAt ?? new Date(),
      });
    }
    return this.getInvoiceById(newInvoice.id) ?? newInvoice;
  }

  updateInvoiceStatus(invoiceId: string, status: InvoiceStatus) {
    const existing = this.getInvoiceById(invoiceId);
    if (!existing) return undefined;

    if (status === 'Paid') {
      const outstandingAmount = existing.outstandingAmount ?? existing.total;
      if (outstandingAmount <= 0) {
        this.db
          .prepare('UPDATE invoices SET status = ?, paidAt = ? WHERE id = ?')
          .run('Paid', existing.paidAt ? existing.paidAt.toISOString() : new Date().toISOString(), invoiceId);
        return this.getInvoiceById(invoiceId);
      }
      // Moving straight to Paid leaves Draft — recognise revenue before the
      // payment's cash/AR entry so accounts receivable nets to zero.
      try {
        this.postInvoiceJournal(existing);
      } catch (error) {
        console.error('Failed to auto-post invoice journal', error);
      }
      this.createPayment({
        invoiceId: existing.id,
        amount: outstandingAmount,
        method: 'Manual settlement',
        note: 'Settled from status update',
        paidAt: new Date(),
      });
      return this.getInvoiceById(invoiceId);
    }

    if (status === 'Draft' && (existing.paidAmount ?? 0) > 0) {
      throw new Error('Invoices with recorded payments cannot be moved back to Draft.');
    }

    const sentAt =
      status === 'Sent'
        ? existing.sentAt?.toISOString() ?? new Date().toISOString()
        : status === 'Draft'
          ? null
          : existing.sentAt?.toISOString() ?? null;
    const paidAt = null;

    this.db
      .prepare('UPDATE invoices SET status = ?, sentAt = ?, paidAt = ? WHERE id = ?')
      .run(status, sentAt, paidAt, invoiceId);
    const updated = this.getInvoiceById(invoiceId);
    if (!updated) return undefined;
    // Recognise revenue when the invoice leaves Draft (idempotent).
    if (updated.status !== 'Draft') {
      try {
        this.postInvoiceJournal(updated);
      } catch (error) {
        console.error('Failed to auto-post invoice journal', error);
      }
    }
    this.createActivityEvent({
      companyId: updated.companyId,
      entityType: 'invoice',
      entityId: updated.id,
      action: 'status_changed',
      summary: `Invoice ${updated.invoiceNumber} moved to ${updated.status}.`,
      metadata: { status: updated.status, total: updated.total, outstandingAmount: updated.outstandingAmount },
    });

    // Auto-follow-up: when an invoice flips to Sent for the first time,
    // remind the rep to confirm receipt.
    if (status === 'Sent' && existing.status !== 'Sent') {
      const contactId =
        updated.contactId ||
        this.contactIdForClient(updated.clientId, updated.companyId);
      if (contactId) {
        try {
          this.scheduleAutomaticFollowup({
            companyId: updated.companyId,
            contactId,
            trigger: 'InvoiceSent',
            sourceType: 'invoice',
            sourceId: updated.id,
            summary: `Invoice ${updated.invoiceNumber} was sent — confirm receipt.`,
            nextAction: `Confirm client received invoice ${updated.invoiceNumber}.`,
            offsetDays: 3,
            category: 'Email',
          });
        } catch (error) {
          console.error('Failed to schedule InvoiceSent follow-up', error);
        }
      }
    }

    return updated;
  }

  updateInvoice(invoiceId: string, updates: Partial<Omit<Invoice, 'id'>>) {
    const existing = this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!existing) return undefined;

    const currentLineItems = this.normalizeInvoiceLineItems(this.parseJson(existing.lineItems) || []);
    const nextLineItems = this.normalizeInvoiceLineItems(
      updates.lineItems ?? currentLineItems,
    );
    const computedTotal = nextLineItems.reduce((sum, item) => sum + item.amount, 0);
    const paidAmount = this.getInvoicePaidAmount(invoiceId);
    if (computedTotal + 0.0001 < paidAmount) {
      throw new Error('Invoice total cannot be lower than recorded payments.');
    }

    const merged = {
      ...existing,
      ...updates,
      issueDate: (updates.issueDate ? new Date(updates.issueDate) : new Date(existing.issueDate)).toISOString(),
      dueDate: (updates.dueDate ? new Date(updates.dueDate) : new Date(existing.dueDate)).toISOString(),
      lineItems: JSON.stringify(nextLineItems),
      notes: updates.notes ?? existing.notes,
      salesOrderId: updates.salesOrderId ?? existing.salesOrderId,
      templateId: updates.templateId ?? existing.templateId,
      currency: updates.currency ?? existing.currency ?? 'USD',
      taxRate: updates.taxRate ?? existing.taxRate ?? 0,
      sentAt: updates.sentAt ? new Date(updates.sentAt).toISOString() : existing.sentAt,
      paidAt: updates.paidAt ? new Date(updates.paidAt).toISOString() : existing.paidAt,
      total: Number(computedTotal.toFixed(2)),
      status: updates.status ?? existing.status,
    };
    this.assertOpenFinancialDate(merged.companyId, new Date(merged.issueDate), 'Invoice issue date');
    this.assertUniqueInvoiceNumber(merged.companyId, merged.invoiceNumber, invoiceId);
    // Re-freeze the appearance snapshot only when the chosen template changes;
    // otherwise the invoice keeps the look it was issued with.
    const templateChanged =
      updates.templateId !== undefined && updates.templateId !== existing.templateId;
    const nextSnapshot = templateChanged
      ? this.resolveInvoiceTemplateSnapshot(merged.companyId, merged.templateId ?? undefined)
      : (existing as any).templateSnapshot;
    this.db
      .prepare(
        'UPDATE invoices SET invoiceNumber=@invoiceNumber, companyId=@companyId, clientId=@clientId, salesOrderId=@salesOrderId, templateId=@templateId, templateSnapshot=@templateSnapshot, issueDate=@issueDate, dueDate=@dueDate, lineItems=@lineItems, total=@total, status=@status, notes=@notes, currency=@currency, taxRate=@taxRate, sentAt=@sentAt, paidAt=@paidAt WHERE id=@id',
      )
      .run({
        ...merged,
        id: invoiceId,
        salesOrderId: merged.salesOrderId ?? null,
        templateId: merged.templateId ?? null,
        templateSnapshot: nextSnapshot
          ? typeof nextSnapshot === 'string'
            ? nextSnapshot
            : JSON.stringify(nextSnapshot)
          : null,
      });
    this.refreshInvoicePaymentStatus(invoiceId);
    const saved = this.getInvoiceById(invoiceId);
    // Recognise revenue if the edit moved the invoice out of Draft (idempotent).
    if (saved && saved.status !== 'Draft') {
      try {
        this.postInvoiceJournal(saved);
      } catch (error) {
        console.error('Failed to auto-post invoice journal', error);
      }
    }
    return saved;
  }

  private decodeInvoice(row: any): Invoice {
    const paidAmount = this.getInvoicePaidAmount(row.id);
    const creditedAmount = this.getInvoiceCreditedAmount(row.id);
    const total = Number(row.total) || 0;
    return {
      ...row,
      contactId: row.contactId ?? undefined,
      salesOrderId: row.salesOrderId ?? undefined,
      templateId: row.templateId ?? undefined,
      templateSnapshot: this.parseJson(row.templateSnapshot) ?? undefined,
      issueDate: new Date(row.issueDate),
      dueDate: new Date(row.dueDate),
      lineItems: this.normalizeInvoiceLineItems(this.parseJson(row.lineItems) || []),
      total,
      notes: row.notes ?? undefined,
      currency: row.currency ?? 'USD',
      taxRate: row.taxRate ?? 0,
      sentAt: row.sentAt ? new Date(row.sentAt) : undefined,
      paidAt: row.paidAt ? new Date(row.paidAt) : undefined,
      paidAmount,
      creditedAmount,
      outstandingAmount: Number(Math.max(0, total - paidAmount - creditedAmount).toFixed(2)),
    };
  }

  // ── Credit notes ───────────────────────────────────────────────────────────

  private decodeCreditNote(row: any): CreditNote {
    return {
      id: row.id,
      companyId: row.companyId,
      invoiceId: row.invoiceId ?? undefined,
      clientId: row.clientId,
      creditNoteNumber: row.creditNoteNumber,
      issueDate: new Date(row.issueDate),
      lineItems: (this.parseJson<CreditNoteLineItem[]>(row.lineItems) || []).map((l) => ({
        description: String(l.description ?? ''),
        amount: Number(l.amount) || 0,
      })),
      total: Number(row.total) || 0,
      reason: row.reason ?? undefined,
      status: row.status,
      createdAt: new Date(row.createdAt),
    };
  }

  /** Sum of issued (non-void) credit notes applied to an invoice. */
  getInvoiceCreditedAmount(invoiceId: string): number {
    const row = this.db
      .prepare(
        "SELECT COALESCE(SUM(total),0) AS t FROM credit_notes WHERE invoiceId = ? AND status = 'Issued'",
      )
      .get(invoiceId) as any;
    return Number(row?.t ?? 0);
  }

  private nextCreditNoteNumber(companyId: string): string {
    const row = this.db
      .prepare('SELECT COUNT(*) AS c FROM credit_notes WHERE companyId = ?')
      .get(companyId) as any;
    const seq = Number(row?.c ?? 0) + 1;
    return `CN-${String(seq).padStart(4, '0')}`;
  }

  listCreditNotes(companyId: string): CreditNote[] {
    const rows = this.db
      .prepare('SELECT * FROM credit_notes WHERE companyId = ? ORDER BY issueDate DESC, createdAt DESC')
      .all(companyId) as any[];
    return rows.map((r) => this.decodeCreditNote(r));
  }

  getCreditNoteById(id: string): CreditNote | undefined {
    const row = this.db.prepare('SELECT * FROM credit_notes WHERE id = ?').get(id) as any;
    return row ? this.decodeCreditNote(row) : undefined;
  }

  createCreditNote(input: {
    companyId: string;
    invoiceId?: string;
    clientId?: string;
    issueDate?: Date | string;
    lineItems: CreditNoteLineItem[];
    reason?: string;
  }): CreditNote {
    const lineItems = (input.lineItems || [])
      .map((l) => ({ description: String(l.description ?? '').trim(), amount: Number(l.amount) || 0 }))
      .filter((l) => l.amount !== 0 || l.description);
    if (lineItems.length === 0) {
      throw new Error('A credit note needs at least one line.');
    }
    const total = Number(lineItems.reduce((sum, l) => sum + l.amount, 0).toFixed(2));
    if (total <= 0) {
      throw new Error('Credit note total must be greater than zero.');
    }

    let clientId = input.clientId;
    if (input.invoiceId) {
      const invoice = this.getInvoiceById(input.invoiceId);
      if (!invoice || invoice.companyId !== input.companyId) {
        throw new Error('Invoice not found for this company.');
      }
      clientId = clientId ?? invoice.clientId;
      const alreadyCredited = this.getInvoiceCreditedAmount(invoice.id);
      if (total > invoice.total - alreadyCredited + 0.0001) {
        throw new Error('Credit note exceeds the invoice amount available to credit.');
      }
    }
    if (!clientId) throw new Error('A client is required.');

    const issueDate = input.issueDate ? new Date(input.issueDate) : new Date();
    this.assertOpenFinancialDate(input.companyId, issueDate, 'Credit note date');

    const note: CreditNote = {
      id: uuid(),
      companyId: input.companyId,
      invoiceId: input.invoiceId,
      clientId,
      creditNoteNumber: this.nextCreditNoteNumber(input.companyId),
      issueDate,
      lineItems,
      total,
      reason: input.reason,
      status: 'Issued',
      createdAt: new Date(),
    };

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO credit_notes (id, companyId, invoiceId, clientId, creditNoteNumber, issueDate, lineItems, total, reason, status, createdAt)
           VALUES (@id, @companyId, @invoiceId, @clientId, @creditNoteNumber, @issueDate, @lineItems, @total, @reason, @status, @createdAt)`,
        )
        .run({
          ...note,
          invoiceId: note.invoiceId ?? null,
          issueDate: note.issueDate.toISOString(),
          lineItems: JSON.stringify(note.lineItems),
          reason: note.reason ?? null,
          createdAt: note.createdAt.toISOString(),
        });
      // Reverse the sale: Dr Revenue, Cr Accounts Receivable.
      const arAccountId = this.getSystemAccountId(input.companyId, '1100');
      const revenueAccountId = this.getSystemAccountId(input.companyId, '4000');
      this.createJournalEntry({
        companyId: input.companyId,
        sourceType: 'credit_note',
        sourceId: note.id,
        memo: `Credit note ${note.creditNoteNumber}${note.invoiceId ? ` for invoice` : ''}`,
        entryDate: note.issueDate,
        lines: [
          { id: uuid(), accountId: revenueAccountId, description: 'Revenue reversal', debit: total, credit: 0 },
          { id: uuid(), accountId: arAccountId, description: 'Accounts receivable', debit: 0, credit: total },
        ],
      });
    });
    tx();
    // Keep the linked invoice's paid/overdue status in sync with the new credit.
    if (note.invoiceId) this.refreshInvoicePaymentStatus(note.invoiceId);
    return this.getCreditNoteById(note.id)!;
  }

  /**
   * Resolve a per-line discount into a net line value. `percent` is 0–100 of
   * the gross; `amount` is a fixed currency value subtracted from the gross.
   */
  private resolveLineDiscount(
    gross: number,
    rawDiscount: unknown,
    rawType: unknown,
  ): { discount: number; discountType: 'percent' | 'amount'; net: number } {
    const discountType = rawType === 'amount' ? 'amount' : 'percent';
    let discount = Number(rawDiscount ?? 0);
    if (!Number.isFinite(discount) || discount < 0) discount = 0;
    let discountValue = 0;
    if (discountType === 'percent') {
      discount = Math.min(discount, 100);
      discountValue = gross * (discount / 100);
    } else {
      discount = Math.min(discount, gross);
      discountValue = discount;
    }
    return {
      discount: Number(discount.toFixed(4)),
      discountType,
      net: Number(Math.max(0, gross - discountValue).toFixed(2)),
    };
  }

  private normalizeInvoiceLineItems(rawItems: any[]): Invoice['lineItems'] {
    return (Array.isArray(rawItems) ? rawItems : [])
      .map((item) => {
        const taskId = item?.taskId ? String(item.taskId) : undefined;
        const quantity = Number(item?.quantity ?? 1);
        const unitPrice = Number(item?.unitPrice ?? item?.amount ?? 0);
        const gross = (Number.isFinite(quantity) ? quantity : 1) * (Number.isFinite(unitPrice) ? unitPrice : 0);
        const hasDiscount = item?.discount != null && Number(item.discount) > 0;
        const { discount, discountType, net } = this.resolveLineDiscount(gross, item?.discount, item?.discountType);
        const amount = hasDiscount ? net : Number(item?.amount ?? gross);

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
          discount: hasDiscount ? discount : undefined,
          discountType: hasDiscount ? discountType : undefined,
          custom: item?.custom && typeof item.custom === 'object'
            ? Object.fromEntries(
                Object.entries(item.custom as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]),
              )
            : undefined,
        };
      })
      .filter((item) => item.description && item.amount >= 0)
      .map((item) => ({
        ...item,
        quantity: Number(item.quantity.toFixed(4)),
        unitPrice: Number(item.unitPrice.toFixed(4)),
        amount: Number(item.amount.toFixed(2)),
      }));
  }

  private normalizeSalesOrderItems(rawItems: any[]): SalesOrder['items'] {
    return (Array.isArray(rawItems) ? rawItems : [])
      .map((item) => {
        const quantity = Number(item?.quantity ?? 0);
        const unitPrice = Number(item?.unitPrice ?? 0);
        const gross = (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(unitPrice) ? unitPrice : 0);
        const hasDiscount = item?.discount != null && Number(item.discount) > 0;
        const { discount, discountType, net } = this.resolveLineDiscount(gross, item?.discount, item?.discountType);
        const lineTotal = hasDiscount ? net : Number(item?.lineTotal ?? gross);

        return {
          inventoryItemId: item?.inventoryItemId ? String(item.inventoryItemId) : undefined,
          sku: item?.sku ? String(item.sku) : undefined,
          description: String(item?.description || ''),
          quantity: Number.isFinite(quantity) ? quantity : 0,
          unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
          lineTotal: Number.isFinite(lineTotal) ? lineTotal : 0,
          discount: hasDiscount ? discount : undefined,
          discountType: hasDiscount ? discountType : undefined,
        };
      })
      .filter((item) => item.description && item.quantity > 0)
      .map((item) => ({
        ...item,
        quantity: Number(item.quantity.toFixed(4)),
        unitPrice: Number(item.unitPrice.toFixed(4)),
        lineTotal: Number(item.lineTotal.toFixed(2)),
      }));
  }

  private normalizePurchaseOrderItems(rawItems: any[]): PurchaseOrder['items'] {
    return (Array.isArray(rawItems) ? rawItems : [])
      .map((item) => {
        const quantity = Number(item?.quantity ?? 0);
        const unitCost = Number(item?.unitCost ?? 0);
        const fallbackLineTotal = quantity * unitCost;
        const lineTotal = Number(item?.lineTotal ?? fallbackLineTotal);

        return {
          inventoryItemId: item?.inventoryItemId ? String(item.inventoryItemId) : undefined,
          sku: item?.sku ? String(item.sku) : undefined,
          description: String(item?.description || ''),
          quantity: Number.isFinite(quantity) ? quantity : 0,
          unitCost: Number.isFinite(unitCost) ? unitCost : 0,
          lineTotal: Number.isFinite(lineTotal) ? lineTotal : 0,
        };
      })
      .filter((item) => item.description && item.quantity > 0)
      .map((item) => ({
        ...item,
        quantity: Number(item.quantity.toFixed(4)),
        unitCost: Number(item.unitCost.toFixed(4)),
        lineTotal: Number(item.lineTotal.toFixed(2)),
      }));
  }

  listPayments(invoiceId: string): Payment[] {
    const rows = this.db
      .prepare('SELECT * FROM payments WHERE invoiceId = ? ORDER BY paidAt ASC')
      .all(invoiceId) as any[];
    return rows.map((r) => ({
      ...r,
      paidAt: new Date(r.paidAt),
    }));
  }

  private getInvoicePaidAmount(invoiceId: string): number {
    const row = this.db
      .prepare('SELECT COALESCE(SUM(amount), 0) as amount FROM payments WHERE invoiceId = ?')
      .get(invoiceId) as { amount: number };
    return Number(row.amount || 0);
  }

  createPayment(payment: Omit<Payment, 'id'>) {
    const invoice = this.getInvoiceById(payment.invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found.');
    }
    if (invoice.status === 'Draft') {
      throw new Error('Draft invoices cannot receive payments.');
    }
    const amount = Number(payment.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }
    const outstandingAmount = invoice.outstandingAmount ?? invoice.total;
    if (amount > outstandingAmount + 0.0001) {
      throw new Error(
        `Payment exceeds the outstanding amount (${outstandingAmount.toFixed(2)}).`,
      );
    }
    const newPayment: Payment = {
      ...payment,
      id: uuid(),
      amount: Number(amount.toFixed(2)),
      paidAt: payment.paidAt ? new Date(payment.paidAt) : new Date(),
    };
    this.assertOpenFinancialDate(invoice.companyId, newPayment.paidAt, 'Payment date');
    const trx = this.db.transaction(() => {
      this.db
        .prepare('INSERT INTO payments (id, invoiceId, amount, method, note, paidAt) VALUES (@id, @invoiceId, @amount, @method, @note, @paidAt)')
        .run({
          ...newPayment,
          paidAt: newPayment.paidAt.toISOString(),
        });
      this.postInvoicePaymentJournal(newPayment);
      this.refreshInvoicePaymentStatus(newPayment.invoiceId);
      const refreshedInvoice = this.getInvoiceById(newPayment.invoiceId);
      if (!refreshedInvoice) {
        throw new Error('Invoice not found after recording payment.');
      }
      // Payment-derived commissions and their invoice-level equivalents must
      // update in the same transaction as cash, AR, and invoice status.
      const oppId = this.findOpportunityIdForInvoice(refreshedInvoice);
      if (oppId) this.calculateCommissionsForOpportunity(oppId);
      this.recomputeCommissionsForInvoice(refreshedInvoice.id);
      this.createActivityEvent({
        companyId: refreshedInvoice.companyId,
        entityType: 'invoice',
        entityId: refreshedInvoice.id,
        action: 'payment_recorded',
        summary: `Payment recorded for invoice ${refreshedInvoice.invoiceNumber}.`,
        metadata: {
          amount: newPayment.amount,
          method: newPayment.method,
          paymentId: newPayment.id,
          outstandingAmount: refreshedInvoice.outstandingAmount,
        },
      });
      return newPayment;
    });
    const result = trx();
    // Notify finance roles that cash came in (outside the DB transaction).
    const refreshed = this.getInvoiceById(newPayment.invoiceId);
    this.notify({
      companyId: invoice.companyId,
      userIds: this.listUserIdsByCompanyRoles(invoice.companyId, ['Admin', 'Manager', 'Accountant']),
      type: 'invoice_payment',
      title: `Payment received: ${refreshed?.invoiceNumber ?? ''}`.trim(),
      body: `${newPayment.amount} ${refreshed?.currency ?? ''} via ${newPayment.method}. Outstanding: ${(refreshed?.outstandingAmount ?? 0).toFixed(2)}.`,
      link: '/finance',
      entityType: 'invoice',
      entityId: newPayment.invoiceId,
    });
    return result;
  }

  private refreshInvoicePaymentStatus(invoiceId: string) {
    const invoice = this.getInvoiceById(invoiceId);
    if (!invoice) return;
    const payments = this.listPayments(invoiceId);
    const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);
    let status: InvoiceStatus = invoice.status;
    let paidAt = invoice.paidAt ? invoice.paidAt.toISOString() : null;

    if (paidTotal >= invoice.total - 0.0001) {
      status = 'Paid';
      paidAt = payments[payments.length - 1]?.paidAt.toISOString() ?? new Date().toISOString();
    } else if (paidTotal > 0 || status === 'Paid') {
      status = invoice.dueDate < new Date() ? 'Overdue' : 'Sent';
      paidAt = null;
    }

    this.db
      .prepare('UPDATE invoices SET status = ?, paidAt = ? WHERE id = ?')
      .run(status, paidAt, invoiceId);
  }

  /**
   * Reverses a recorded invoice payment: deletes the payment, removes its
   * cash/AR journal entry, recomputes the invoice status, and re-runs
   * commission calculations. Returns the refreshed invoice.
   */
  reverseInvoicePayment(paymentId: string): Invoice | undefined {
    const row = this.db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as any;
    if (!row) return undefined;
    const invoiceId = row.invoiceId as string;
    const invoiceBeforeReversal = this.getInvoiceById(invoiceId);
    if (!invoiceBeforeReversal) return undefined;
    this.assertOpenFinancialDate(
      invoiceBeforeReversal.companyId,
      new Date(row.paidAt),
      'Payment date',
    );
    const trx = this.db.transaction((): Invoice => {
      this.db.prepare('DELETE FROM payments WHERE id = ?').run(paymentId);
      this.removeJournalEntriesBySource('invoice_payment', paymentId);
      this.refreshInvoicePaymentStatus(invoiceId);
      const invoice = this.getInvoiceById(invoiceId);
      if (!invoice) {
        throw new Error('Invoice not found after reversing payment.');
      }
      const oppId = this.findOpportunityIdForInvoice(invoice);
      this.rollbackPaymentSensitiveCommissions(invoice, oppId);
      if (oppId) this.calculateCommissionsForOpportunity(oppId);
      this.recomputeCommissionsForInvoice(invoice.id);
      this.createActivityEvent({
        companyId: invoice.companyId,
        entityType: 'invoice',
        entityId: invoice.id,
        action: 'payment_reversed',
        summary: `Payment reversed for invoice ${invoice.invoiceNumber}.`,
        metadata: {
          amount: Number(row.amount),
          method: row.method ?? undefined,
          note: row.note ?? undefined,
          paymentId,
          outstandingAmount: invoice.outstandingAmount,
        },
      });
      return invoice;
    });
    return trx();
  }

  listLedgerAccounts(companyId: string): LedgerAccount[] {
    const rows = this.db
      .prepare('SELECT * FROM ledger_accounts WHERE companyId = ? ORDER BY code ASC')
      .all(companyId) as any[];
    return rows.map((row) => ({
      id: row.id,
      companyId: row.companyId,
      code: row.code,
      name: row.name,
      type: row.type as LedgerAccountType,
      detailType: row.detailType ?? undefined,
      description: row.description ?? undefined,
      isActive: row.isActive === null || row.isActive === undefined ? true : Boolean(row.isActive),
      isSystem: Boolean(row.isSystem),
    }));
  }

  getLedgerAccountById(id: string): LedgerAccount | undefined {
    const row = this.db.prepare('SELECT * FROM ledger_accounts WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      companyId: row.companyId,
      code: row.code,
      name: row.name,
      type: row.type as LedgerAccountType,
      detailType: row.detailType ?? undefined,
      description: row.description ?? undefined,
      isActive: row.isActive === null || row.isActive === undefined ? true : Boolean(row.isActive),
      isSystem: Boolean(row.isSystem),
    };
  }

  private nextLedgerAccountCode(companyId: string, type: LedgerAccountType) {
    const base = ledgerAccountCodeBases[type];
    const upperBound = base + 999;
    const rows = this.db
      .prepare(
        'SELECT code FROM ledger_accounts WHERE companyId = ? AND type = ?',
      )
      .all(companyId, type) as Array<{ code: string }>;

    const maxCode = rows.reduce((max, row) => {
      const code = Number(row.code);
      if (!Number.isInteger(code) || code < base || code > upperBound) {
        return max;
      }
      return Math.max(max, code);
    }, base - 10);

    return String(maxCode + 10);
  }

  createLedgerAccount(input: CreateAccountInput): LedgerAccount {
    const newAccount: LedgerAccount = {
      ...input,
      id: uuid(),
      code: this.nextLedgerAccountCode(input.companyId, input.type),
      isSystem: Boolean(input.isSystem),
    };

    this.db
      .prepare(
        'INSERT INTO ledger_accounts (id, companyId, code, name, type, detailType, description, isActive, isSystem) VALUES (@id, @companyId, @code, @name, @type, @detailType, @description, @isActive, @isSystem)',
      )
      .run({
        ...newAccount,
        detailType: newAccount.detailType ?? null,
        description: newAccount.description ?? null,
        isActive: newAccount.isActive === false ? 0 : 1,
        isSystem: newAccount.isSystem ? 1 : 0,
      });

    return newAccount;
  }

  updateLedgerAccount(
    id: string,
    updates: Partial<Omit<LedgerAccount, 'id' | 'companyId' | 'isSystem'>>,
  ): LedgerAccount | undefined {
    const existing = this.getLedgerAccountById(id);
    if (!existing) return undefined;
    if (existing.isSystem) {
      throw new Error('System accounts cannot be edited.');
    }

    const updated: LedgerAccount = {
      ...existing,
      code: existing.code,
      name: updates.name ?? existing.name,
      type: updates.type ?? existing.type,
      detailType: updates.detailType !== undefined ? updates.detailType : existing.detailType,
      description: updates.description !== undefined ? updates.description : existing.description,
      isActive: updates.isActive ?? existing.isActive ?? true,
      isSystem: existing.isSystem,
    };

    this.db
      .prepare(
        'UPDATE ledger_accounts SET code = @code, name = @name, type = @type, detailType = @detailType, description = @description, isActive = @isActive WHERE id = @id',
      )
      .run({
        ...updated,
        detailType: updated.detailType ?? null,
        description: updated.description ?? null,
        isActive: updated.isActive ? 1 : 0,
      });

    return this.getLedgerAccountById(id);
  }

  deleteLedgerAccount(id: string): boolean {
    const existing = this.getLedgerAccountById(id);
    if (!existing) return false;
    if (existing.isSystem) {
      throw new Error('System accounts cannot be deleted.');
    }

    const journalUsage = this.db
      .prepare('SELECT 1 FROM journal_lines WHERE accountId = ? LIMIT 1')
      .get(id);
    if (journalUsage) {
      throw new Error('Account cannot be deleted because it is used in journal entries.');
    }

    const vendorBillUsage = this.db
      .prepare('SELECT 1 FROM vendor_bills WHERE expenseAccountId = ? LIMIT 1')
      .get(id);
    if (vendorBillUsage) {
      throw new Error('Account cannot be deleted because it is linked to vendor invoices.');
    }

    const result = this.db.prepare('DELETE FROM ledger_accounts WHERE id = ?').run(id);
    return result.changes > 0;
  }

  listJournalEntries(companyId: string, limit: number = 100): JournalEntry[] {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const entries = this.db
      .prepare(
        'SELECT * FROM journal_entries WHERE companyId = ? ORDER BY entryDate DESC, createdAt DESC LIMIT ?',
      )
      .all(companyId, safeLimit) as any[];

    const selectLines = this.db.prepare(
      'SELECT * FROM journal_lines WHERE entryId = ? ORDER BY id ASC',
    );

    return entries.map((entry) => {
      const lines = selectLines.all(entry.id) as any[];
      return this.decodeJournalEntry(entry, lines);
    });
  }

  private normalBalanceMovement(type: LedgerAccountType, debit: number, credit: number) {
    return type === 'Asset' || type === 'Expense' ? debit - credit : credit - debit;
  }

  private buildDateRangeWhere(
    alias: string,
    from?: Date,
    to?: Date,
  ): { clause: string; params: string[] } {
    const filters: string[] = [];
    const params: string[] = [];
    if (from) {
      filters.push(`${alias}.entryDate >= ?`);
      params.push(from.toISOString());
    }
    if (to) {
      filters.push(`${alias}.entryDate <= ?`);
      params.push(to.toISOString());
    }
    return {
      clause: filters.length ? ` AND ${filters.join(' AND ')}` : '',
      params,
    };
  }

  getAccountActivity(
    companyId: string,
    accountId: string,
    options?: { from?: Date; to?: Date; limit?: number },
  ): AccountActivityReport {
    const account = this.getLedgerAccountById(accountId);
    if (!account || account.companyId !== companyId) {
      throw new Error('Ledger account not found for this company.');
    }

    const from = options?.from;
    const to = options?.to;
    const limit = Math.min(Math.max(options?.limit ?? 250, 1), 1000);

    const openingRows = from
      ? (this.db
          .prepare(
            `SELECT l.debit, l.credit
             FROM journal_lines l
             JOIN journal_entries e ON e.id = l.entryId
             WHERE e.companyId = ? AND l.accountId = ? AND e.entryDate < ?`,
          )
          .all(companyId, accountId, from.toISOString()) as Array<{ debit: number; credit: number }>)
      : [];
    const openingBalance = Number(
      openingRows
        .reduce(
          (sum, row) =>
            sum + this.normalBalanceMovement(account.type, Number(row.debit) || 0, Number(row.credit) || 0),
          0,
        )
        .toFixed(2),
    );

    const dateWhere = this.buildDateRangeWhere('e', from, to);
    const rows = this.db
      .prepare(
        `SELECT
           e.id as entryId,
           e.entryDate,
           e.sourceType,
           e.sourceId,
           e.memo,
           l.id as lineId,
           l.description,
           l.debit,
           l.credit
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entryId
         WHERE e.companyId = ? AND l.accountId = ?${dateWhere.clause}
         ORDER BY e.entryDate ASC, e.createdAt ASC, l.id ASC
         LIMIT ?`,
      )
      .all(companyId, accountId, ...dateWhere.params, limit) as any[];

    let runningBalance = openingBalance;
    let debitTotal = 0;
    let creditTotal = 0;
    const lines = rows.map((row) => {
      const debit = Number(row.debit) || 0;
      const credit = Number(row.credit) || 0;
      debitTotal += debit;
      creditTotal += credit;
      const movement = this.normalBalanceMovement(account.type, debit, credit);
      runningBalance = Number((runningBalance + movement).toFixed(2));
      return {
        entryId: row.entryId,
        lineId: row.lineId,
        entryDate: new Date(row.entryDate),
        sourceType: row.sourceType,
        sourceId: row.sourceId ?? undefined,
        memo: row.memo ?? undefined,
        description: row.description ?? undefined,
        debit,
        credit,
        movement: Number(movement.toFixed(2)),
        runningBalance,
      };
    });

    return {
      companyId,
      account,
      from,
      to,
      openingBalance,
      closingBalance: runningBalance,
      debitTotal: Number(debitTotal.toFixed(2)),
      creditTotal: Number(creditTotal.toFixed(2)),
      lines,
    };
  }

  getTrialBalance(companyId: string, asOf: Date = new Date()): TrialBalanceReport {
    const accounts = this.listLedgerAccounts(companyId);
    const rows = this.db
      .prepare(
        `SELECT l.accountId, COALESCE(SUM(l.debit), 0) as debitTotal, COALESCE(SUM(l.credit), 0) as creditTotal
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entryId
         WHERE e.companyId = ? AND e.entryDate <= ?
         GROUP BY l.accountId`,
      )
      .all(companyId, asOf.toISOString()) as Array<{
        accountId: string;
        debitTotal: number;
        creditTotal: number;
      }>;
    const totalsByAccount = new Map(rows.map((row) => [row.accountId, row]));

    let totalDebit = 0;
    let totalCredit = 0;
    const lines = accounts.map((account) => {
      const totals = totalsByAccount.get(account.id);
      const debitTotal = Number((totals?.debitTotal || 0).toFixed(2));
      const creditTotal = Number((totals?.creditTotal || 0).toFixed(2));
      const rawBalance = Number((debitTotal - creditTotal).toFixed(2));
      const debitBalance = rawBalance > 0 ? rawBalance : 0;
      const creditBalance = rawBalance < 0 ? Math.abs(rawBalance) : 0;
      totalDebit += debitBalance;
      totalCredit += creditBalance;
      return {
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        debitTotal,
        creditTotal,
        debitBalance: Number(debitBalance.toFixed(2)),
        creditBalance: Number(creditBalance.toFixed(2)),
      };
    });

    totalDebit = Number(totalDebit.toFixed(2));
    totalCredit = Number(totalCredit.toFixed(2));
    return {
      companyId,
      asOf,
      lines,
      totalDebit,
      totalCredit,
      isBalanced: Math.abs(totalDebit - totalCredit) <= 0.005,
    };
  }

  getProfitAndLoss(companyId: string, from?: Date, to: Date = new Date()): ProfitAndLossReport {
    const effectiveFrom = from ?? new Date(to.getFullYear(), to.getMonth(), 1);
    const accounts = this.listLedgerAccounts(companyId).filter(
      (account) => account.type === 'Revenue' || account.type === 'Expense',
    );
    const rows = this.db
      .prepare(
        `SELECT l.accountId, COALESCE(SUM(l.debit), 0) as debitTotal, COALESCE(SUM(l.credit), 0) as creditTotal
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entryId
         WHERE e.companyId = ? AND e.entryDate >= ? AND e.entryDate <= ?
         GROUP BY l.accountId`,
      )
      .all(companyId, effectiveFrom.toISOString(), to.toISOString()) as Array<{
        accountId: string;
        debitTotal: number;
        creditTotal: number;
      }>;
    const totalsByAccount = new Map(rows.map((row) => [row.accountId, row]));

    const revenue = accounts
      .filter((account) => account.type === 'Revenue')
      .map((account) => {
        const totals = totalsByAccount.get(account.id);
        const amount = Number(((totals?.creditTotal || 0) - (totals?.debitTotal || 0)).toFixed(2));
        return { accountId: account.id, code: account.code, name: account.name, amount };
      })
      .filter((line) => line.amount !== 0);
    const expenses = accounts
      .filter((account) => account.type === 'Expense')
      .map((account) => {
        const totals = totalsByAccount.get(account.id);
        const amount = Number(((totals?.debitTotal || 0) - (totals?.creditTotal || 0)).toFixed(2));
        return { accountId: account.id, code: account.code, name: account.name, amount };
      })
      .filter((line) => line.amount !== 0);
    const totalRevenue = Number(revenue.reduce((sum, line) => sum + line.amount, 0).toFixed(2));
    const totalExpenses = Number(expenses.reduce((sum, line) => sum + line.amount, 0).toFixed(2));

    return {
      companyId,
      from: effectiveFrom,
      to,
      revenue,
      expenses,
      totalRevenue,
      totalExpenses,
      netIncome: Number((totalRevenue - totalExpenses).toFixed(2)),
    };
  }

  createJournalEntry(input: CreateJournalInput): JournalEntry {
    const entryDate = new Date(input.entryDate);
    this.assertOpenFinancialDate(input.companyId, entryDate, 'Journal entry date');
    const preparedLines = input.lines
      .map((line) => ({
        accountId: line.accountId,
        description: line.description,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
      }))
      .filter((line) => line.debit > 0 || line.credit > 0);

    if (!preparedLines.length) {
      throw new Error('Journal entry requires at least one non-zero line.');
    }

    const totals = preparedLines.reduce(
      (acc, line) => ({
        debit: acc.debit + line.debit,
        credit: acc.credit + line.credit,
      }),
      { debit: 0, credit: 0 },
    );

    if (Math.abs(totals.debit - totals.credit) > 0.005) {
      throw new Error('Journal entry is unbalanced. Debits must equal credits.');
    }

    const accountIds = Array.from(new Set(preparedLines.map((line) => line.accountId)));
    const rows = this.db
      .prepare(
        `SELECT id FROM ledger_accounts WHERE companyId = ? AND id IN (${accountIds.map(() => '?').join(',')})`,
      )
      .all(input.companyId, ...accountIds) as Array<{ id: string }>;
    if (rows.length !== accountIds.length) {
      throw new Error('One or more journal accounts are invalid for this company.');
    }

    const entryId = uuid();
    const nowIso = new Date().toISOString();
    const entryDateIso = entryDate.toISOString();

    const insertEntry = this.db.prepare(
      'INSERT INTO journal_entries (id, companyId, sourceType, sourceId, memo, entryDate, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const insertLine = this.db.prepare(
      'INSERT INTO journal_lines (id, entryId, accountId, description, debit, credit) VALUES (?, ?, ?, ?, ?, ?)',
    );

    const trx = this.db.transaction(() => {
      insertEntry.run(
        entryId,
        input.companyId,
        input.sourceType,
        input.sourceId ?? null,
        input.memo ?? null,
        entryDateIso,
        nowIso,
      );
      preparedLines.forEach((line) => {
        insertLine.run(
          uuid(),
          entryId,
          line.accountId,
          line.description ?? null,
          line.debit,
          line.credit,
        );
      });
    });

    trx();

    const entryRow = this.db
      .prepare('SELECT * FROM journal_entries WHERE id = ?')
      .get(entryId) as any;
    const lineRows = this.db
      .prepare('SELECT * FROM journal_lines WHERE entryId = ? ORDER BY id ASC')
      .all(entryId) as any[];
    return this.decodeJournalEntry(entryRow, lineRows);
  }

  listVendorBills(companyId: string): VendorBill[] {
    const rows = this.db
      .prepare('SELECT * FROM vendor_bills WHERE companyId = ? ORDER BY dueDate ASC')
      .all(companyId) as any[];
    return rows.map((row) => this.decodeVendorBill(row));
  }

  listPurchaseOrderPayables(companyId: string): PurchaseOrderPayableSummary[] {
    const orders = this.listPurchaseOrders(companyId);
    const bills = this.listVendorBills(companyId);
    return orders.map((order) => this.buildPurchaseOrderPayableSummary(order, bills));
  }

  listSupplierPayables(companyId: string): SupplierPayablesSummary[] {
    const suppliers = this.listSuppliers(companyId);
    const orders = this.listPurchaseOrders(companyId);
    const bills = this.listVendorBills(companyId);

    return suppliers.map((supplier) => {
      const supplierOrders = orders.filter(
        (order) => order.supplierId === supplier.id || order.supplierName === supplier.name,
      );
      const supplierBills = bills.filter(
        (bill) => bill.supplierId === supplier.id || bill.vendorName === supplier.name,
      );
      const payableSummaries = supplierOrders.map((order) =>
        this.buildPurchaseOrderPayableSummary(order, bills),
      );

      return {
        supplierId: supplier.id,
        companyId,
        supplierName: supplier.name,
        purchaseOrderCount: supplierOrders.length,
        vendorBillCount: supplierBills.length,
        totalOrderedAmount: Number(
          supplierOrders.reduce((sum, order) => sum + order.totalAmount, 0).toFixed(2),
        ),
        totalBilledAmount: Number(
          supplierBills.reduce((sum, bill) => sum + bill.amount, 0).toFixed(2),
        ),
        openPayables: Number(
          supplierBills
            .filter((bill) => bill.status !== 'Draft' && (bill.outstandingAmount ?? bill.amount) > 0)
            .reduce((sum, bill) => sum + (bill.outstandingAmount ?? bill.amount), 0)
            .toFixed(2),
        ),
        paidAmount: Number(
          supplierBills.reduce((sum, bill) => sum + (bill.paidAmount ?? 0), 0).toFixed(2),
        ),
        draftBillAmount: Number(
          supplierBills
            .filter((bill) => bill.status === 'Draft')
            .reduce((sum, bill) => sum + bill.amount, 0)
            .toFixed(2),
        ),
        remainingToBill: Number(
          payableSummaries.reduce((sum, summary) => sum + summary.remainingToBill, 0).toFixed(2),
        ),
      };
    });
  }

  getVendorBillById(id: string): VendorBill | undefined {
    const row = this.db.prepare('SELECT * FROM vendor_bills WHERE id = ?').get(id) as any;
    return row ? this.decodeVendorBill(row) : undefined;
  }

  private assertUniqueVendorReference(
    companyId: string,
    supplierId: string | undefined,
    vendorName: string | undefined,
    referenceInvoiceNumber: string | undefined,
    ignoreBillId?: string,
  ) {
    if (!referenceInvoiceNumber) return;
    const row = supplierId
      ? this.db
          .prepare(
            'SELECT id FROM vendor_bills WHERE companyId = ? AND supplierId = ? AND referenceInvoiceNumber = ? AND (? IS NULL OR id != ?) LIMIT 1',
          )
          .get(companyId, supplierId, referenceInvoiceNumber, ignoreBillId ?? null, ignoreBillId ?? null)
      : this.db
          .prepare(
            'SELECT id FROM vendor_bills WHERE companyId = ? AND vendorName = ? AND referenceInvoiceNumber = ? AND (? IS NULL OR id != ?) LIMIT 1',
          )
          .get(companyId, vendorName ?? '', referenceInvoiceNumber, ignoreBillId ?? null, ignoreBillId ?? null);
    if (row) {
      throw new Error(`Supplier invoice reference ${referenceInvoiceNumber} already exists.`);
    }
  }

  listVendorBillPayments(billId: string): VendorBillPayment[] {
    const rows = this.db
      .prepare('SELECT * FROM vendor_bill_payments WHERE billId = ? ORDER BY paidAt ASC')
      .all(billId) as any[];
    return rows.map((row) => this.decodeVendorBillPayment(row));
  }

  createVendorBill(input: CreateVendorBillInput): VendorBill {
    if (input.purchaseOrderId) {
      const purchaseOrder = this.getPurchaseOrderById(input.purchaseOrderId);
      if (!purchaseOrder || purchaseOrder.companyId !== input.companyId) {
        throw new Error('Purchase order does not belong to this company.');
      }
      const billedAmount = this.getLinkedVendorBillAmount(input.purchaseOrderId);
      const remainingToBill = Number((purchaseOrder.totalAmount - billedAmount).toFixed(2));
      if (input.amount > remainingToBill + 0.0001) {
        throw new Error(
          `Vendor bill amount exceeds remaining purchase order amount (${remainingToBill.toFixed(2)}).`,
        );
      }
    }

    const requestedStatus: VendorBillStatus = input.status ?? 'Draft';
    const bill: VendorBill = {
      ...input,
      id: uuid(),
      billNumber: this.nextVendorInvoiceNumber(input.companyId),
      status: requestedStatus === 'Paid' ? 'Approved' : requestedStatus,
      issueDate: new Date(input.issueDate),
      dueDate: new Date(input.dueDate),
      paidAt: undefined,
      paidAmount: 0,
      outstandingAmount: Number(input.amount || 0),
    };
    this.assertOpenFinancialDate(bill.companyId, bill.issueDate, 'Vendor invoice issue date');
    this.assertUniqueVendorReference(
      bill.companyId,
      bill.supplierId,
      bill.vendorName,
      bill.referenceInvoiceNumber,
    );

    this.db
      .prepare(
        'INSERT INTO vendor_bills (id, companyId, vendorName, supplierId, purchaseOrderId, campaignId, billNumber, referenceInvoiceNumber, issueDate, dueDate, amount, status, notes, expenseAccountId, paidAt) VALUES (@id, @companyId, @vendorName, @supplierId, @purchaseOrderId, @campaignId, @billNumber, @referenceInvoiceNumber, @issueDate, @dueDate, @amount, @status, @notes, @expenseAccountId, @paidAt)',
      )
      .run({
        ...bill,
        supplierId: bill.supplierId ?? null,
        purchaseOrderId: bill.purchaseOrderId ?? null,
        campaignId: bill.campaignId ?? null,
        referenceInvoiceNumber: bill.referenceInvoiceNumber ?? null,
        issueDate: bill.issueDate.toISOString(),
        dueDate: bill.dueDate.toISOString(),
        notes: bill.notes ?? null,
        expenseAccountId: bill.expenseAccountId ?? null,
        paidAt: bill.paidAt ? bill.paidAt.toISOString() : null,
      });

    if (bill.status !== 'Draft') {
      try {
        this.postVendorBillJournal(bill);
      } catch (error) {
        console.error('Failed to auto-post vendor bill journal', error);
      }
    }
    if (requestedStatus === 'Paid') {
      return this.createVendorBillPayment({
        billId: bill.id,
        amount: bill.amount,
        method: 'Manual settlement',
        note: 'Created as fully paid',
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
      }).bill;
    }

    const result = this.getVendorBillById(bill.id) ?? bill;
    this.createActivityEvent({
      companyId: result.companyId,
      entityType: 'vendor_bill',
      entityId: result.id,
      action: 'created',
      summary: `Vendor bill ${result.billNumber} created.`,
      metadata: { status: result.status, amount: result.amount, purchaseOrderId: result.purchaseOrderId },
    });
    if (result.status === 'Draft') {
      this.notify({
        companyId: result.companyId,
        userIds: this.listUserIdsByCompanyRoles(result.companyId, ['Admin', 'Manager', 'Accountant']),
        type: 'vendor_bill_approval',
        title: `Bill needs approval: ${result.billNumber}`,
        body: `Amount ${result.amount}. Review and approve in Payables.`,
        link: '/finance',
        entityType: 'vendor_bill',
        entityId: result.id,
      });
    }
    return result;
  }

  updateVendorBillStatus(id: string, status: VendorBillStatus): VendorBill | undefined {
    const existing = this.getVendorBillById(id);
    if (!existing) return undefined;

    if (status === 'Paid') {
      const outstandingAmount = existing.outstandingAmount ?? existing.amount;
      if (outstandingAmount <= 0) {
        this.db
          .prepare('UPDATE vendor_bills SET status = ?, paidAt = ? WHERE id = ?')
          .run('Paid', existing.paidAt ? existing.paidAt.toISOString() : new Date().toISOString(), id);
        return this.getVendorBillById(id);
      }
      return this.createVendorBillPayment({
        billId: existing.id,
        amount: outstandingAmount,
        method: 'Manual settlement',
        note: 'Settled from status update',
        paidAt: new Date(),
      }).bill;
    }

    if (status === 'Draft' && (existing.paidAmount ?? 0) > 0) {
      throw new Error('Bills with recorded payments cannot be moved back to Draft.');
    }

    this.db
      .prepare('UPDATE vendor_bills SET status = ?, paidAt = ? WHERE id = ?')
      .run(status, null, id);

    const updated = this.getVendorBillById(id);
    if (!updated) return undefined;

    if (status !== 'Draft') {
      try {
        this.postVendorBillJournal(updated);
      } catch (error) {
        console.error('Failed to auto-post vendor bill journal update', error);
      }
    }
    this.createActivityEvent({
      companyId: updated.companyId,
      entityType: 'vendor_bill',
      entityId: updated.id,
      action: 'status_changed',
      summary: `Vendor bill ${updated.billNumber} moved to ${updated.status}.`,
      metadata: { status: updated.status, outstandingAmount: updated.outstandingAmount },
    });
    return updated;
  }

  createVendorBillPayment(
    input: CreateVendorBillPaymentInput,
  ): { payment: VendorBillPayment; bill: VendorBill } {
    const bill = this.getVendorBillById(input.billId);
    if (!bill) {
      throw new Error('Vendor bill not found.');
    }
    if (bill.status === 'Draft') {
      throw new Error('Draft vendor bills cannot receive payments.');
    }
    const amount = Number(input.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Vendor bill payment amount must be greater than zero.');
    }
    const outstandingAmount = bill.outstandingAmount ?? bill.amount;
    if (amount > outstandingAmount + 0.0001) {
      throw new Error(
        `Vendor bill payment exceeds the outstanding amount (${outstandingAmount.toFixed(2)}).`,
      );
    }

    const payment: VendorBillPayment = {
      ...input,
      id: uuid(),
      amount: Number(amount.toFixed(2)),
      paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
    };
    this.assertOpenFinancialDate(bill.companyId, payment.paidAt, 'Vendor payment date');

    const trx = this.db.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO vendor_bill_payments (id, billId, amount, method, note, paidAt) VALUES (@id, @billId, @amount, @method, @note, @paidAt)',
        )
        .run({
          ...payment,
          method: payment.method ?? null,
          note: payment.note ?? null,
          paidAt: payment.paidAt.toISOString(),
        });

      const nextPaidAmount = Number(((bill.paidAmount ?? 0) + payment.amount).toFixed(2));
      const nextOutstandingAmount = Number(Math.max(0, bill.amount - nextPaidAmount).toFixed(2));
      const nextStatus =
        nextOutstandingAmount <= 0
          ? 'Paid'
          : bill.status === 'Overdue'
            ? 'Overdue'
            : 'Approved';

      this.db
        .prepare('UPDATE vendor_bills SET status = ?, paidAt = ? WHERE id = ?')
        .run(
          nextStatus,
          nextOutstandingAmount <= 0 ? payment.paidAt.toISOString() : null,
          bill.id,
        );
      this.postVendorBillPaymentJournal(payment);
      const updatedBill = this.getVendorBillById(bill.id);
      if (!updatedBill) {
        throw new Error('Vendor bill not found after payment.');
      }
      this.createActivityEvent({
        companyId: updatedBill.companyId,
        entityType: 'vendor_bill',
        entityId: updatedBill.id,
        action: 'payment_recorded',
        summary: `Payment recorded for vendor bill ${updatedBill.billNumber}.`,
        metadata: {
          amount: payment.amount,
          method: payment.method,
          note: payment.note,
          paymentId: payment.id,
          outstandingAmount: updatedBill.outstandingAmount,
        },
      });
      return { payment, bill: updatedBill };
    });

    return trx();
  }

  /**
   * Reverses a recorded vendor-bill payment: deletes the payment, removes its
   * AP/cash journal entry, and recomputes the bill status from the remaining
   * payments. Returns the refreshed bill.
   */
  reverseVendorBillPayment(paymentId: string): VendorBill | undefined {
    const row = this.db.prepare('SELECT * FROM vendor_bill_payments WHERE id = ?').get(paymentId) as any;
    if (!row) return undefined;
    const billId = row.billId as string;
    const billBeforeReversal = this.getVendorBillById(billId);
    if (!billBeforeReversal) return undefined;
    this.assertOpenFinancialDate(
      billBeforeReversal.companyId,
      new Date(row.paidAt),
      'Vendor payment date',
    );
    const trx = this.db.transaction((): VendorBill => {
      this.db.prepare('DELETE FROM vendor_bill_payments WHERE id = ?').run(paymentId);
      this.removeJournalEntriesBySource('vendor_bill_payment', paymentId);
      const bill = this.getVendorBillById(billId);
      if (!bill) {
        throw new Error('Vendor bill not found after reversing payment.');
      }
      const outstanding = bill.outstandingAmount ?? bill.amount;
      const nextStatus: VendorBillStatus =
        outstanding <= 0 ? 'Paid' : bill.dueDate < new Date() ? 'Overdue' : 'Approved';
      const latestPayment = this.listVendorBillPayments(billId).at(-1);
      this.db
        .prepare('UPDATE vendor_bills SET status = ?, paidAt = ? WHERE id = ?')
        .run(
          nextStatus,
          outstanding <= 0 && latestPayment ? latestPayment.paidAt.toISOString() : null,
          billId,
        );
      const updated = this.getVendorBillById(billId);
      if (!updated) {
        throw new Error('Vendor bill not found after reversing payment.');
      }
      this.createActivityEvent({
        companyId: updated.companyId,
        entityType: 'vendor_bill',
        entityId: updated.id,
        action: 'payment_reversed',
        summary: `Payment reversed for vendor bill ${updated.billNumber}.`,
        metadata: {
          amount: Number(row.amount),
          method: row.method ?? undefined,
          note: row.note ?? undefined,
          paymentId,
          outstandingAmount: updated.outstandingAmount,
        },
      });
      return updated;
    });
    return trx();
  }

  getReceivablesAging(companyId: string, asOf: Date = new Date()): AgingBucket[] {
    return this.calculateAgingBuckets(
      this.listInvoices(companyId)
        .filter((invoice) => (invoice.outstandingAmount ?? invoice.total) > 0)
        .map((invoice) => ({
          dueDate: invoice.dueDate,
          amount: invoice.outstandingAmount ?? invoice.total,
        })),
      asOf,
    );
  }

  getPayablesAging(companyId: string, asOf: Date = new Date()): AgingBucket[] {
    return this.calculateAgingBuckets(
      this.listVendorBills(companyId)
        .filter(
          (bill) =>
            bill.status !== 'Draft' && (bill.outstandingAmount ?? bill.amount) > 0,
        )
        .map((bill) => ({
          dueDate: bill.dueDate,
          amount: bill.outstandingAmount ?? bill.amount,
        })),
      asOf,
    );
  }

  /**
   * Generate (or return the existing) draft invoice for a campaign from its
   * current deliverables, and link it back onto the campaign. A dangling
   * invoiceId (the linked invoice was deleted) is treated as "no invoice" so a
   * fresh one is created. Throws if the campaign has no client contact.
   */
  generateCampaignInvoice(companyId: string, campaignId: string): Invoice {
    const campaign = this.getCrmCampaignById(campaignId);
    if (!campaign || campaign.companyId !== companyId) throw new Error('Campaign not found.');

    if (campaign.invoiceId) {
      const existing = this.getInvoiceById(campaign.invoiceId);
      if (existing) return existing;
    }

    if (!campaign.contactId) {
      throw new Error('Please select a client contact for this campaign before generating an invoice.');
    }
    const contact = this.getContactById(campaign.contactId);
    if (!contact) {
      throw new Error('Please select a client contact for this campaign before generating an invoice.');
    }
    this.addContactRole(contact.id, companyId, 'Client', 'Invoice');

    const deliverables = this.listCampaignDeliverables(campaignId);
    const lineItems = deliverables.map((d) => ({
      itemType: 'Manual' as const,
      description: d.title,
      quantity: 1,
      unitPrice: d.price || 0,
      amount: d.price || 0,
    }));
    const now = new Date();
    const invoice = this.createInvoice({
      companyId,
      clientId: contact.id,
      contactId: campaign.contactId ?? undefined,
      campaignId,
      issueDate: now,
      dueDate: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30),
      lineItems: lineItems.length > 0
        ? lineItems
        : [{ itemType: 'Manual' as const, description: `Campaign: ${campaign.name}`, quantity: 1, unitPrice: 0, amount: 0 }],
      total: 0,
      status: 'Draft',
      notes: `Generated from campaign: ${campaign.name}`,
      currency: undefined,
      taxRate: undefined,
    });
    this.updateCrmCampaign(campaignId, { invoiceId: invoice.id });
    return invoice;
  }

  /**
   * Re-reconcile a campaign's generated invoice with the campaign's current
   * deliverables.
   *  - If the linked invoice is still Draft (a working document, not yet on the
   *    ledger) it is rewritten in place to mirror the deliverables.
   *  - If it has been issued (Sent/Paid/Overdue) the invoice is immutable, so the
   *    net difference becomes a delta: a supplementary invoice (more scope) or a
   *    credit note (less scope). Those require explicit confirmation (`confirm`).
   */
  syncCampaignInvoice(
    companyId: string,
    campaignId: string,
    confirm = false,
  ): {
    status: 'resynced' | 'up_to_date' | 'needs_confirmation' | 'supplemented' | 'credited';
    delta?: number;
    kind?: 'supplementary' | 'credit';
    invoice?: Invoice;
    creditNote?: CreditNote;
    message?: string;
  } {
    const campaign = this.getCrmCampaignById(campaignId);
    if (!campaign || campaign.companyId !== companyId) throw new Error('Campaign not found.');

    const primary = campaign.invoiceId ? this.getInvoiceById(campaign.invoiceId) : undefined;
    if (!primary) {
      // The campaign has no live invoice (never generated, or the linked one was
      // deleted). Self-heal: adopt the most recent surviving campaign invoice as
      // the primary, or regenerate a fresh draft from the current deliverables.
      const survivors = this.listInvoices(companyId)
        .filter((i) => i.campaignId === campaignId)
        .sort((a, b) => +new Date(b.issueDate) - +new Date(a.issueDate));
      if (survivors.length > 0) {
        this.updateCrmCampaign(campaignId, { invoiceId: survivors[0].id });
        return this.syncCampaignInvoice(companyId, campaignId, confirm);
      }
      const invoice = this.generateCampaignInvoice(companyId, campaignId);
      return { status: 'resynced', invoice };
    }

    const deliverables = this.listCampaignDeliverables(campaignId);
    const desiredLines = deliverables.map((d) => ({
      itemType: 'Manual' as const,
      description: d.title,
      quantity: 1,
      unitPrice: d.price || 0,
      amount: d.price || 0,
    }));
    const desiredTotal = Number(desiredLines.reduce((sum, l) => sum + l.amount, 0).toFixed(2));

    // Draft → safe to rewrite in place (nothing recognised on the ledger yet).
    if (primary.status === 'Draft') {
      const lines =
        desiredLines.length > 0
          ? desiredLines
          : [{ itemType: 'Manual' as const, description: `Campaign: ${campaign.name}`, quantity: 1, unitPrice: 0, amount: 0 }];
      const invoice = this.updateInvoice(primary.id, { lineItems: lines });
      return { status: 'resynced', invoice };
    }

    // Issued → compare the campaign's net billed amount with the desired total.
    const campaignInvoices = this.listInvoices(companyId).filter((i) => i.campaignId === campaignId);
    const grossBilled = campaignInvoices.reduce((sum, i) => sum + i.total, 0);
    const credited = campaignInvoices.reduce((sum, i) => sum + this.getInvoiceCreditedAmount(i.id), 0);
    const billedNet = Number((grossBilled - credited).toFixed(2));
    const delta = Number((desiredTotal - billedNet).toFixed(2));

    if (Math.abs(delta) < 0.005) return { status: 'up_to_date' };

    const kind: 'supplementary' | 'credit' = delta > 0 ? 'supplementary' : 'credit';
    if (!confirm) {
      return {
        status: 'needs_confirmation',
        delta,
        kind,
        message:
          delta > 0
            ? `This campaign's invoice is already issued. Create a supplementary invoice for ${delta.toFixed(2)} to cover the added scope?`
            : `This campaign's invoice is already issued. Issue a credit note for ${Math.abs(delta).toFixed(2)} for the reduced scope?`,
      };
    }

    if (delta > 0) {
      const now = new Date();
      const invoice = this.createInvoice({
        companyId,
        clientId: primary.clientId,
        contactId: campaign.contactId ?? undefined,
        campaignId,
        issueDate: now,
        dueDate: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30),
        lineItems: [
          {
            itemType: 'Manual',
            description: `Campaign ${campaign.name} — additional scope`,
            quantity: 1,
            unitPrice: delta,
            amount: delta,
          },
        ],
        total: delta,
        status: 'Draft',
        notes: `Supplementary invoice for campaign: ${campaign.name}`,
        currency: primary.currency,
        taxRate: primary.taxRate,
      });
      return { status: 'supplemented', delta, kind, invoice };
    }

    const creditNote = this.createCreditNote({
      companyId,
      invoiceId: primary.id,
      clientId: primary.clientId,
      lineItems: [{ description: `Campaign ${campaign.name} — scope reduction`, amount: Math.abs(delta) }],
      reason: `Campaign scope reduced after invoicing`,
    });
    return { status: 'credited', delta, kind, creditNote };
  }

  getFinanceOverview(companyId: string): FinanceOverview {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    const openReceivablesAmount = this.listInvoices(companyId)
      .filter((invoice) => (invoice.outstandingAmount ?? invoice.total) > 0)
      .reduce((sum, invoice) => sum + (invoice.outstandingAmount ?? invoice.total), 0);
    const openPayablesAmount = this.listVendorBills(companyId)
      .filter(
        (bill) =>
          bill.status !== 'Draft' && (bill.outstandingAmount ?? bill.amount) > 0,
      )
      .reduce((sum, bill) => sum + (bill.outstandingAmount ?? bill.amount), 0);
    const paidThisMonthRow = this.db
      .prepare(
        `SELECT COALESCE(SUM(p.amount), 0) as amount
         FROM payments p
         JOIN invoices i ON i.id = p.invoiceId
         WHERE i.companyId = ? AND p.paidAt >= ? AND p.paidAt < ?`,
      )
      .get(companyId, monthStart, nextMonth) as { amount: number };
    const paidPayablesThisMonthRow = this.db
      .prepare(
        `SELECT COALESCE(SUM(p.amount), 0) as amount
         FROM vendor_bill_payments p
         JOIN vendor_bills b ON b.id = p.billId
         WHERE b.companyId = ? AND p.paidAt >= ? AND p.paidAt < ?`,
      )
      .get(companyId, monthStart, nextMonth) as { amount: number };
    const billedThisMonthRow = this.db
      .prepare(
        'SELECT COALESCE(SUM(total), 0) as amount FROM invoices WHERE companyId = ? AND issueDate >= ? AND issueDate < ?',
      )
      .get(companyId, monthStart, nextMonth) as { amount: number };
    const expensesRow = this.db
      .prepare(
        'SELECT COALESCE(SUM(invoiceAmount), 0) as amount FROM tasks WHERE companyId = ? AND invoiceDate >= ? AND invoiceDate < ?',
      )
      .get(companyId, monthStart, nextMonth) as { amount: number };
    // Standalone expenses recorded this month add to the cash-out figure.
    const standaloneExpensesThisMonth = this.sumExpensesBetween(companyId, monthStart, nextMonth);

    // Month-to-date accrual P&L (journal-based) — the proper revenue/profit.
    const pnl = this.getProfitAndLoss(
      companyId,
      new Date(now.getFullYear(), now.getMonth(), 1),
      now,
    );

    return {
      openReceivables: Number(openReceivablesAmount.toFixed(2)),
      openPayables: Number(openPayablesAmount.toFixed(2)),
      paidThisMonth: Number(paidThisMonthRow.amount || 0),
      paidPayablesThisMonth: Number(paidPayablesThisMonthRow.amount || 0),
      billedThisMonth: Number(billedThisMonthRow.amount || 0),
      expenseReceiptsThisMonth: Number(
        ((Number(expensesRow.amount) || 0) + standaloneExpensesThisMonth).toFixed(2),
      ),
      revenueThisMonth: pnl.totalRevenue,
      expensesThisMonth: pnl.totalExpenses,
      netProfitThisMonth: pnl.netIncome,
    };
  }

  getManagementReportSummary(companyId: string): ManagementReportSummary {
    const finance = this.getFinanceOverview(companyId);
    const inventoryItems = this.listInventoryItems(companyId);
    const purchaseOrders = this.listPurchaseOrders(companyId);
    const purchasePayables = this.listPurchaseOrderPayables(companyId);
    const clients = this.listClients(companyId);
    const invoices = this.listInvoices(companyId);
    const supplierPayables = this.listSupplierPayables(companyId);

    const inventory: InventoryReportSummary = {
      totalItems: inventoryItems.length,
      stockValue: Number(
        inventoryItems.reduce((sum, item) => sum + item.onHand * item.unitCost, 0).toFixed(2),
      ),
      lowStockCount: inventoryItems.filter(
        (item) => item.onHand > 0 && item.onHand <= item.reorderPoint,
      ).length,
      outOfStockCount: inventoryItems.filter((item) => item.onHand <= 0).length,
    };

    const receiptProgress = new Map<string, number>();
    this.listPurchaseReceipts(companyId).forEach((receipt) => {
      const current = receiptProgress.get(receipt.purchaseOrderId) || 0;
      const receiptUnits = receipt.items.reduce((sum, item) => sum + item.quantity, 0);
      receiptProgress.set(
        receipt.purchaseOrderId,
        Number((current + receiptUnits).toFixed(4)),
      );
    });

    const purchases: PurchaseReportSummary = {
      openOrders: purchaseOrders.filter(
        (order) =>
          order.status === 'Draft'
          || order.status === 'Ordered'
          || order.status === 'Partially Received',
      ).length,
      orderedSpend: Number(
        purchaseOrders
          .filter(
            (order) =>
              order.status === 'Draft'
              || order.status === 'Ordered'
              || order.status === 'Partially Received',
          )
          .reduce((sum, order) => sum + order.totalAmount, 0)
          .toFixed(2),
      ),
      awaitingReceiptUnits: Number(
        purchaseOrders
          .reduce((sum, order) => {
            if (order.status === 'Received' || order.status === 'Cancelled') return sum;
            const totalUnits = order.items.reduce((itemSum, item) => itemSum + item.quantity, 0);
            const receivedUnits = receiptProgress.get(order.id) || 0;
            return sum + Math.max(0, totalUnits - receivedUnits);
          }, 0)
          .toFixed(4),
      ),
      unbilledValue: Number(
        purchasePayables.reduce((sum, summary) => sum + summary.remainingToBill, 0).toFixed(2),
      ),
    };

    const clientLookup = new Map(clients.map((client) => [client.id, client.name]));
    const topClients: ClientRevenueSummary[] = clients
      .map((client) => {
        const clientInvoices = invoices.filter((invoice) => invoice.clientId === client.id);
        return {
          clientId: client.id,
          clientName: client.name,
          invoiceCount: clientInvoices.length,
          totalBilled: Number(
            clientInvoices.reduce((sum, invoice) => sum + invoice.total, 0).toFixed(2),
          ),
          paidAmount: Number(
            clientInvoices.reduce((sum, invoice) => sum + (invoice.paidAmount ?? 0), 0).toFixed(2),
          ),
          outstandingAmount: Number(
            clientInvoices.reduce(
              (sum, invoice) => sum + (invoice.outstandingAmount ?? 0),
              0,
            ).toFixed(2),
          ),
        };
      })
      .sort((left, right) => right.totalBilled - left.totalBilled)
      .slice(0, 8);

    const topSuppliers: SupplierSpendSummary[] = supplierPayables
      .sort((left, right) => right.totalOrderedAmount - left.totalOrderedAmount)
      .slice(0, 8);

    const lowStockItems = inventoryItems
      .filter((item) => item.onHand <= item.reorderPoint)
      .sort((left, right) => left.onHand - right.onHand || left.name.localeCompare(right.name))
      .slice(0, 12);

    const recentActivity = this.listActivityEvents(companyId, { limit: 12 }).map((event) => ({
      ...event,
      summary:
        event.entityType === 'client' && !event.summary.includes(clientLookup.get(event.entityId) || '')
          ? event.summary
          : event.summary,
    }));

    return {
      finance,
      inventory,
      purchases,
      topClients,
      topSuppliers,
      lowStockItems,
      recentActivity,
    };
  }

  private buildTaskLoadChart(
    tasks: Task[],
    title: string,
    description: string,
  ): DashboardChart {
    const data = buildMonthWindows().map((window) => ({
      label: window.label,
      values: {
        created: tasks.filter((task) => isBetween(task.createdAt, window.start, window.end)).length,
        due: tasks.filter(
          (task) => task.dueDate && isBetween(task.dueDate, window.start, window.end),
        ).length,
      },
    }));

    return makeLineChart(
      'task-load',
      title,
      description,
      [
        { key: 'created', label: 'Created', color: dashboardPalette.blue },
        { key: 'due', label: 'Due Load', color: dashboardPalette.amber },
      ],
      data,
    );
  }

  private buildFinanceTrendChart(
    invoices: Invoice[],
    title: string,
    description: string,
  ): DashboardChart {
    const payments = invoices.flatMap((invoice) => this.listPayments(invoice.id));
    const data = buildMonthWindows().map((window) => ({
      label: window.label,
      values: {
        invoiced: Number(
          invoices
            .filter((invoice) => isBetween(invoice.issueDate, window.start, window.end))
            .reduce((sum, invoice) => sum + invoice.total, 0)
            .toFixed(2),
        ),
        collected: Number(
          payments
            .filter((payment) => isBetween(payment.paidAt, window.start, window.end))
            .reduce((sum, payment) => sum + payment.amount, 0)
            .toFixed(2),
        ),
      },
    }));

    return makeLineChart(
      'cashflow-trend',
      title,
      description,
      [
        { key: 'invoiced', label: 'Invoiced', color: dashboardPalette.green },
        { key: 'collected', label: 'Collected', color: dashboardPalette.amber },
      ],
      data,
    );
  }

  private buildAgingChart(companyId: string): DashboardChart {
    const receivables = this.getReceivablesAging(companyId);
    const payables = this.getPayablesAging(companyId);
    const labelByBucket: Record<AgingBucket['bucket'], string> = {
      current: 'Current',
      '1_30': '1-30',
      '31_60': '31-60',
      '61_90': '61-90',
      over_90: '90+',
    };

    const data = receivables.map((bucket) => ({
      label: labelByBucket[bucket.bucket],
      values: {
        receivables: Number(bucket.amount.toFixed(2)),
        payables: Number(
          (payables.find((entry) => entry.bucket === bucket.bucket)?.amount || 0).toFixed(2),
        ),
      },
    }));

    return makeStackedBarChart(
      'aging',
      'Aging Overview',
      'Receivable and payable balances by aging bucket.',
      [
        { key: 'receivables', label: 'Receivables', color: dashboardPalette.blue },
        { key: 'payables', label: 'Payables', color: dashboardPalette.orange },
      ],
      data,
    );
  }

  private mapActivityItems(events: ActivityEvent[]): DashboardActivityItem[] {
    return events.slice(0, 8).map((event) => ({
      id: event.id,
      title: event.summary,
      detail: event.actorName || event.entityType,
      createdAt: event.createdAt,
      actorName: event.actorName,
      entityType: event.entityType,
      entityId: event.entityId,
    }));
  }

  getDashboardPayload(
    companyId: string,
    viewer: { userId: string; role: UserRole },
  ): DashboardPayload {
    const now = new Date();
    const tasks = this.listTasks().filter((task) => task.companyId === companyId);
    const projects = this.listProjects().filter((project) => project.companyId === companyId);
    const invoices = this.listInvoices(companyId);
    const vendorBills = this.listVendorBills(companyId);
    const purchaseOrders = this.listPurchaseOrders(companyId);
    const inventoryItems = this.listInventoryItems(companyId);
    const companyActivity = this.listActivityEvents(companyId, { limit: 40 });
    const summary = this.getManagementReportSummary(companyId);

    if (viewer.role === 'Employee') {
      const assignedTasks = tasks.filter((task) => task.assignedUserIds?.includes(viewer.userId));
      const openTasks = assignedTasks.filter((task) => task.status !== 'Done');
      const overdueTasks = openTasks.filter((task) => task.dueDate && task.dueDate < now);
      const dueSoonTasks = openTasks.filter(
        (task) => task.dueDate && task.dueDate >= now && task.dueDate.getTime() - now.getTime() <= 7 * 24 * 60 * 60 * 1000,
      );
      const completedTasks = assignedTasks.filter((task) => task.status === 'Done');
      const completionRate = assignedTasks.length
        ? Math.round((completedTasks.length / assignedTasks.length) * 100)
        : 0;
      const assignedTaskIds = new Set(assignedTasks.map((task) => task.id));

      const metrics: DashboardMetric[] = [
        {
          id: 'open-tasks',
          label: 'Open Tasks',
          value: openTasks.length,
          format: 'number',
          tone: 'info',
          detail: 'Assigned work not yet completed.',
        },
        {
          id: 'overdue-tasks',
          label: 'Overdue',
          value: overdueTasks.length,
          format: 'number',
          tone: overdueTasks.length > 0 ? 'danger' : 'success',
          detail: 'Assigned tasks past due date.',
        },
        {
          id: 'due-soon',
          label: 'Due This Week',
          value: dueSoonTasks.length,
          format: 'number',
          tone: 'warning',
          detail: 'Assigned tasks due in the next 7 days.',
        },
        {
          id: 'completion-rate',
          label: 'Completion Rate',
          value: completionRate,
          format: 'percent',
          tone: 'success',
          detail: 'Completed versus tracked assigned tasks.',
        },
      ];

      const charts: DashboardChart[] = [
        makeDonutChart(
          'task-status',
          'Task Status',
          'Current status split for assigned work.',
          [
            {
              key: 'todo',
              label: 'To Do',
              color: dashboardPalette.slate,
              value: assignedTasks.filter((task) => task.status === 'To Do').length,
            },
            {
              key: 'inProgress',
              label: 'In Progress',
              color: dashboardPalette.blue,
              value: assignedTasks.filter((task) => task.status === 'In Progress').length,
            },
            {
              key: 'done',
              label: 'Done',
              color: dashboardPalette.green,
              value: assignedTasks.filter((task) => task.status === 'Done').length,
            },
          ],
        ),
        makeDonutChart(
          'priority-mix',
          'Priority Mix',
          'Open assigned work by urgency.',
          [
            {
              key: 'high',
              label: 'High',
              color: dashboardPalette.red,
              value: openTasks.filter((task) => task.priority === 'High').length,
            },
            {
              key: 'medium',
              label: 'Medium',
              color: dashboardPalette.amber,
              value: openTasks.filter((task) => task.priority === 'Medium').length,
            },
            {
              key: 'low',
              label: 'Low',
              color: dashboardPalette.blue,
              value: openTasks.filter((task) => task.priority === 'Low').length,
            },
          ],
        ),
        makeDonutChart(
          'deadline-pressure',
          'Deadline Pressure',
          'Where open assigned tasks sit across due-date buckets.',
          [
            {
              key: 'overdue',
              label: 'Overdue',
              color: dashboardPalette.red,
              value: overdueTasks.length,
            },
            {
              key: 'dueSoon',
              label: 'Due Soon',
              color: dashboardPalette.amber,
              value: dueSoonTasks.length,
            },
            {
              key: 'planned',
              label: 'Planned',
              color: dashboardPalette.cyan,
              value: openTasks.filter(
                (task) =>
                  task.dueDate &&
                  task.dueDate.getTime() - now.getTime() > 7 * 24 * 60 * 60 * 1000,
              ).length,
            },
            {
              key: 'noDate',
              label: 'No Date',
              color: dashboardPalette.slate,
              value: openTasks.filter((task) => !task.dueDate).length,
            },
          ],
        ),
        this.buildTaskLoadChart(
          assignedTasks,
          'Task Load',
          'Assigned work created versus scheduled due load over the last 6 months.',
        ),
      ];

      const alerts: DashboardAlert[] = [
        ...overdueTasks.slice(0, 4).map((task) => ({
          id: `task-overdue-${task.id}`,
          title: task.title,
          detail: `Overdue task in ${task.status}.`,
          severity: 'critical' as const,
          entityType: 'task' as const,
          entityId: task.id,
          route: '/projects',
        })),
        ...dueSoonTasks
          .filter((task) => task.priority === 'High')
          .slice(0, 2)
          .map((task) => ({
            id: `task-due-soon-${task.id}`,
            title: task.title,
            detail: 'High-priority task due within 7 days.',
            severity: 'warning' as const,
            entityType: 'task' as const,
            entityId: task.id,
            route: '/projects',
          })),
      ];

      const activity = this.mapActivityItems(
        companyActivity.filter(
          (event) => event.entityType === 'task' && assignedTaskIds.has(event.entityId),
        ),
      );

      const quickActions: DashboardQuickAction[] = [
        { id: 'open-projects', label: 'Open Projects', route: '/projects' },
        { id: 'open-diagram', label: 'Open Diagram', route: '/diagram' },
      ];

      return {
        companyId,
        role: viewer.role,
        scope: 'personal',
        metrics,
        charts,
        alerts,
        activity,
        quickActions,
      };
    }

    if (viewer.role === 'Manager') {
      const openTasks = tasks.filter((task) => task.status !== 'Done');
      const overdueTasks = openTasks.filter((task) => task.dueDate && task.dueDate < now);
      const metrics: DashboardMetric[] = [
        {
          id: 'active-projects',
          label: 'Active Projects',
          value: new Set(openTasks.map((task) => task.projectId)).size,
          format: 'number',
          tone: 'info',
          detail: 'Projects with unfinished work.',
        },
        {
          id: 'open-tasks',
          label: 'Open Tasks',
          value: openTasks.length,
          format: 'number',
          tone: 'info',
          detail: 'Company tasks not yet completed.',
        },
        {
          id: 'overdue-tasks',
          label: 'Overdue Tasks',
          value: overdueTasks.length,
          format: 'number',
          tone: overdueTasks.length > 0 ? 'danger' : 'success',
          detail: 'Open tasks that have passed their due date.',
        },
        {
          id: 'low-stock-items',
          label: 'Low Stock Items',
          value: summary.inventory.lowStockCount,
          format: 'number',
          tone: summary.inventory.lowStockCount > 0 ? 'warning' : 'success',
          detail: 'Items at or below their reorder point.',
        },
      ];

      const charts: DashboardChart[] = [
        makeDonutChart(
          'task-status',
          'Task Status',
          'Company task distribution by status.',
          [
            { key: 'todo', label: 'To Do', color: dashboardPalette.slate, value: tasks.filter((task) => task.status === 'To Do').length },
            { key: 'inProgress', label: 'In Progress', color: dashboardPalette.blue, value: tasks.filter((task) => task.status === 'In Progress').length },
            { key: 'done', label: 'Done', color: dashboardPalette.green, value: tasks.filter((task) => task.status === 'Done').length },
          ],
        ),
        this.buildTaskLoadChart(
          tasks,
          'Task Load',
          'Created work versus scheduled due load over the last 6 months.',
        ),
        makeDonutChart(
          'purchase-lifecycle',
          'Purchase Lifecycle',
          'Open purchasing distributed by order status.',
          [
            { key: 'draft', label: 'Draft', color: dashboardPalette.slate, value: purchaseOrders.filter((order) => order.status === 'Draft').length },
            { key: 'ordered', label: 'Ordered', color: dashboardPalette.blue, value: purchaseOrders.filter((order) => order.status === 'Ordered').length },
            { key: 'partial', label: 'Partially Received', color: dashboardPalette.amber, value: purchaseOrders.filter((order) => order.status === 'Partially Received').length },
            { key: 'received', label: 'Received', color: dashboardPalette.green, value: purchaseOrders.filter((order) => order.status === 'Received').length },
          ],
        ),
        makeDonutChart(
          'inventory-health',
          'Inventory Health',
          'Healthy, low-stock, and out-of-stock item split.',
          [
            {
              key: 'healthy',
              label: 'Healthy',
              color: dashboardPalette.green,
              value: inventoryItems.filter((item) => item.onHand > item.reorderPoint).length,
            },
            {
              key: 'low',
              label: 'Low Stock',
              color: dashboardPalette.amber,
              value: inventoryItems.filter((item) => item.onHand > 0 && item.onHand <= item.reorderPoint).length,
            },
            {
              key: 'out',
              label: 'Out of Stock',
              color: dashboardPalette.red,
              value: inventoryItems.filter((item) => item.onHand <= 0).length,
            },
          ],
        ),
      ];

      const alerts: DashboardAlert[] = [
        ...(overdueTasks.length
          ? [
              {
                id: 'manager-overdue-tasks',
                title: `${overdueTasks.length} overdue tasks`,
                detail: 'Delivery recovery is needed across active projects.',
                severity: 'critical' as const,
                route: '/projects',
              },
            ]
          : []),
        ...summary.lowStockItems.slice(0, 3).map((item) => ({
          id: `low-stock-${item.id}`,
          title: item.name,
          detail: `${item.onHand} on hand against reorder point ${item.reorderPoint}.`,
          severity: item.onHand <= 0 ? ('critical' as const) : ('warning' as const),
          entityType: 'inventory_item' as const,
          entityId: item.id,
          route: '/inventory',
        })),
        ...(summary.purchases.awaitingReceiptUnits > 0
          ? [
              {
                id: 'awaiting-receipt',
                title: 'Inbound stock still pending',
                detail: `${summary.purchases.awaitingReceiptUnits} units are awaiting receipt.`,
                severity: 'warning' as const,
                route: '/purchases',
              },
            ]
          : []),
      ];

      const quickActions: DashboardQuickAction[] = [
        { id: 'open-projects', label: 'Projects', route: '/projects' },
        { id: 'open-inventory', label: 'Inventory', route: '/inventory' },
        { id: 'open-purchases', label: 'Purchases', route: '/purchases' },
        { id: 'open-clients', label: 'Clients', route: '/clients' },
      ];

      return {
        companyId,
        role: viewer.role,
        scope: 'company',
        metrics,
        charts,
        alerts,
        activity: this.mapActivityItems(summary.recentActivity),
        quickActions,
      };
    }

    if (viewer.role === 'Accountant') {
      const overdueInvoices = invoices
        .filter(
          (invoice) =>
            invoice.status !== 'Paid' &&
            (invoice.outstandingAmount ?? invoice.total) > 0 &&
            invoice.dueDate < now,
        )
        .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime());
      const overdueBills = vendorBills
        .filter(
          (bill) =>
            bill.status !== 'Paid' &&
            bill.status !== 'Draft' &&
            (bill.outstandingAmount ?? bill.amount) > 0 &&
            bill.dueDate < now,
        )
        .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime());

      const metrics: DashboardMetric[] = [
        {
          id: 'open-receivables',
          label: 'Open Receivables',
          value: summary.finance.openReceivables,
          format: 'currency',
          tone: 'info',
          detail: 'Outstanding client balances.',
        },
        {
          id: 'open-payables',
          label: 'Open Payables',
          value: summary.finance.openPayables,
          format: 'currency',
          tone: 'warning',
          detail: 'Outstanding vendor liabilities.',
        },
        {
          id: 'billed-this-month',
          label: 'Billed This Month',
          value: summary.finance.billedThisMonth,
          format: 'currency',
          tone: 'success',
          detail: 'Invoices issued during the current month.',
        },
        {
          id: 'paid-this-month',
          label: 'Collected This Month',
          value: summary.finance.paidThisMonth,
          format: 'currency',
          tone: 'success',
          detail: 'Payments received during the current month.',
        },
      ];

      const charts: DashboardChart[] = [
        makeDonutChart(
          'finance-exposure',
          'Finance Exposure',
          'Receivables, payables, stock value, and unbilled purchasing.',
          [
            { key: 'receivables', label: 'Receivables', color: dashboardPalette.blue, value: summary.finance.openReceivables },
            { key: 'payables', label: 'Payables', color: dashboardPalette.orange, value: summary.finance.openPayables },
            { key: 'stock', label: 'Stock Value', color: dashboardPalette.green, value: summary.inventory.stockValue },
            { key: 'unbilled', label: 'Unbilled POs', color: dashboardPalette.amber, value: summary.purchases.unbilledValue },
          ],
        ),
        this.buildFinanceTrendChart(
          invoices,
          'Revenue vs Collections',
          'Invoices issued versus cash collected over the last 6 months.',
        ),
        this.buildAgingChart(companyId),
      ];

      const alerts: DashboardAlert[] = [
        ...overdueInvoices.slice(0, 3).map((invoice) => ({
          id: `overdue-invoice-${invoice.id}`,
          title: invoice.invoiceNumber,
          detail: `${(invoice.outstandingAmount ?? invoice.total).toFixed(2)} overdue from client ${invoice.clientId}.`,
          severity: 'critical' as const,
          entityType: 'invoice' as const,
          entityId: invoice.id,
          route: '/finance',
        })),
        ...overdueBills.slice(0, 3).map((bill) => ({
          id: `overdue-bill-${bill.id}`,
          title: bill.billNumber,
          detail: `${(bill.outstandingAmount ?? bill.amount).toFixed(2)} overdue for ${bill.vendorName}.`,
          severity: 'warning' as const,
          entityType: 'vendor_bill' as const,
          entityId: bill.id,
          route: '/finance',
        })),
      ];

      const quickActions: DashboardQuickAction[] = [
        { id: 'open-finance', label: 'Finance', route: '/finance' },
        { id: 'open-clients', label: 'Clients', route: '/clients' },
        { id: 'open-purchases', label: 'Purchases', route: '/purchases' },
      ];

      return {
        companyId,
        role: viewer.role,
        scope: 'company',
        metrics,
        charts,
        alerts,
        activity: this.mapActivityItems(
          companyActivity.filter((event) =>
            ['invoice', 'vendor_bill', 'client'].includes(event.entityType),
          ),
        ),
        quickActions,
      };
    }

    const openTasks = tasks.filter((task) => task.status !== 'Done');
    const overdueTasks = openTasks.filter((task) => task.dueDate && task.dueDate < now);
    const overdueInvoices = invoices.filter(
      (invoice) =>
        invoice.status !== 'Paid' &&
        (invoice.outstandingAmount ?? invoice.total) > 0 &&
        invoice.dueDate < now,
    );
    const overdueBills = vendorBills.filter(
      (bill) =>
        bill.status !== 'Paid' &&
        bill.status !== 'Draft' &&
        (bill.outstandingAmount ?? bill.amount) > 0 &&
        bill.dueDate < now,
    );

    const metrics: DashboardMetric[] = [
      {
        id: 'open-tasks',
        label: 'Open Tasks',
        value: openTasks.length,
        format: 'number',
        tone: 'info',
        detail: 'Company tasks still in flight.',
      },
      {
        id: 'open-receivables',
        label: 'Open Receivables',
        value: summary.finance.openReceivables,
        format: 'currency',
        tone: 'info',
        detail: 'Outstanding client balances.',
      },
      {
        id: 'open-payables',
        label: 'Open Payables',
        value: summary.finance.openPayables,
        format: 'currency',
        tone: 'warning',
        detail: 'Outstanding vendor liabilities.',
      },
      {
        id: 'low-stock-items',
        label: 'Low Stock Items',
        value: summary.inventory.lowStockCount,
        format: 'number',
        tone: summary.inventory.lowStockCount > 0 ? 'warning' : 'success',
        detail: 'Items at or below reorder point.',
      },
    ];

    const charts: DashboardChart[] = [
      this.buildTaskLoadChart(
        tasks,
        'Task Load',
        'Created work versus scheduled due load over the last 6 months.',
      ),
      this.buildFinanceTrendChart(
        invoices,
        'Revenue vs Collections',
        'Invoices issued versus cash collected over the last 6 months.',
      ),
      makeDonutChart(
        'finance-exposure',
        'Finance Exposure',
        'Receivables, payables, stock value, and unbilled purchasing.',
        [
          { key: 'receivables', label: 'Receivables', color: dashboardPalette.blue, value: summary.finance.openReceivables },
          { key: 'payables', label: 'Payables', color: dashboardPalette.orange, value: summary.finance.openPayables },
          { key: 'stock', label: 'Stock Value', color: dashboardPalette.green, value: summary.inventory.stockValue },
          { key: 'unbilled', label: 'Unbilled POs', color: dashboardPalette.amber, value: summary.purchases.unbilledValue },
        ],
      ),
      makeDonutChart(
        'task-status',
        'Task Status',
        'Company task distribution by status.',
        [
          { key: 'todo', label: 'To Do', color: dashboardPalette.slate, value: tasks.filter((task) => task.status === 'To Do').length },
          { key: 'inProgress', label: 'In Progress', color: dashboardPalette.blue, value: tasks.filter((task) => task.status === 'In Progress').length },
          { key: 'done', label: 'Done', color: dashboardPalette.green, value: tasks.filter((task) => task.status === 'Done').length },
        ],
      ),
    ];

    const alerts: DashboardAlert[] = [
      ...(overdueTasks.length
        ? [
            {
              id: 'admin-overdue-tasks',
              title: `${overdueTasks.length} overdue tasks`,
              detail: 'Delivery work has slipped past due dates.',
              severity: 'critical' as const,
              route: '/projects',
            },
          ]
        : []),
      ...summary.lowStockItems.slice(0, 2).map((item) => ({
        id: `admin-low-stock-${item.id}`,
        title: item.name,
        detail: `${item.onHand} units on hand.`,
        severity: item.onHand <= 0 ? ('critical' as const) : ('warning' as const),
        entityType: 'inventory_item' as const,
        entityId: item.id,
        route: '/inventory',
      })),
      ...overdueInvoices.slice(0, 2).map((invoice) => ({
        id: `admin-overdue-invoice-${invoice.id}`,
        title: invoice.invoiceNumber,
        detail: `${(invoice.outstandingAmount ?? invoice.total).toFixed(2)} still outstanding.`,
        severity: 'critical' as const,
        entityType: 'invoice' as const,
        entityId: invoice.id,
        route: '/finance',
      })),
      ...overdueBills.slice(0, 2).map((bill) => ({
        id: `admin-overdue-bill-${bill.id}`,
        title: bill.billNumber,
        detail: `${(bill.outstandingAmount ?? bill.amount).toFixed(2)} still payable.`,
        severity: 'warning' as const,
        entityType: 'vendor_bill' as const,
        entityId: bill.id,
        route: '/finance',
      })),
    ];

    const quickActions: DashboardQuickAction[] = [
      { id: 'open-users', label: 'Users', route: '/users' },
      { id: 'open-finance', label: 'Finance', route: '/finance' },
      { id: 'open-projects', label: 'Projects', route: '/projects' },
    ];

    return {
      companyId,
      role: viewer.role,
      scope: 'company',
      metrics,
      charts,
      alerts,
      activity: this.mapActivityItems(summary.recentActivity),
      quickActions,
    };
  }

  listRecordAttachments(
    companyId: string,
    entityType: RecordEntityType,
    entityId: string,
  ): RecordAttachment[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM record_attachments WHERE companyId = ? AND entityType = ? AND entityId = ? ORDER BY createdAt DESC',
      )
      .all(companyId, entityType, entityId) as any[];
    return rows.map((row) => this.decodeRecordAttachment(row));
  }

  getRecordAttachmentById(id: string): RecordAttachment | undefined {
    const row = this.db.prepare('SELECT * FROM record_attachments WHERE id = ?').get(id) as any;
    return row ? this.decodeRecordAttachment(row) : undefined;
  }

  createRecordAttachment(input: CreateRecordAttachmentInput): RecordAttachment {
    const attachment: RecordAttachment = {
      ...input,
      id: uuid(),
      sizeBytes:
        input.sizeBytes === undefined || input.sizeBytes === null
          ? undefined
          : Math.max(0, Number(input.sizeBytes)),
      uploadedByUserId: input.uploadedByUserId ?? this.currentActor?.userId,
      uploadedByName: input.uploadedByName ?? this.currentActor?.name,
      createdAt: input.createdAt ? new Date(input.createdAt) : new Date(),
    };

    this.db
      .prepare(
        'INSERT INTO record_attachments (id, companyId, entityType, entityId, fileName, url, mimeType, sizeBytes, note, uploadedByUserId, uploadedByName, createdAt) VALUES (@id, @companyId, @entityType, @entityId, @fileName, @url, @mimeType, @sizeBytes, @note, @uploadedByUserId, @uploadedByName, @createdAt)',
      )
      .run({
        ...attachment,
        url: attachment.url ?? null,
        mimeType: attachment.mimeType ?? null,
        sizeBytes: attachment.sizeBytes ?? null,
        note: attachment.note ?? null,
        uploadedByUserId: attachment.uploadedByUserId ?? null,
        uploadedByName: attachment.uploadedByName ?? null,
        createdAt: attachment.createdAt.toISOString(),
      });

    if (activityEntityTypes.includes(attachment.entityType as ActivityEvent['entityType'])) {
      this.createActivityEvent({
        companyId: attachment.companyId,
        entityType: attachment.entityType as ActivityEvent['entityType'],
        entityId: attachment.entityId,
        action: 'attachment_added',
        summary: `Attachment ${attachment.fileName} added.`,
        metadata: {
          attachmentId: attachment.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
        },
      });
    }

    return attachment;
  }

  deleteRecordAttachment(id: string): boolean {
    const attachment = this.getRecordAttachmentById(id);
    if (!attachment) return false;
    const result = this.db.prepare('DELETE FROM record_attachments WHERE id = ?').run(id);
    if (result.changes > 0 && activityEntityTypes.includes(attachment.entityType as ActivityEvent['entityType'])) {
      this.createActivityEvent({
        companyId: attachment.companyId,
        entityType: attachment.entityType as ActivityEvent['entityType'],
        entityId: attachment.entityId,
        action: 'attachment_deleted',
        summary: `Attachment ${attachment.fileName} removed.`,
        metadata: { attachmentId: attachment.id, fileName: attachment.fileName },
      });
    }
    return result.changes > 0;
  }

  getRecordTimeline(
    companyId: string,
    entityType: RecordEntityType,
    entityId: string,
    limit = 50,
  ): RecordTimelineItem[] {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const attachments = this.listRecordAttachments(companyId, entityType, entityId).map(
      (attachment): RecordTimelineItem => ({
        id: attachment.id,
        type: 'attachment',
        title: `Attachment added: ${attachment.fileName}`,
        detail: attachment.note,
        actorName: attachment.uploadedByName,
        createdAt: attachment.createdAt,
        entityType,
        entityId,
        attachment,
      }),
    );
    const activities = activityEntityTypes.includes(entityType as ActivityEvent['entityType'])
      ? this.listActivityEvents(companyId, {
          entityType: entityType as ActivityEvent['entityType'],
          entityId,
          limit: safeLimit,
        }).map(
          (activity): RecordTimelineItem => ({
            id: activity.id,
            type: 'activity',
            title: activity.summary,
            detail: activity.action,
            actorName: activity.actorName,
            createdAt: activity.createdAt,
            entityType,
            entityId,
            activity,
          }),
        )
      : [];

    return [...attachments, ...activities]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, safeLimit);
  }

  listActivityEvents(
    companyId: string,
    options?: {
      entityType?: ActivityEvent['entityType'];
      entityId?: string;
      actorUserId?: string;
      limit?: number;
    },
  ): ActivityEvent[] {
    const limit = options?.limit ?? 50;
    const rows =
      options?.entityType && options?.entityId && options?.actorUserId
        ? (this.db
            .prepare(
              'SELECT * FROM activity_events WHERE companyId = ? AND entityType = ? AND entityId = ? AND actorUserId = ? ORDER BY createdAt DESC LIMIT ?',
            )
            .all(companyId, options.entityType, options.entityId, options.actorUserId, limit) as any[])
      : options?.entityType && options?.entityId
      ? (this.db
          .prepare(
            'SELECT * FROM activity_events WHERE companyId = ? AND entityType = ? AND entityId = ? ORDER BY createdAt DESC LIMIT ?',
          )
          .all(companyId, options.entityType, options.entityId, limit) as any[])
      : options?.entityType && options?.actorUserId
        ? (this.db
            .prepare(
              'SELECT * FROM activity_events WHERE companyId = ? AND entityType = ? AND actorUserId = ? ORDER BY createdAt DESC LIMIT ?',
            )
            .all(companyId, options.entityType, options.actorUserId, limit) as any[])
      : options?.entityType
        ? (this.db
            .prepare(
              'SELECT * FROM activity_events WHERE companyId = ? AND entityType = ? ORDER BY createdAt DESC LIMIT ?',
            )
            .all(companyId, options.entityType, limit) as any[])
        : options?.actorUserId && options?.entityId
          ? (this.db
              .prepare(
                'SELECT * FROM activity_events WHERE companyId = ? AND entityId = ? AND actorUserId = ? ORDER BY createdAt DESC LIMIT ?',
              )
              .all(companyId, options.entityId, options.actorUserId, limit) as any[])
          : options?.actorUserId
            ? (this.db
                .prepare(
                  'SELECT * FROM activity_events WHERE companyId = ? AND actorUserId = ? ORDER BY createdAt DESC LIMIT ?',
                )
                .all(companyId, options.actorUserId, limit) as any[])
        : options?.entityId
          ? (this.db
              .prepare(
                'SELECT * FROM activity_events WHERE companyId = ? AND entityId = ? ORDER BY createdAt DESC LIMIT ?',
              )
              .all(companyId, options.entityId, limit) as any[])
          : (this.db
              .prepare('SELECT * FROM activity_events WHERE companyId = ? ORDER BY createdAt DESC LIMIT ?')
              .all(companyId, limit) as any[]);
    return rows.map((row) => this.decodeActivityEvent(row));
  }

  createActivityEvent(input: CreateActivityEventInput): ActivityEvent {
    const event: ActivityEvent = {
      ...input,
      id: uuid(),
      actorUserId: input.actorUserId ?? this.currentActor?.userId,
      actorName: input.actorName ?? this.currentActor?.name,
      createdAt: input.createdAt ? new Date(input.createdAt) : new Date(),
    };
    this.db
      .prepare(
        'INSERT INTO activity_events (id, companyId, actorUserId, actorName, entityType, entityId, action, summary, metadata, createdAt) VALUES (@id, @companyId, @actorUserId, @actorName, @entityType, @entityId, @action, @summary, @metadata, @createdAt)',
      )
      .run({
        ...event,
        actorUserId: event.actorUserId ?? null,
        actorName: event.actorName ?? null,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        createdAt: event.createdAt.toISOString(),
      });
    return event;
  }

  // ── Notifications ────────────────────────────────────────────────────────

  private decodeNotification(row: any): Notification {
    return {
      id: row.id,
      companyId: row.companyId,
      userId: row.userId,
      category: row.category,
      type: row.type,
      priority: row.priority,
      title: row.title,
      body: row.body ?? undefined,
      link: row.link ?? undefined,
      entityType: row.entityType ?? undefined,
      entityId: row.entityId ?? undefined,
      readAt: row.readAt ? new Date(row.readAt) : undefined,
      emailedAt: row.emailedAt ? new Date(row.emailedAt) : undefined,
      createdAt: new Date(row.createdAt),
    };
  }

  /** User ids in a company holding any of the given company roles. */
  listUserIdsByCompanyRoles(companyId: string, roles: string[]): string[] {
    const rows = this.db.prepare('SELECT * FROM users').all() as any[];
    const ids: string[] = [];
    for (const row of rows) {
      const user = this.sanitizeUser(row);
      const role =
        user.companyRoles?.find((assignment) => assignment.companyId === companyId)?.role ??
        (user.companyIds?.includes(companyId) ? user.role : undefined);
      if (role && roles.includes(role)) ids.push(user.id);
    }
    return ids;
  }

  getNotificationPrefs(userId: string): NotificationPrefs {
    const row = this.db.prepare('SELECT notificationPrefs FROM users WHERE id = ?').get(userId) as any;
    if (!row) return defaultNotificationPrefs();
    return normalizeNotificationPrefs(this.parseJson(row.notificationPrefs));
  }

  updateNotificationPrefs(userId: string, prefs: NotificationPrefs): NotificationPrefs {
    const normalized = normalizeNotificationPrefs(prefs);
    this.db
      .prepare('UPDATE users SET notificationPrefs = @prefs WHERE id = @id')
      .run({ id: userId, prefs: JSON.stringify(normalized) });
    return normalized;
  }

  /**
   * Create a notification for each recipient (minus the acting user). Respects
   * each recipient's category preferences (skips when both channels are off) and
   * optional dedupe so reminder sweeps don't pile up duplicates. Returns the
   * created rows and hands them to the dispatch hook for email.
   */
  notify(input: {
    companyId: string;
    userIds: string[];
    type: NotificationType;
    title: string;
    body?: string;
    link?: string;
    entityType?: string;
    entityId?: string;
    /** Skip if a same (user, type, entityId) notification exists within this window. */
    dedupeWithinMs?: number;
  }): Notification[] {
    const meta = NOTIFICATION_META[input.type];
    if (!meta) return [];
    const actorId = this.currentActor?.userId;
    const recipients = Array.from(new Set(input.userIds.filter((id) => id && id !== actorId)));
    if (recipients.length === 0) return [];

    const now = new Date();
    const insert = this.db.prepare(
      `INSERT INTO notifications
        (id, companyId, userId, category, type, priority, title, body, link, entityType, entityId, readAt, emailedAt, createdAt)
       VALUES (@id, @companyId, @userId, @category, @type, @priority, @title, @body, @link, @entityType, @entityId, NULL, NULL, @createdAt)`,
    );
    const created: Notification[] = [];

    for (const userId of recipients) {
      const prefs = this.getNotificationPrefs(userId)[meta.category];
      if (!prefs.inApp && !prefs.email) continue; // category fully muted

      if (input.dedupeWithinMs && input.entityId) {
        const since = new Date(now.getTime() - input.dedupeWithinMs).toISOString();
        const existing = this.db
          .prepare(
            'SELECT id FROM notifications WHERE userId = ? AND type = ? AND entityId = ? AND createdAt >= ? LIMIT 1',
          )
          .get(userId, input.type, input.entityId, since);
        if (existing) continue;
      }

      const notification: Notification = {
        id: uuid(),
        companyId: input.companyId,
        userId,
        category: meta.category,
        type: input.type,
        priority: meta.priority,
        title: input.title,
        body: input.body,
        link: input.link,
        entityType: input.entityType,
        entityId: input.entityId,
        createdAt: now,
      };
      insert.run({
        ...notification,
        body: notification.body ?? null,
        link: notification.link ?? null,
        entityType: notification.entityType ?? null,
        entityId: notification.entityId ?? null,
        createdAt: now.toISOString(),
      });
      created.push(notification);
    }

    if (created.length > 0 && this.onNotificationsCreated) {
      try {
        this.onNotificationsCreated(created);
      } catch (err) {
        console.error('onNotificationsCreated hook failed:', err);
      }
    }
    return created;
  }

  /** List a user's notifications, filtered to categories they keep in-app. */
  listNotifications(userId: string, options: { limit?: number; unreadOnly?: boolean } = {}): Notification[] {
    const prefs = this.getNotificationPrefs(userId);
    const inAppCategories = (Object.keys(prefs) as Array<keyof NotificationPrefs>).filter((c) => prefs[c].inApp);
    if (inAppCategories.length === 0) return [];
    const placeholders = inAppCategories.map(() => '?').join(',');
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const unreadClause = options.unreadOnly ? 'AND readAt IS NULL' : '';
    const rows = this.db
      .prepare(
        `SELECT * FROM notifications
         WHERE userId = ? AND category IN (${placeholders}) ${unreadClause}
         ORDER BY createdAt DESC LIMIT ?`,
      )
      .all(userId, ...inAppCategories, limit) as any[];
    return rows.map((row) => this.decodeNotification(row));
  }

  unreadNotificationCount(userId: string): number {
    const prefs = this.getNotificationPrefs(userId);
    const inAppCategories = (Object.keys(prefs) as Array<keyof NotificationPrefs>).filter((c) => prefs[c].inApp);
    if (inAppCategories.length === 0) return 0;
    const placeholders = inAppCategories.map(() => '?').join(',');
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM notifications WHERE userId = ? AND readAt IS NULL AND category IN (${placeholders})`,
      )
      .get(userId, ...inAppCategories) as any;
    return Number(row?.c ?? 0);
  }

  markNotificationRead(userId: string, notificationId: string): boolean {
    const result = this.db
      .prepare('UPDATE notifications SET readAt = @now WHERE id = @id AND userId = @userId AND readAt IS NULL')
      .run({ id: notificationId, userId, now: new Date().toISOString() });
    return result.changes > 0;
  }

  markAllNotificationsRead(userId: string): number {
    const result = this.db
      .prepare('UPDATE notifications SET readAt = @now WHERE userId = @userId AND readAt IS NULL')
      .run({ userId, now: new Date().toISOString() });
    return result.changes;
  }

  markNotificationEmailed(ids: string[]): void {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    const stmt = this.db.prepare('UPDATE notifications SET emailedAt = ? WHERE id = ?');
    const tx = this.db.transaction((rows: string[]) => rows.forEach((id) => stmt.run(now, id)));
    tx(ids);
  }

  /** Set (or replace) the post-creation hook used to dispatch emails. */
  setOnNotificationsCreated(fn: (notifications: Notification[]) => void): void {
    this.onNotificationsCreated = fn;
  }

  /** Normal-priority, not-yet-emailed notifications — fodder for the daily digest. */
  listPendingDigestNotifications(): Notification[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM notifications WHERE priority = 'normal' AND emailedAt IS NULL ORDER BY userId, createdAt ASC",
      )
      .all() as any[];
    return rows.map((row) => this.decodeNotification(row));
  }

  /** Notify assignees of tasks that are due within 24h or already overdue (once/day). */
  sweepTaskDueReminders(): number {
    const now = Date.now();
    const horizon = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    const rows = this.db
      .prepare("SELECT * FROM tasks WHERE status != 'Done' AND dueDate IS NOT NULL AND dueDate <= ?")
      .all(horizon) as any[];
    let count = 0;
    for (const row of rows) {
      const task = this.decodeTask(row);
      const assignees = task.assignedUserIds ?? [];
      if (assignees.length === 0) continue;
      const overdue = task.dueDate ? task.dueDate.getTime() < now : false;
      count += this.notify({
        companyId: task.companyId,
        userIds: assignees,
        type: 'task_due',
        title: `${overdue ? 'Overdue' : 'Due soon'}: ${task.title}`,
        body: task.dueDate ? `Due ${task.dueDate.toISOString().slice(0, 10)}.` : undefined,
        link: taskLink(task.projectId),
        entityType: 'task',
        entityId: task.id,
        dedupeWithinMs: 20 * 60 * 60 * 1000,
      }).length;
    }
    return count;
  }

  /** Notify owners of contacts whose follow-up date has arrived (once/day). */
  sweepFollowupDueReminders(): number {
    const nowIso = new Date().toISOString();
    // Open follow-ups whose reminder/due time has arrived, owned by someone.
    const rows = this.db
      .prepare(
        `SELECT * FROM follow_ups
           WHERE status = 'open' AND ownerUserId IS NOT NULL
             AND COALESCE(reminderAt, dueAt) IS NOT NULL
             AND COALESCE(reminderAt, dueAt) <= ?`,
      )
      .all(nowIso) as any[];
    let count = 0;
    for (const row of rows) {
      const f = this.decodeFollowup(row);
      if (!f.ownerUserId) continue;
      // Resolve a human label + deep link from the attached entity.
      let name = f.title || 'Follow-up';
      let link = '/crm/followups';
      if (f.entityType === 'contact') {
        const c = this.getContactById(f.entityId);
        if (c) { name = c.name; link = `/contacts/${c.id}`; }
      }
      count += this.notify({
        companyId: f.companyId,
        userIds: [f.ownerUserId],
        type: 'followup_due',
        title: `Follow-up due: ${name}`,
        body: f.title || f.notes || undefined,
        link,
        entityType: 'follow_up',
        entityId: f.id,
        dedupeWithinMs: 20 * 60 * 60 * 1000,
      }).length;
    }
    return count;
  }

  /** Wake snoozed follow-ups whose snooze window has elapsed (back to 'open'). */
  sweepSnoozedFollowups(): number {
    const nowIso = new Date().toISOString();
    const res = this.db
      .prepare(
        "UPDATE follow_ups SET status = 'open', updatedAt = ? WHERE status = 'snoozed' AND snoozedUntil IS NOT NULL AND snoozedUntil <= ?",
      )
      .run(nowIso, nowIso);
    return res.changes;
  }

  /** Notify Admin/Manager when a tracked item is at or below its reorder point (once/day). */
  sweepLowStockNotifications(): number {
    const rows = this.db
      .prepare(
        'SELECT * FROM inventory_items WHERE tracksInventory = 1 AND reorderPoint > 0 AND onHand <= reorderPoint',
      )
      .all() as any[];
    let count = 0;
    const recipientsByCompany = new Map<string, string[]>();
    for (const row of rows) {
      const companyId = row.companyId as string;
      let recipients = recipientsByCompany.get(companyId);
      if (!recipients) {
        recipients = this.listUserIdsByCompanyRoles(companyId, ['Admin', 'Manager']);
        recipientsByCompany.set(companyId, recipients);
      }
      const onHand = Number(row.onHand) || 0;
      const reorder = Number(row.reorderPoint) || 0;
      const suggested = Math.max(Math.ceil(reorder * 2 - onHand), 1);
      count += this.notify({
        companyId,
        userIds: recipients,
        type: 'low_stock',
        title: `Low stock: ${row.name}`,
        body: `On hand ${onHand}, reorder point ${reorder}. Suggested reorder ≈ ${suggested} ${row.unit || ''}.`.trim(),
        link: '/inventory',
        entityType: 'inventory_item',
        entityId: row.id,
        dedupeWithinMs: 20 * 60 * 60 * 1000,
      }).length;
    }
    return count;
  }

  /** Notify finance roles about unpaid invoices past their due date (once/day). */
  sweepOverdueInvoiceNotifications(): number {
    const nowIso = new Date().toISOString();
    const rows = this.db
      .prepare("SELECT * FROM invoices WHERE status NOT IN ('Paid','Draft') AND dueDate < ?")
      .all(nowIso) as any[];
    let count = 0;
    const financeByCompany = new Map<string, string[]>();
    for (const row of rows) {
      const inv = this.decodeInvoice(row);
      const outstanding = inv.outstandingAmount ?? inv.total;
      if (outstanding <= 0) continue;
      let recipients = financeByCompany.get(inv.companyId);
      if (!recipients) {
        recipients = this.listUserIdsByCompanyRoles(inv.companyId, ['Admin', 'Manager', 'Accountant']);
        financeByCompany.set(inv.companyId, recipients);
      }
      count += this.notify({
        companyId: inv.companyId,
        userIds: recipients,
        type: 'invoice_overdue',
        title: `Overdue invoice: ${inv.invoiceNumber}`,
        body: `Outstanding ${outstanding.toFixed(2)} ${inv.currency ?? ''}, due ${inv.dueDate.toISOString().slice(0, 10)}.`,
        link: '/finance',
        entityType: 'invoice',
        entityId: inv.id,
        dedupeWithinMs: 20 * 60 * 60 * 1000,
      }).length;
    }
    return count;
  }

  createCrmActivity(input: {
    companyId: string;
    contactId: string;
    category: import('../types').ActivityCategory;
    summary: string;
    outcome?: string;
    nextAction?: string;
    nextActionDueDate?: Date;
    durationMinutes?: number;
  }): ActivityEvent {
    const id = uuid();
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO activity_events
         (id, companyId, actorUserId, actorName, entityType, entityId, action, summary,
          category, outcome, nextAction, nextActionDueDate, durationMinutes, createdAt)
       VALUES
         (@id, @companyId, @actorUserId, @actorName, 'contact', @contactId, @action, @summary,
          @category, @outcome, @nextAction, @nextActionDueDate, @durationMinutes, @now)`,
    ).run({
      id,
      companyId: input.companyId,
      actorUserId: this.currentActor?.userId ?? null,
      actorName: this.currentActor?.name ?? null,
      contactId: input.contactId,
      action: `crm_activity_${input.category.toLowerCase().replace(/\s+/g, '_')}`,
      summary: input.summary,
      category: input.category,
      outcome: input.outcome ?? null,
      nextAction: input.nextAction ?? null,
      nextActionDueDate: input.nextActionDueDate ? input.nextActionDueDate.toISOString() : null,
      durationMinutes: input.durationMinutes ?? null,
      now,
    });

    // Update contact nextFollowupDate if provided
    if (input.nextActionDueDate) {
      this.db.prepare(
        `UPDATE contacts SET nextFollowupDate=@date, nextFollowupNote=@note, updatedAt=@now WHERE id=@id`,
      ).run({
        id: input.contactId,
        date: input.nextActionDueDate.toISOString(),
        note: input.nextAction ?? null,
        now,
      });
    }

    const row = this.db.prepare('SELECT * FROM activity_events WHERE id = ?').get(id) as any;
    return this.decodeActivityEvent(row);
  }

  // ── First-class follow-ups (follow_ups table) ─────────────────────────────

  private listFollowupAssignees(followUpId: string): FollowUpAssignee[] {
    const rows = this.db
      .prepare(
        `SELECT a.userId, a.addedByUserId, a.createdAt, u.name AS name
           FROM follow_up_assignees a
           LEFT JOIN users u ON u.id = a.userId
          WHERE a.followUpId = ?
          ORDER BY a.createdAt ASC`,
      )
      .all(followUpId) as any[];
    return rows.map((r) => ({
      userId: r.userId,
      name: r.name ?? undefined,
      addedByUserId: r.addedByUserId ?? undefined,
      createdAt: r.createdAt ? new Date(r.createdAt) : undefined,
    }));
  }

  private decodeFollowup(row: any): FollowUp {
    return {
      id: row.id,
      companyId: row.companyId,
      ownerUserId: row.ownerUserId ?? undefined,
      ownerName: row.ownerName ?? undefined,
      assignees: this.listFollowupAssignees(row.id),
      entityType: row.entityType as FollowUpEntityType,
      entityId: row.entityId,
      title: row.title ?? undefined,
      type: row.type ?? 'Follow-up',
      channel: row.channel ?? undefined,
      status: row.status as FollowUpStatus,
      priority: (row.priority ?? 'normal') as FollowUpPriority,
      dueAt: row.dueAt ? new Date(row.dueAt) : undefined,
      reminderAt: row.reminderAt ? new Date(row.reminderAt) : undefined,
      snoozedUntil: row.snoozedUntil ? new Date(row.snoozedUntil) : undefined,
      completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
      completedByUserId: row.completedByUserId ?? undefined,
      outcome: row.outcome ?? undefined,
      outcomeNote: row.outcomeNote ?? undefined,
      notes: row.notes ?? undefined,
      sourceTrigger: row.sourceTrigger ?? undefined,
      sourceType: row.sourceType ?? undefined,
      sourceId: row.sourceId ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  getFollowupById(id: string): FollowUp | undefined {
    const row = this.db.prepare('SELECT * FROM follow_ups WHERE id = ?').get(id) as any;
    return row ? this.decodeFollowup(row) : undefined;
  }

  /**
   * Create a follow-up. Idempotent when a sourceId is supplied: the UNIQUE
   * partial index on (companyId, entityType, entityId, sourceTrigger, sourceId)
   * guarantees one follow-up per business event, so re-firing a trigger returns
   * the existing row instead of duplicating it.
   */
  createFollowup(input: {
    companyId: string;
    entityType: FollowUpEntityType;
    entityId: string;
    title?: string;
    type?: string;
    channel?: FollowUpChannel;
    priority?: FollowUpPriority;
    ownerUserId?: string;
    ownerName?: string;
    dueAt?: Date | string;
    reminderAt?: Date | string;
    notes?: string;
    sourceTrigger?: string;
    sourceType?: string;
    sourceId?: string;
  }): FollowUp {
    const nowIso = new Date().toISOString();
    const dueAt = input.dueAt ? new Date(input.dueAt).toISOString() : null;
    const reminderAt = input.reminderAt ? new Date(input.reminderAt).toISOString() : dueAt;
    const sourceTrigger = input.sourceTrigger ?? 'manual';
    const sourceId = input.sourceId ?? null;

    // Idempotent path: only one open follow-up per (entity, trigger, sourceId).
    if (sourceId) {
      const existing = this.db
        .prepare(
          'SELECT * FROM follow_ups WHERE companyId = ? AND entityType = ? AND entityId = ? AND sourceTrigger = ? AND sourceId = ?',
        )
        .get(input.companyId, input.entityType, input.entityId, sourceTrigger, sourceId) as any;
      if (existing) return this.decodeFollowup(existing);
    }

    const id = uuid();
    this.db
      .prepare(
        `INSERT INTO follow_ups
           (id, companyId, ownerUserId, ownerName, entityType, entityId, title, type, channel,
            status, priority, dueAt, reminderAt, snoozedUntil, completedAt, completedByUserId,
            outcome, outcomeNote, notes, sourceTrigger, sourceType, sourceId, createdAt, updatedAt)
         VALUES
           (@id, @companyId, @ownerUserId, @ownerName, @entityType, @entityId, @title, @type, @channel,
            'open', @priority, @dueAt, @reminderAt, NULL, NULL, NULL,
            NULL, NULL, @notes, @sourceTrigger, @sourceType, @sourceId, @now, @now)`,
      )
      .run({
        id,
        companyId: input.companyId,
        ownerUserId: input.ownerUserId ?? null,
        ownerName: input.ownerName ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        title: input.title ?? null,
        type: input.type ?? 'Follow-up',
        channel: input.channel ?? null,
        priority: input.priority ?? 'normal',
        dueAt,
        reminderAt,
        notes: input.notes ?? null,
        sourceTrigger,
        sourceType: input.sourceType ?? null,
        sourceId,
        now: nowIso,
      });
    return this.getFollowupById(id)!;
  }

  /** Raw follow_ups query (status defaults to 'open'). */
  listFollowupEntities(
    companyId: string,
    options?: {
      status?: FollowUpStatus | 'active';
      ownerUserId?: string;
      entityType?: FollowUpEntityType;
      entityId?: string;
      overdue?: boolean;
      limit?: number;
    },
  ): FollowUp[] {
    const status = options?.status ?? 'active';
    const nowIso = new Date().toISOString();
    let sql = 'SELECT * FROM follow_ups WHERE companyId = ?';
    const params: any[] = [companyId];
    if (status === 'active') {
      sql += " AND status IN ('open','snoozed')";
    } else {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (options?.ownerUserId) {
      // "Mine" = I own it OR I was invited to collaborate on it.
      sql += ' AND (ownerUserId = ? OR id IN (SELECT followUpId FROM follow_up_assignees WHERE userId = ?))';
      params.push(options.ownerUserId, options.ownerUserId);
    }
    if (options?.entityType) { sql += ' AND entityType = ?'; params.push(options.entityType); }
    if (options?.entityId) { sql += ' AND entityId = ?'; params.push(options.entityId); }
    if (options?.overdue === true) { sql += ' AND dueAt IS NOT NULL AND dueAt < ?'; params.push(nowIso); }
    if (options?.overdue === false) { sql += ' AND dueAt IS NOT NULL AND dueAt >= ?'; params.push(nowIso); }
    sql += ' ORDER BY (dueAt IS NULL), dueAt ASC LIMIT ?';
    params.push(options?.limit ?? 500);
    return (this.db.prepare(sql).all(...params) as any[]).map((r) => this.decodeFollowup(r));
  }

  completeFollowup(
    id: string,
    input: { outcome?: FollowUpOutcome; outcomeNote?: string; completedByUserId?: string } = {},
  ): FollowUp | undefined {
    const existing = this.getFollowupById(id);
    if (!existing) return undefined;
    const nowIso = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE follow_ups SET status = 'completed', completedAt = @now, completedByUserId = @by,
           outcome = @outcome, outcomeNote = @outcomeNote, updatedAt = @now WHERE id = @id`,
      )
      .run({
        id,
        now: nowIso,
        by: input.completedByUserId ?? this.currentActor?.userId ?? null,
        outcome: input.outcome ?? null,
        outcomeNote: input.outcomeNote ?? null,
      });
    // Keep the contact's denormalized "soonest" cache honest when we close one.
    if (existing.entityType === 'contact' && existing.sourceId === existing.entityId) {
      this.db
        .prepare('UPDATE contacts SET nextFollowupDate = NULL, nextFollowupNote = NULL WHERE id = ?')
        .run(existing.entityId);
    }
    return this.getFollowupById(id);
  }

  snoozeFollowup(id: string, until: Date | string): FollowUp | undefined {
    const existing = this.getFollowupById(id);
    if (!existing) return undefined;
    const untilIso = new Date(until).toISOString();
    const nowIso = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE follow_ups SET status = 'snoozed', snoozedUntil = @until, dueAt = @until,
           reminderAt = @until, updatedAt = @now WHERE id = @id`,
      )
      .run({ id, until: untilIso, now: nowIso });
    return this.getFollowupById(id);
  }

  rescheduleFollowupEntity(id: string, dueAt: Date | string, title?: string): FollowUp | undefined {
    const existing = this.getFollowupById(id);
    if (!existing) return undefined;
    const dueIso = new Date(dueAt).toISOString();
    const nowIso = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE follow_ups SET dueAt = @due, reminderAt = @due, snoozedUntil = NULL, status = 'open',
           title = COALESCE(@title, title), updatedAt = @now WHERE id = @id`,
      )
      .run({ id, due: dueIso, title: title ?? null, now: nowIso });
    if (existing.entityType === 'contact' && existing.sourceId === existing.entityId) {
      this.db
        .prepare('UPDATE contacts SET nextFollowupDate = ? WHERE id = ?')
        .run(dueIso, existing.entityId);
    }
    return this.getFollowupById(id);
  }

  reassignFollowup(id: string, ownerUserId: string): FollowUp | undefined {
    const existing = this.getFollowupById(id);
    if (!existing) return undefined;
    const owner = this.getUserById(ownerUserId);
    this.db
      .prepare('UPDATE follow_ups SET ownerUserId = ?, ownerName = ?, updatedAt = ? WHERE id = ?')
      .run(ownerUserId, owner?.name ?? null, new Date().toISOString(), id);
    return this.getFollowupById(id);
  }

  cancelFollowup(id: string): FollowUp | undefined {
    const existing = this.getFollowupById(id);
    if (!existing) return undefined;
    this.db
      .prepare("UPDATE follow_ups SET status = 'cancelled', updatedAt = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
    return this.getFollowupById(id);
  }

  /**
   * Invite a teammate to collaborate on a follow-up. This ADDS a participant —
   * it does not change the owner. No-op if they are already the owner or an
   * existing collaborator. Notifies the invited person.
   */
  addFollowupAssignee(id: string, userId: string, addedByUserId?: string): FollowUp | undefined {
    const existing = this.getFollowupById(id);
    if (!existing) return undefined;
    if (existing.ownerUserId === userId) return existing; // already on point
    const user = this.getUserById(userId);
    if (!user || user.companyIds?.includes(existing.companyId) === false) {
      // Only allow inviting users who belong to the same company.
      if (!user) return existing;
    }
    const nowIso = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO follow_up_assignees (followUpId, userId, addedByUserId, createdAt)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, userId, addedByUserId ?? null, nowIso);
    this.db.prepare('UPDATE follow_ups SET updatedAt = ? WHERE id = ?').run(nowIso, id);

    if (result.changes > 0) {
      let name = existing.title || 'a follow-up';
      let link = '/crm/followups';
      if (existing.entityType === 'contact') {
        const c = this.getContactById(existing.entityId);
        if (c) { name = c.name; link = `/contacts/${c.id}`; }
      }
      this.notify({
        companyId: existing.companyId,
        userIds: [userId],
        type: 'followup_assigned',
        title: `You were added to a follow-up: ${name}`,
        body: existing.title || existing.notes || undefined,
        link,
        entityType: 'follow_up',
        entityId: existing.id,
      });
    }
    return this.getFollowupById(id);
  }

  /** Remove a collaborator from a follow-up (does not affect the owner). */
  removeFollowupAssignee(id: string, userId: string): FollowUp | undefined {
    const existing = this.getFollowupById(id);
    if (!existing) return undefined;
    this.db.prepare('DELETE FROM follow_up_assignees WHERE followUpId = ? AND userId = ?').run(id, userId);
    this.db.prepare('UPDATE follow_ups SET updatedAt = ? WHERE id = ?').run(new Date().toISOString(), id);
    return this.getFollowupById(id);
  }

  /** General field update (title, type, channel, priority, owner, due, notes). */
  updateFollowup(
    id: string,
    updates: {
      title?: string;
      type?: string;
      channel?: FollowUpChannel | null;
      priority?: FollowUpPriority;
      ownerUserId?: string | null;
      dueAt?: Date | string | null;
      notes?: string | null;
    },
  ): FollowUp | undefined {
    const existing = this.getFollowupById(id);
    if (!existing) return undefined;
    const ownerName =
      updates.ownerUserId !== undefined
        ? (updates.ownerUserId ? this.getUserById(updates.ownerUserId)?.name ?? null : null)
        : (existing.ownerName ?? null);
    const dueIso =
      updates.dueAt !== undefined
        ? (updates.dueAt ? new Date(updates.dueAt).toISOString() : null)
        : (existing.dueAt ? existing.dueAt.toISOString() : null);
    this.db
      .prepare(
        `UPDATE follow_ups SET
           title = @title, type = @type, channel = @channel, priority = @priority,
           ownerUserId = @ownerUserId, ownerName = @ownerName,
           dueAt = @dueAt, reminderAt = @dueAt, notes = @notes, updatedAt = @now
         WHERE id = @id`,
      )
      .run({
        id,
        title: updates.title !== undefined ? (updates.title || null) : (existing.title ?? null),
        type: updates.type ?? existing.type,
        channel: updates.channel !== undefined ? (updates.channel || null) : (existing.channel ?? null),
        priority: updates.priority ?? existing.priority,
        ownerUserId: updates.ownerUserId !== undefined ? (updates.ownerUserId || null) : (existing.ownerUserId ?? null),
        ownerName,
        dueAt: dueIso,
        notes: updates.notes !== undefined ? (updates.notes || null) : (existing.notes ?? null),
        now: new Date().toISOString(),
      });
    return this.getFollowupById(id);
  }

  /**
   * Follow-ups for the CRM inbox. Now backed by the first-class follow_ups
   * table, but each row is decorated with legacy-compatible aliases
   * (nextActionDueDate / summary / category / nextAction / actorName / isAuto /
   * trigger) so the existing page and internal callers keep working unchanged.
   */
  listFollowups(companyId: string, options?: {
    contactId?: string;
    ownerUserId?: string;
    overdue?: boolean;
    limit?: number;
  }): Array<FollowUp & {
    summary: string;
    category: import('../types').ActivityCategory;
    nextAction?: string;
    nextActionDueDate?: Date;
    actorUserId?: string;
    actorName?: string;
    isAuto: boolean;
    trigger?: string;
  }> {
    const channelToCategory = (c?: string): import('../types').ActivityCategory => {
      switch (c) {
        case 'Call': return 'Call';
        case 'WhatsApp': return 'WhatsApp';
        case 'Email': return 'Email';
        case 'Meeting': return 'Meeting';
        default: return 'Follow-up';
      }
    };
    const rows = this.listFollowupEntities(companyId, {
      status: 'active',
      ownerUserId: options?.ownerUserId,
      entityId: options?.contactId,
      overdue: options?.overdue,
      limit: options?.limit ?? 100,
    });
    return rows.map((f) => ({
      ...f,
      summary: f.title || f.notes || 'Follow-up',
      category: channelToCategory(f.channel),
      nextAction: f.title,
      nextActionDueDate: f.dueAt,
      actorUserId: f.ownerUserId,
      actorName: f.ownerName,
      isAuto: Boolean(f.sourceTrigger && f.sourceTrigger !== 'manual' && f.sourceTrigger !== 'legacy_contact'),
      trigger: f.sourceTrigger,
    }));
  }

  // ─── Manager command center (Phase 2) ──────────────────────────────────────

  /**
   * Per-rep follow-up workload for a company: open/overdue/due-today/snoozed
   * counts plus the age of the oldest overdue item (the "going cold" signal).
   * Includes an "Unassigned" bucket (ownerUserId NULL) and every active member
   * even at zero, so the heatmap shows idle reps too.
   */
  followupWorkload(companyId: string): {
    byUser: Array<{
      userId: string | null;
      name: string;
      open: number;
      overdue: number;
      dueToday: number;
      snoozed: number;
      oldestOverdueAt?: Date;
    }>;
    totals: { active: number; overdue: number; dueToday: number; snoozed: number; unassigned: number };
  } {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
    const startIso = todayStart.toISOString();
    const endIso = todayEnd.toISOString();

    const rows = this.db
      .prepare(
        `SELECT ownerUserId, ownerName, status, dueAt FROM follow_ups
          WHERE companyId = ? AND status IN ('open','snoozed')`,
      )
      .all(companyId) as any[];

    type Bucket = { userId: string | null; name: string; open: number; overdue: number; dueToday: number; snoozed: number; oldestOverdueAt?: Date };
    const buckets = new Map<string, Bucket>();
    const keyFor = (id: string | null) => id ?? '__unassigned__';
    const ensure = (id: string | null, name: string): Bucket => {
      const k = keyFor(id);
      let b = buckets.get(k);
      if (!b) { b = { userId: id, name, open: 0, overdue: 0, dueToday: 0, snoozed: 0 }; buckets.set(k, b); }
      return b;
    };

    // Seed every active member at zero.
    for (const u of this.getUsersByCompany(companyId)) ensure(u.id, u.name);
    ensure(null, 'Unassigned');

    const totals = { active: 0, overdue: 0, dueToday: 0, snoozed: 0, unassigned: 0 };
    for (const r of rows) {
      const b = ensure(r.ownerUserId ?? null, r.ownerName ?? (r.ownerUserId ? r.ownerUserId : 'Unassigned'));
      b.open += 1;
      totals.active += 1;
      if (!r.ownerUserId) totals.unassigned += 1;
      if (r.status === 'snoozed') { b.snoozed += 1; totals.snoozed += 1; continue; }
      if (r.dueAt) {
        if (r.dueAt < startIso) {
          b.overdue += 1; totals.overdue += 1;
          const d = new Date(r.dueAt);
          if (!b.oldestOverdueAt || d < b.oldestOverdueAt) b.oldestOverdueAt = d;
        } else if (r.dueAt < endIso) {
          b.dueToday += 1; totals.dueToday += 1;
        }
      }
    }

    const byUser = Array.from(buckets.values())
      // Hide the Unassigned bucket when empty; keep zero-load members visible.
      .filter((b) => b.userId !== null || b.open > 0)
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open);
    return { byUser, totals };
  }

  /**
   * Open opportunities (stage not Won/Lost/Cancelled) with NO active follow-up
   * attached — deals with no scheduled next step, sorted most-stale first.
   */
  followupCoverageGaps(companyId: string, limit = 50): Array<{
    opportunityId: string;
    title: string;
    stage: string;
    ownerUserId?: string;
    ownerName?: string;
    contactId?: string;
    contactName?: string;
    expectedRevenue: number;
    updatedAt: Date;
  }> {
    const rows = this.db
      .prepare(
        `SELECT o.* FROM opportunities o
          WHERE o.companyId = ?
            AND o.stage NOT IN ('Won','Lost','Cancelled')
            AND NOT EXISTS (
              SELECT 1 FROM follow_ups f
               WHERE f.companyId = o.companyId
                 AND f.entityType = 'opportunity'
                 AND f.entityId = o.id
                 AND f.status IN ('open','snoozed')
            )
          ORDER BY o.updatedAt ASC
          LIMIT ?`,
      )
      .all(companyId, limit) as any[];
    return rows.map((row) => {
      const o = this.decodeOpportunity(row);
      const contact = o.contactId ? this.getContactById(o.contactId) : undefined;
      return {
        opportunityId: o.id,
        title: o.title,
        stage: o.stage,
        ownerUserId: o.ownerUserId,
        ownerName: o.ownerName,
        contactId: o.contactId,
        contactName: contact?.name,
        expectedRevenue: o.expectedRevenue,
        updatedAt: o.updatedAt,
      };
    });
  }

  /**
   * Bulk transfer of follow-up OWNERSHIP for load-balancing (distinct from the
   * per-card "add teammate" invite). Target set is either explicit ids or a
   * source rep's active queue (optionally only overdue). When toUserIds has more
   * than one entry the work is round-robined; otherwise all go to toUserId.
   */
  bulkReassignFollowups(
    companyId: string,
    opts: { ids?: string[]; fromUserId?: string; onlyOverdue?: boolean; toUserId?: string; toUserIds?: string[] },
  ): { reassigned: number; perUser: Record<string, number> } {
    let targets: FollowUp[] = [];
    if (opts.ids && opts.ids.length > 0) {
      targets = opts.ids
        .map((id) => this.getFollowupById(id))
        .filter((f): f is FollowUp => !!f && f.companyId === companyId && (f.status === 'open' || f.status === 'snoozed'));
    } else if (opts.fromUserId) {
      const nowIso = new Date().toISOString();
      let sql = "SELECT id FROM follow_ups WHERE companyId = ? AND ownerUserId = ? AND status IN ('open','snoozed')";
      const params: any[] = [companyId, opts.fromUserId];
      if (opts.onlyOverdue) { sql += ' AND dueAt IS NOT NULL AND dueAt < ?'; params.push(nowIso); }
      const ids = (this.db.prepare(sql).all(...params) as any[]).map((r) => r.id);
      targets = ids.map((id) => this.getFollowupById(id)).filter((f): f is FollowUp => !!f);
    }

    const pool = (opts.toUserIds && opts.toUserIds.length > 0) ? opts.toUserIds : (opts.toUserId ? [opts.toUserId] : []);
    if (pool.length === 0) return { reassigned: 0, perUser: {} };

    const perUser: Record<string, number> = {};
    let i = 0;
    for (const f of targets) {
      const to = pool[i % pool.length];
      i += 1;
      if (f.ownerUserId === to) continue; // already there
      this.reassignFollowup(f.id, to);
      perUser[to] = (perUser[to] ?? 0) + 1;
    }
    // One roll-up notification per receiving rep (not one per item).
    for (const [userId, count] of Object.entries(perUser)) {
      this.notify({
        companyId,
        userIds: [userId],
        type: 'followup_assigned',
        title: count === 1 ? 'A follow-up was assigned to you' : `${count} follow-ups were assigned to you`,
        link: '/crm/followups',
      });
    }
    const reassigned = Object.values(perUser).reduce((a, b) => a + b, 0);
    return { reassigned, perUser };
  }

  getActivityEventById(id: string): ActivityEvent | undefined {
    const row = this.db.prepare('SELECT * FROM activity_events WHERE id = ?').get(id) as any;
    return row ? this.decodeActivityEvent(row) : undefined;
  }

  /**
   * Auto-create a follow-up entry in response to a business event.
   *
   * Idempotency: a follow-up is created at most once per
   * (companyId, contactId, trigger, sourceId) so re-firing the same event
   * (e.g. saving an invoice twice) does NOT produce duplicate reminders.
   *
   * The follow-up shows up in /crm/followups via listFollowups exactly like
   * any manually-created one. Clearing it via "Mark Done" / "Reschedule"
   * works through the same endpoints with no special handling needed.
   *
   * @returns the ActivityEvent created, or undefined if skipped (already
   *          exists, no contact, missing data).
   */
  scheduleAutomaticFollowup(input: {
    companyId: string;
    contactId: string;
    trigger: string;
    sourceType?: string;
    sourceId?: string;
    summary: string;
    nextAction: string;
    offsetDays: number;
    category?: import('../types').ActivityCategory;
  }): FollowUp | undefined {
    if (!input.contactId) return undefined;
    const contact = this.getContactById(input.contactId);
    if (!contact || contact.companyId !== input.companyId) return undefined;

    // Idempotency: one follow-up per (contact, trigger, sourceId). Returns
    // undefined when one already exists so callers can count only NEW ones.
    if (input.sourceId) {
      const existing = this.db
        .prepare(
          `SELECT id FROM follow_ups WHERE companyId = ? AND entityType = 'contact'
             AND entityId = ? AND sourceTrigger = ? AND sourceId = ?`,
        )
        .get(input.companyId, input.contactId, input.trigger, input.sourceId);
      if (existing) return undefined;
    }

    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + Math.max(0, input.offsetDays));
    dueAt.setHours(9, 0, 0, 0); // normalize to 9am local

    const channel: FollowUpChannel | undefined =
      input.category === 'Call' || input.category === 'WhatsApp' || input.category === 'Email' || input.category === 'Meeting'
        ? input.category
        : undefined;

    return this.createFollowup({
      companyId: input.companyId,
      entityType: 'contact',
      entityId: input.contactId,
      title: input.nextAction,
      notes: input.summary,
      channel,
      ownerUserId: contact.ownerUserId,
      ownerName: contact.ownerName,
      dueAt,
      sourceTrigger: input.trigger,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });
  }

  /**
   * Sweep for invoices that have crossed dueDate without being fully paid
   * and create an "InvoiceOverdue" follow-up against each linked contact.
   * Idempotent — won't create a second follow-up for the same invoice.
   */
  sweepOverdueInvoiceFollowups(companyId?: string): number {
    const now = new Date().toISOString();
    const sql = companyId
      ? `SELECT * FROM invoices WHERE companyId = ? AND status != 'Paid' AND status != 'Draft' AND dueDate < ?`
      : `SELECT * FROM invoices WHERE status != 'Paid' AND status != 'Draft' AND dueDate < ?`;
    const rows = (companyId
      ? this.db.prepare(sql).all(companyId, now)
      : this.db.prepare(sql).all(now)) as any[];
    let created = 0;
    for (const row of rows) {
      const invoice = this.decodeInvoice(row);
      if (!invoice.contactId && !invoice.clientId) continue;
      const contactId =
        invoice.contactId || this.contactIdForClient(invoice.clientId, invoice.companyId);
      if (!contactId) continue;
      const result = this.scheduleAutomaticFollowup({
        companyId: invoice.companyId,
        contactId,
        trigger: 'InvoiceOverdue',
        sourceType: 'invoice',
        sourceId: invoice.id,
        summary: `Invoice ${invoice.invoiceNumber} is overdue.`,
        nextAction: `Chase payment for ${invoice.invoiceNumber}.`,
        offsetDays: 0,
        category: 'Follow-up',
      });
      if (result) created += 1;
    }
    return created;
  }

  private contactIdForClient(clientId: string, companyId: string): string | undefined {
    if (!clientId) return undefined;
    const row = this.db
      .prepare('SELECT id FROM contacts WHERE companyId = ? AND clientId = ? LIMIT 1')
      .get(companyId, clientId) as { id?: string } | undefined;
    return row?.id;
  }

  /**
   * Clears or reschedules the follow-up portion of an activity event.
   * Passing nextActionDueDate=null removes the follow-up from the queue
   * without deleting the activity log entry itself.
   */
  updateActivityFollowup(
    activityId: string,
    updates: { nextActionDueDate?: Date | null; nextAction?: string | null },
  ): ActivityEvent | undefined {
    const existing = this.db
      .prepare('SELECT * FROM activity_events WHERE id = ?')
      .get(activityId) as any;
    if (!existing) return undefined;
    const nextActionDueDate =
      updates.nextActionDueDate === undefined
        ? existing.nextActionDueDate
        : updates.nextActionDueDate === null
          ? null
          : updates.nextActionDueDate.toISOString();
    const nextAction =
      updates.nextAction === undefined
        ? existing.nextAction
        : updates.nextAction === null
          ? null
          : updates.nextAction;
    this.db
      .prepare(
        'UPDATE activity_events SET nextActionDueDate = ?, nextAction = ? WHERE id = ?',
      )
      .run(nextActionDueDate, nextAction, activityId);
    const row = this.db
      .prepare('SELECT * FROM activity_events WHERE id = ?')
      .get(activityId) as any;
    return row ? this.decodeActivityEvent(row) : undefined;
  }

  private decodeInventoryItem(row: any): InventoryItem {
    return {
      id: row.id,
      companyId: row.companyId,
      sku: row.sku,
      barcode: row.barcode ?? undefined,
      name: row.name,
      category: row.category,
      unit: row.unit,
      vatApplicable: row.vatApplicable === null || row.vatApplicable === undefined ? true : Boolean(row.vatApplicable),
      tracksInventory: row.tracksInventory === null || row.tracksInventory === undefined ? true : Boolean(row.tracksInventory),
      onHand: Number(row.onHand) || 0,
      reorderPoint: Number(row.reorderPoint) || 0,
      unitCost: Number(row.unitCost) || 0,
      salePrice: row.salePrice === null || row.salePrice === undefined ? undefined : Number(row.salePrice),
      preferredVendor: row.preferredVendor ?? undefined,
      preferredSupplierId: row.preferredSupplierId ?? undefined,
      location: row.location ?? undefined,
      customFields: row.customFields ? this.parseJson<Record<string, unknown>>(row.customFields) ?? undefined : undefined,
    };
  }

  private decodeSupplier(row: any): Supplier {
    return {
      id: row.id,
      companyId: row.companyId,
      reference: row.reference,
      name: row.name,
      contactName: row.contactName ?? undefined,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      paymentTermsDays:
        row.paymentTermsDays === null || row.paymentTermsDays === undefined
          ? undefined
          : Number(row.paymentTermsDays),
      notes: row.notes ?? undefined,
      isActive: Boolean(row.isActive),
    };
  }

  private decodeClient(row: any): Client {
    return {
      id: row.id,
      reference: row.reference,
      name: row.name,
      email: row.email,
      address: row.address,
      companyId: row.companyId,
      contactName: row.contactName ?? undefined,
      phone: row.phone ?? undefined,
      vatNumber: row.vatNumber ?? undefined,
      creditLimit:
        row.creditLimit === null || row.creditLimit === undefined
          ? undefined
          : Number(row.creditLimit),
      creditNumber: row.creditNumber ?? undefined,
      paymentMethod: row.paymentMethod ?? undefined,
      status: row.status ?? 'Active',
      notes: row.notes ?? undefined,
    };
  }

  private decodeInventoryLocationBalance(row: any): InventoryLocationBalance {
    return {
      companyId: row.companyId,
      inventoryItemId: row.inventoryItemId,
      location: row.location,
      quantity: Number(row.quantity) || 0,
    };
  }

  private decodePurchaseOrder(row: any): PurchaseOrder {
    return {
      id: row.id,
      companyId: row.companyId,
      orderNumber: row.orderNumber,
      supplierName: row.supplierName,
      supplierId: row.supplierId ?? undefined,
      contactId: row.contactId ?? undefined,
      orderDate: new Date(row.orderDate),
      expectedDate: row.expectedDate ? new Date(row.expectedDate) : undefined,
      status: row.status as PurchaseOrderStatus,
      items: this.normalizePurchaseOrderItems(this.parseJson(row.items) || []),
      totalAmount: Number(row.totalAmount) || 0,
      notes: row.notes ?? undefined,
      receivedAt: row.receivedAt ? new Date(row.receivedAt) : undefined,
      approvalStatus: (row.approvalStatus as PurchaseOrder['approvalStatus']) ?? 'not_required',
      approvedBy: row.approvedBy ?? undefined,
      approvedAt: row.approvedAt ? new Date(row.approvedAt) : undefined,
      rejectionReason: row.rejectionReason ?? undefined,
    };
  }

  private decodeSalesOrder(row: any): SalesOrder {
    const items = this.normalizeSalesOrderItems(this.parseJson(row.items) || []);
    const deliveredByLine = this.getDeliveredQuantityByLine(row.id);
    const deliveredQuantityByLine = items.map((_, idx) => Number((deliveredByLine.get(idx) || 0).toFixed(4)));
    const totalOrdered = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalDelivered = deliveredQuantityByLine.reduce((sum, qty) => sum + qty, 0);
    let fulfillmentStatus: SalesOrderFulfillmentStatus = 'Unfulfilled';
    if (totalOrdered > 0 && totalDelivered >= totalOrdered - 0.0001) {
      fulfillmentStatus = 'Fulfilled';
    } else if (totalDelivered > 0.0001) {
      fulfillmentStatus = 'Partially Fulfilled';
    }
    return {
      id: row.id,
      companyId: row.companyId,
      orderNumber: row.orderNumber,
      clientId: row.clientId,
      contactId: row.contactId ?? undefined,
      orderDate: new Date(row.orderDate),
      expectedDate: row.expectedDate ? new Date(row.expectedDate) : undefined,
      status: row.status as SalesOrderStatus,
      items,
      totalAmount: Number(row.totalAmount) || 0,
      notes: row.notes ?? undefined,
      invoiceId: row.invoiceId ?? undefined,
      fulfillmentStatus,
      deliveredQuantityByLine,
    };
  }

  private decodeDelivery(row: any): Delivery {
    const parsedItems = this.parseJson<any[]>(row.items);
    const items: DeliveryLineItem[] = (Array.isArray(parsedItems) ? parsedItems : []).map((item: any) => ({
      salesOrderLineIndex: Number(item.salesOrderLineIndex) || 0,
      inventoryItemId: item.inventoryItemId ?? undefined,
      sku: item.sku ?? undefined,
      description: String(item.description || ''),
      quantity: Number(item.quantity) || 0,
      location: item.location ?? undefined,
    }));
    return {
      id: row.id,
      companyId: row.companyId,
      deliveryNumber: row.deliveryNumber,
      salesOrderId: row.salesOrderId,
      status: row.status as DeliveryStatus,
      items,
      carrier: row.carrier ?? undefined,
      trackingNumber: row.trackingNumber ?? undefined,
      notes: row.notes ?? undefined,
      scheduledFor: row.scheduledFor ? new Date(row.scheduledFor) : undefined,
      dispatchedAt: row.dispatchedAt ? new Date(row.dispatchedAt) : undefined,
      deliveredAt: row.deliveredAt ? new Date(row.deliveredAt) : undefined,
      cancelledAt: row.cancelledAt ? new Date(row.cancelledAt) : undefined,
      createdAt: new Date(row.createdAt),
    };
  }

  private getDeliveredQuantityByLine(salesOrderId: string): Map<number, number> {
    const rows = this.db
      .prepare(`SELECT items, status FROM deliveries WHERE salesOrderId = ?`)
      .all(salesOrderId) as Array<{ items: string; status: string }>;
    const map = new Map<number, number>();
    rows.forEach((row) => {
      if (row.status === 'Cancelled' || row.status === 'Pending') return;
      const items = this.parseJson<any[]>(row.items) || [];
      items.forEach((item: any) => {
        const idx = Number(item.salesOrderLineIndex) || 0;
        const qty = Number(item.quantity) || 0;
        map.set(idx, Number(((map.get(idx) || 0) + qty).toFixed(4)));
      });
    });
    return map;
  }

  private decodePurchaseReceipt(row: any): PurchaseReceipt {
    const parsedItems = this.parseJson<any[]>(row.items);
    return {
      id: row.id,
      companyId: row.companyId,
      purchaseOrderId: row.purchaseOrderId,
      receivedAt: new Date(row.receivedAt),
      notes: row.notes ?? undefined,
      items: (Array.isArray(parsedItems) ? parsedItems : []).map((item: any) => ({
        lineIndex: Number(item.lineIndex) || 0,
        inventoryItemId: item.inventoryItemId ?? undefined,
        sku: item.sku ?? undefined,
        description: String(item.description || ''),
        quantity: Number(item.quantity) || 0,
        unitCost: Number(item.unitCost) || 0,
        lotNumber: item.lotNumber ?? undefined,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
        manufactureDate: item.manufactureDate ? new Date(item.manufactureDate) : undefined,
      })),
    };
  }

  private decodeStockMovement(row: any): StockMovement {
    return {
      id: row.id,
      companyId: row.companyId,
      inventoryItemId: row.inventoryItemId,
      movementType: row.movementType as StockMovementType,
      quantityChange: Number(row.quantityChange) || 0,
      unitCost:
        row.unitCost === null || row.unitCost === undefined ? undefined : Number(row.unitCost),
      referenceType: row.referenceType ?? undefined,
      referenceId: row.referenceId ?? undefined,
      lotId: row.lotId ?? undefined,
      note: row.note ?? undefined,
      createdAt: new Date(row.createdAt),
    };
  }

  createStockMovement(input: CreateStockMovementInput): StockMovement {
    const movement: StockMovement = {
      ...input,
      id: uuid(),
      quantityChange: Number(input.quantityChange || 0),
      unitCost:
        input.unitCost === undefined || input.unitCost === null
          ? undefined
          : Number(input.unitCost),
      createdAt: input.createdAt ? new Date(input.createdAt) : new Date(),
    };

    this.db
      .prepare(
        'INSERT INTO stock_movements (id, companyId, inventoryItemId, movementType, quantityChange, unitCost, referenceType, referenceId, lotId, note, createdAt) VALUES (@id, @companyId, @inventoryItemId, @movementType, @quantityChange, @unitCost, @referenceType, @referenceId, @lotId, @note, @createdAt)',
      )
      .run({
        ...movement,
        unitCost: movement.unitCost ?? null,
        referenceType: movement.referenceType ?? null,
        referenceId: movement.referenceId ?? null,
        lotId: movement.lotId ?? null,
        note: movement.note ?? null,
        createdAt: movement.createdAt.toISOString(),
      });

    return movement;
  }

  // ── Inventory lots / batch & expiry tracking ──────────────────────────────

  listInventoryLots(companyId: string, inventoryItemId?: string): InventoryLot[] {
    const rows = inventoryItemId
      ? (this.db
          .prepare(
            "SELECT * FROM inventory_lots WHERE companyId = ? AND inventoryItemId = ? ORDER BY (expiryDate IS NULL), expiryDate ASC, receivedAt ASC",
          )
          .all(companyId, inventoryItemId) as any[])
      : (this.db
          .prepare(
            "SELECT * FROM inventory_lots WHERE companyId = ? ORDER BY (expiryDate IS NULL), expiryDate ASC, receivedAt ASC",
          )
          .all(companyId) as any[]);
    return rows.map((row) => this.decodeInventoryLot(row));
  }

  getInventoryLotById(id: string): InventoryLot | undefined {
    const row = this.db.prepare('SELECT * FROM inventory_lots WHERE id = ?').get(id) as any;
    return row ? this.decodeInventoryLot(row) : undefined;
  }

  /** Lots expiring on or before `withinDays` from now (active, with stock left). */
  listExpiringLots(companyId: string, withinDays = 30): InventoryLot[] {
    const horizon = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000).toISOString();
    const rows = this.db
      .prepare(
        "SELECT * FROM inventory_lots WHERE companyId = ? AND status = 'Active' AND quantity > 0 AND expiryDate IS NOT NULL AND expiryDate <= ? ORDER BY expiryDate ASC",
      )
      .all(companyId, horizon) as any[];
    return rows.map((row) => this.decodeInventoryLot(row));
  }

  /** Receive a batch/lot: records the lot and an inbound stock movement. */
  createInventoryLot(input: CreateInventoryLotInput): InventoryLot {
    const item = this.getInventoryItemById(input.inventoryItemId);
    if (!item || item.companyId !== input.companyId) {
      throw new Error('Inventory item does not belong to this company.');
    }
    const lotNumber = (input.lotNumber || '').trim();
    if (!lotNumber) throw new Error('Lot number is required.');
    const quantity = Number(input.quantity || 0);
    if (!(quantity > 0)) throw new Error('Lot quantity must be greater than zero.');

    const location = this.normalizeInventoryLocation(input.location || item.location);
    const unitCost = input.unitCost === undefined ? item.unitCost : Number(input.unitCost || 0);
    const nowIso = new Date().toISOString();
    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
    const lot: InventoryLot = {
      id: uuid(),
      companyId: input.companyId,
      inventoryItemId: input.inventoryItemId,
      lotNumber,
      location,
      quantity,
      initialQuantity: quantity,
      unitCost,
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
      manufactureDate: input.manufactureDate ? new Date(input.manufactureDate) : undefined,
      supplierId: input.supplierId,
      receivedAt,
      status: 'Active',
      note: input.note,
      createdAt: new Date(nowIso),
      updatedAt: new Date(nowIso),
    };

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO inventory_lots (id, companyId, inventoryItemId, lotNumber, location, quantity, initialQuantity, unitCost, expiryDate, manufactureDate, supplierId, receivedAt, status, note, createdAt, updatedAt) VALUES (@id, @companyId, @inventoryItemId, @lotNumber, @location, @quantity, @initialQuantity, @unitCost, @expiryDate, @manufactureDate, @supplierId, @receivedAt, @status, @note, @createdAt, @updatedAt)',
        )
        .run({
          ...lot,
          expiryDate: lot.expiryDate ? lot.expiryDate.toISOString() : null,
          manufactureDate: lot.manufactureDate ? lot.manufactureDate.toISOString() : null,
          supplierId: lot.supplierId ?? null,
          note: lot.note ?? null,
          receivedAt: lot.receivedAt.toISOString(),
          createdAt: nowIso,
          updatedAt: nowIso,
        });

      this.db
        .prepare('UPDATE inventory_items SET onHand = onHand + ? WHERE id = ? AND companyId = ?')
        .run(quantity, item.id, input.companyId);
      this.incrementLocationBalance(input.companyId, item.id, location, quantity);
      this.createStockMovement({
        companyId: input.companyId,
        inventoryItemId: item.id,
        movementType: 'Receipt',
        quantityChange: quantity,
        unitCost,
        referenceType: 'inventory_lot',
        referenceId: lot.id,
        lotId: lot.id,
        note: `Lot ${lotNumber} received at ${location}`,
      });
    });
    tx();

    this.createActivityEvent({
      companyId: input.companyId,
      entityType: 'inventory_item',
      entityId: item.id,
      action: 'lot_received',
      summary: `Lot ${lotNumber} (${quantity} ${item.unit}) received for ${item.name}.`,
      metadata: { lotId: lot.id, expiryDate: lot.expiryDate?.toISOString() ?? null, location },
    });

    return lot;
  }

  /**
   * Consume `quantity` of an item using FEFO (first-expiry-first-out): the lots
   * with the earliest expiry are drawn down first. Records one Issue stock
   * movement per lot touched and returns the resulting allocation.
   */
  consumeInventoryLotsFEFO(
    companyId: string,
    inventoryItemId: string,
    quantity: number,
    options: { location?: string; note?: string } = {},
  ): Array<{ lotId: string; lotNumber: string; quantity: number }> {
    const item = this.getInventoryItemById(inventoryItemId);
    if (!item || item.companyId !== companyId) {
      throw new Error('Inventory item does not belong to this company.');
    }
    const needed = Number(quantity || 0);
    if (!(needed > 0)) throw new Error('Quantity to consume must be greater than zero.');

    const location = options.location
      ? this.normalizeInventoryLocation(options.location)
      : undefined;
    const lots = this.db
      .prepare(
        `SELECT * FROM inventory_lots WHERE companyId = ? AND inventoryItemId = ? AND status = 'Active' AND quantity > 0 ${
          location ? 'AND location = ?' : ''
        } ORDER BY (expiryDate IS NULL), expiryDate ASC, receivedAt ASC`,
      )
      .all(...(location ? [companyId, inventoryItemId, location] : [companyId, inventoryItemId])) as any[];

    const available = lots.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
    if (available + 0.0001 < needed) {
      throw new Error(
        `Insufficient lot stock for ${item.name}: need ${needed}, only ${available} available${
          location ? ` in ${location}` : ''
        }.`,
      );
    }

    const allocation: Array<{ lotId: string; lotNumber: string; quantity: number }> = [];
    const nowIso = new Date().toISOString();
    const tx = this.db.transaction(() => {
      let remaining = needed;
      for (const row of lots) {
        if (remaining <= 0.0001) break;
        const lotQty = Number(row.quantity) || 0;
        const take = Math.min(lotQty, remaining);
        if (take <= 0) continue;
        const newQty = Number((lotQty - take).toFixed(4));
        const newStatus: InventoryLotStatus = newQty <= 0.0001 ? 'Depleted' : 'Active';
        this.db
          .prepare('UPDATE inventory_lots SET quantity = ?, status = ?, updatedAt = ? WHERE id = ?')
          .run(newQty, newStatus, nowIso, row.id);
        this.db
          .prepare('UPDATE inventory_items SET onHand = onHand - ? WHERE id = ? AND companyId = ?')
          .run(take, item.id, companyId);
        this.incrementLocationBalance(companyId, item.id, row.location, -take);
        this.createStockMovement({
          companyId,
          inventoryItemId: item.id,
          movementType: 'Issue',
          quantityChange: -take,
          unitCost: Number(row.unitCost) || item.unitCost,
          referenceType: 'inventory_lot',
          referenceId: row.id,
          lotId: row.id,
          note: options.note
            ? `${options.note} (lot ${row.lotNumber})`
            : `FEFO consume from lot ${row.lotNumber}`,
        });
        allocation.push({ lotId: row.id, lotNumber: row.lotNumber, quantity: take });
        remaining = Number((remaining - take).toFixed(4));
      }
    });
    tx();

    this.createActivityEvent({
      companyId,
      entityType: 'inventory_item',
      entityId: item.id,
      action: 'lot_consumed',
      summary: `Consumed ${needed} ${item.unit} of ${item.name} via FEFO.`,
      metadata: { allocation, note: options.note ?? null },
    });

    return allocation;
  }

  /**
   * Decrement active lots FEFO for `quantity` at `location` — best-effort and
   * side-effect-free (no onHand change, no stock movement). Used to keep lot
   * balances reconciled when stock leaves through the regular issue flow.
   * Consumes only what lots can cover (an item may hold untracked on-hand that
   * predates lot tracking), so it never throws.
   */
  private drawDownLotsFEFO(
    companyId: string,
    inventoryItemId: string,
    quantity: number,
    location: string,
  ): Array<{ lotId: string; lotNumber: string; quantity: number }> {
    const lots = this.db
      .prepare(
        "SELECT * FROM inventory_lots WHERE companyId = ? AND inventoryItemId = ? AND status = 'Active' AND quantity > 0 AND location = ? ORDER BY (expiryDate IS NULL), expiryDate ASC, receivedAt ASC",
      )
      .all(companyId, inventoryItemId, location) as any[];
    const allocation: Array<{ lotId: string; lotNumber: string; quantity: number }> = [];
    const nowIso = new Date().toISOString();
    let remaining = Number(quantity || 0);
    for (const row of lots) {
      if (remaining <= 0.0001) break;
      const lotQty = Number(row.quantity) || 0;
      const take = Math.min(lotQty, remaining);
      if (take <= 0) continue;
      const newQty = Number((lotQty - take).toFixed(4));
      const newStatus: InventoryLotStatus = newQty <= 0.0001 ? 'Depleted' : 'Active';
      this.db
        .prepare('UPDATE inventory_lots SET quantity = ?, status = ?, updatedAt = ? WHERE id = ?')
        .run(newQty, newStatus, nowIso, row.id);
      allocation.push({ lotId: row.id, lotNumber: row.lotNumber, quantity: take });
      remaining = Number((remaining - take).toFixed(4));
    }
    return allocation;
  }

  /** Notify Admins/Managers about lots expiring within 30 days (once/day). */
  sweepExpiryNotifications(): number {
    const companies = this.db.prepare('SELECT id FROM companies').all() as Array<{ id: string }>;
    let count = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const { id: companyId } of companies) {
      const lots = this.listExpiringLots(companyId, 30);
      if (lots.length === 0) continue;
      const recipients = this.listUserIdsByCompanyRoles(companyId, ['Admin', 'Manager']);
      if (recipients.length === 0) continue;
      for (const lot of lots) {
        const item = this.getInventoryItemById(lot.inventoryItemId);
        if (!item) continue;
        const expiry = lot.expiryDate!;
        const days = Math.ceil((expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
        const expired = days < 0;
        count += this.notify({
          companyId,
          userIds: recipients,
          type: 'expiry_warning',
          title: `${expired ? 'Expired' : 'Expiring soon'}: ${item.name} (lot ${lot.lotNumber})`,
          body: `${lot.quantity} ${item.unit} ${
            expired ? `expired ${Math.abs(days)} day(s) ago` : `expire in ${days} day(s)`
          } on ${expiry.toISOString().slice(0, 10)}.`,
          link: '/inventory',
          entityType: 'inventory_lot',
          entityId: lot.id,
          dedupeWithinMs: 20 * 60 * 60 * 1000,
        }).length;
      }
    }
    return count;
  }

  private decodeInventoryLot(row: any): InventoryLot {
    return {
      id: row.id,
      companyId: row.companyId,
      inventoryItemId: row.inventoryItemId,
      lotNumber: row.lotNumber,
      location: row.location,
      quantity: Number(row.quantity) || 0,
      initialQuantity: Number(row.initialQuantity) || 0,
      unitCost: Number(row.unitCost) || 0,
      expiryDate: row.expiryDate ? new Date(row.expiryDate) : undefined,
      manufactureDate: row.manufactureDate ? new Date(row.manufactureDate) : undefined,
      supplierId: row.supplierId ?? undefined,
      receivedAt: new Date(row.receivedAt),
      status: row.status as InventoryLotStatus,
      note: row.note ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  private decodeVendorBill(row: any): VendorBill {
    const paidAmount = this.getVendorBillPaidAmount(row.id);
    const amount = Number(row.amount) || 0;
    return {
      id: row.id,
      companyId: row.companyId,
      vendorName: row.vendorName,
      supplierId: row.supplierId ?? undefined,
      purchaseOrderId: row.purchaseOrderId ?? undefined,
      campaignId: row.campaignId ?? undefined,
      billNumber: row.billNumber,
      referenceInvoiceNumber: row.referenceInvoiceNumber ?? undefined,
      issueDate: new Date(row.issueDate),
      dueDate: new Date(row.dueDate),
      amount,
      status: row.status as VendorBillStatus,
      notes: row.notes ?? undefined,
      expenseAccountId: row.expenseAccountId ?? undefined,
      paidAt: row.paidAt ? new Date(row.paidAt) : undefined,
      paidAmount,
      outstandingAmount: Number(Math.max(0, amount - paidAmount).toFixed(2)),
    };
  }

  private getLinkedVendorBillAmount(purchaseOrderId: string): number {
    const row = this.db
      .prepare(
        'SELECT COALESCE(SUM(amount), 0) as amount FROM vendor_bills WHERE purchaseOrderId = ?',
      )
      .get(purchaseOrderId) as { amount: number };
    return Number(row.amount || 0);
  }

  private getVendorBillPaidAmount(billId: string): number {
    const row = this.db
      .prepare(
        'SELECT COALESCE(SUM(amount), 0) as amount FROM vendor_bill_payments WHERE billId = ?',
      )
      .get(billId) as { amount: number };
    return Number(row.amount || 0);
  }

  private decodeVendorBillPayment(row: any): VendorBillPayment {
    return {
      id: row.id,
      billId: row.billId,
      amount: Number(row.amount) || 0,
      method: row.method ?? undefined,
      note: row.note ?? undefined,
      paidAt: new Date(row.paidAt),
    };
  }

	  private decodeActivityEvent(row: any): ActivityEvent {
    return {
      id: row.id,
      companyId: row.companyId,
      actorUserId: row.actorUserId ?? undefined,
      actorName: row.actorName ?? undefined,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      summary: row.summary,
      metadata: this.parseJson<Record<string, unknown>>(row.metadata) ?? undefined,
      category: row.category ?? undefined,
      outcome: row.outcome ?? undefined,
      nextAction: row.nextAction ?? undefined,
      nextActionDueDate: row.nextActionDueDate ? new Date(row.nextActionDueDate) : undefined,
      durationMinutes: row.durationMinutes != null ? Number(row.durationMinutes) : undefined,
	      createdAt: new Date(row.createdAt),
	    };
	  }

		  private decodeOpportunity(row: any): Opportunity {
		    return {
	      id: row.id,
	      companyId: row.companyId,
	      contactId: row.contactId,
	      ownerUserId: row.ownerUserId ?? undefined,
	      ownerName: row.ownerName ?? undefined,
	      title: row.title,
	      serviceType: row.serviceType,
	      stage: row.stage as OpportunityStage,
	      expectedRevenue: Number(row.expectedRevenue || 0),
	      probability: Number(row.probability || 0),
	      expectedCloseDate: row.expectedCloseDate ? new Date(row.expectedCloseDate) : undefined,
	      notes: row.notes ?? undefined,
	      wonSalesOrderId: row.wonSalesOrderId ?? undefined,
	      closedAt: row.closedAt ? new Date(row.closedAt) : undefined,
	      createdAt: new Date(row.createdAt),
	      updatedAt: new Date(row.updatedAt),
		    };
		  }

		  private decodeCrmProposal(row: any): CrmProposal {
		    return {
		      id: row.id,
		      companyId: row.companyId,
		      opportunityId: row.opportunityId,
		      contactId: row.contactId,
		      proposalNumber: row.proposalNumber,
		      title: row.title,
		      status: row.status as ProposalStatus,
		      issueDate: new Date(row.issueDate),
		      validUntil: row.validUntil ? new Date(row.validUntil) : undefined,
		      items: this.parseJson<ProposalLineItem[]>(row.items) || [],
		      totalAmount: Number(row.totalAmount || 0),
		      notes: row.notes ?? undefined,
		      acceptedAt: row.acceptedAt ? new Date(row.acceptedAt) : undefined,
		      declinedAt: row.declinedAt ? new Date(row.declinedAt) : undefined,
		      createdAt: new Date(row.createdAt),
		      updatedAt: new Date(row.updatedAt),
		    };
		  }

		  private serializeCrmCampaign(campaign: CrmCampaign) {
		    return {
		      ...campaign,
		      proposalId: campaign.proposalId ?? null,
		      opportunityId: campaign.opportunityId ?? null,
		      projectId: campaign.projectId ?? null,
		      startDate: campaign.startDate ? campaign.startDate.toISOString() : null,
		      endDate: campaign.endDate ? campaign.endDate.toISOString() : null,
		      budget: campaign.budget ?? null,
		      ownerUserId: campaign.ownerUserId ?? null,
		      ownerName: campaign.ownerName ?? null,
		      notes: campaign.notes ?? null,
		      archivedAt: campaign.archivedAt ? campaign.archivedAt.toISOString() : null,
		      invoiceId: campaign.invoiceId ?? null,
		      createdAt: campaign.createdAt.toISOString(),
		      updatedAt: campaign.updatedAt.toISOString(),
		    };
		  }

		  private decodeCrmCampaign(row: any): CrmCampaign {
		    return {
		      id: row.id,
		      companyId: row.companyId,
		      proposalId: row.proposalId ?? undefined,
		      opportunityId: row.opportunityId ?? undefined,
		      contactId: row.contactId,
		      projectId: row.projectId ?? undefined,
		      name: row.name,
		      status: row.status as CampaignStatus,
		      startDate: row.startDate ? new Date(row.startDate) : undefined,
		      endDate: row.endDate ? new Date(row.endDate) : undefined,
		      budget: row.budget === null || row.budget === undefined ? undefined : Number(row.budget),
		      ownerUserId: row.ownerUserId ?? undefined,
		      ownerName: row.ownerName ?? undefined,
		      visibility: row.visibility as ProjectVisibility,
		      notes: row.notes ?? undefined,
		      archivedAt: row.archivedAt ? new Date(row.archivedAt) : undefined,
		      invoiceId: row.invoiceId ?? undefined,
		      createdAt: new Date(row.createdAt),
		      updatedAt: new Date(row.updatedAt),
		    };
		  }

		  private serializeCampaignDeliverable(deliverable: CampaignDeliverable) {
		    return {
		      ...deliverable,
		      contactId: deliverable.contactId ?? null,
		      vendorContactId: deliverable.vendorContactId ?? null,
		      assignedUserId: deliverable.assignedUserId ?? null,
		      assignedUserName: deliverable.assignedUserName ?? null,
		      platform: deliverable.platform ?? null,
		      dueDate: deliverable.dueDate ? deliverable.dueDate.toISOString() : null,
		      contentUrl: deliverable.contentUrl ?? null,
		      price: deliverable.price ?? null,
		      cost: deliverable.cost ?? null,
		      fulfillment: deliverable.fulfillment ?? 'Internal',
		      vendorBillId: deliverable.vendorBillId ?? null,
		      publishedAt: deliverable.publishedAt ? deliverable.publishedAt.toISOString() : null,
		      notes: deliverable.notes ?? null,
		      createdAt: deliverable.createdAt.toISOString(),
		      updatedAt: deliverable.updatedAt.toISOString(),
		    };
		  }

		  private decodeCampaignDeliverable(row: any): CampaignDeliverable {
		    return {
		      id: row.id,
		      companyId: row.companyId,
		      campaignId: row.campaignId,
		      contactId: row.contactId ?? undefined,
		      vendorContactId: row.vendorContactId ?? undefined,
		      assignedUserId: row.assignedUserId ?? undefined,
		      assignedUserName: row.assignedUserName ?? undefined,
		      title: row.title,
		      platform: row.platform ?? undefined,
		      dueDate: row.dueDate ? new Date(row.dueDate) : undefined,
		      status: row.status as CampaignDeliverableStatus,
		      contentUrl: row.contentUrl ?? undefined,
		      price: row.price === null || row.price === undefined ? undefined : Number(row.price),
		      cost: row.cost === null || row.cost === undefined ? undefined : Number(row.cost),
		      fulfillment: (row.fulfillment as CampaignFulfillment) ?? 'Internal',
		      vendorBillId: row.vendorBillId ?? undefined,
		      publishedAt: row.publishedAt ? new Date(row.publishedAt) : undefined,
		      notes: row.notes ?? undefined,
		      createdAt: new Date(row.createdAt),
		      updatedAt: new Date(row.updatedAt),
		    };
		  }

		  private serializeCampaignAssignment(assignment: CampaignAssignment) {
		    return {
		      ...assignment,
		      agreedRate: assignment.agreedRate ?? null,
		      notes: assignment.notes ?? null,
		      createdAt: assignment.createdAt.toISOString(),
		      updatedAt: assignment.updatedAt.toISOString(),
		    };
		  }

		  private decodeCampaignAssignment(row: any): CampaignAssignment {
		    return {
		      id: row.id,
		      companyId: row.companyId,
		      campaignId: row.campaignId,
		      contactId: row.contactId,
		      role: row.role as ContactRoleType,
		      agreedRate: row.agreedRate === null || row.agreedRate === undefined ? undefined : Number(row.agreedRate),
		      status: row.status as CampaignAssignmentStatus,
		      notes: row.notes ?? undefined,
		      createdAt: new Date(row.createdAt),
		      updatedAt: new Date(row.updatedAt),
		    };
		  }

		  private serializeCampaignExpense(expense: CampaignExpense) {
		    return {
		      ...expense,
		      contactId: expense.contactId ?? null,
		      vendorRequestId: expense.vendorRequestId ?? null,
		      amount: Number(expense.amount || 0),
		      expenseDate: expense.expenseDate ? expense.expenseDate.toISOString() : null,
		      billable: expense.billable ? 1 : 0,
		      notes: expense.notes ?? null,
		      createdAt: expense.createdAt.toISOString(),
		      updatedAt: expense.updatedAt.toISOString(),
		    };
		  }

		  private decodeCampaignExpense(row: any): CampaignExpense {
		    return {
		      id: row.id,
		      companyId: row.companyId,
		      campaignId: row.campaignId,
		      contactId: row.contactId ?? undefined,
		      vendorRequestId: row.vendorRequestId ?? undefined,
		      description: row.description,
		      amount: Number(row.amount || 0),
		      expenseDate: row.expenseDate ? new Date(row.expenseDate) : undefined,
		      status: row.status as CampaignExpenseStatus,
		      billable: Boolean(row.billable),
		      notes: row.notes ?? undefined,
		      createdAt: new Date(row.createdAt),
		      updatedAt: new Date(row.updatedAt),
		    };
		  }

		  private decodeVendorRequest(row: any): VendorRequest {
	    return {
	      id: row.id,
	      companyId: row.companyId,
	      contactId: row.contactId ?? undefined,
	      requestedByUserId: row.requestedByUserId ?? undefined,
		      requestedByName: row.requestedByName ?? undefined,
		      name: row.name,
		      role: row.role as ContactRoleType,
		      requestType: row.requestType ?? undefined,
		      platform: row.platform ?? undefined,
		      handle: row.handle ?? undefined,
		      details: row.details ?? undefined,
		      dueDate: row.dueDate ? new Date(row.dueDate) : undefined,
		      cost: row.cost === null || row.cost === undefined ? undefined : Number(row.cost),
		      status: row.status as VendorRequestStatus,
	      notes: row.notes ?? undefined,
	      reviewedByUserId: row.reviewedByUserId ?? undefined,
	      reviewedByName: row.reviewedByName ?? undefined,
	      reviewedAt: row.reviewedAt ? new Date(row.reviewedAt) : undefined,
	      createdAt: new Date(row.createdAt),
	      updatedAt: new Date(row.updatedAt),
	    };
	  }

	  private decodeCommissionRule(row: any): CommissionRule {
	    return {
	      id: row.id,
	      companyId: row.companyId,
	      userId: row.userId ?? undefined,
	      role: row.role ?? undefined,
	      serviceType: row.serviceType || undefined,
	      basis: row.basis as CommissionBasis,
	      rateType: row.rateType as CommissionRateType,
	      rate: Number(row.rate || 0),
	      fixedAmount: row.fixedAmount === null || row.fixedAmount === undefined ? undefined : Number(row.fixedAmount),
	      priority: Number(row.priority || 0),
	      isActive: Boolean(row.isActive),
	      notes: row.notes ?? undefined,
	      createdAt: new Date(row.createdAt),
	      updatedAt: new Date(row.updatedAt),
	    };
	  }

	  private decodeCommission(row: any): Commission {
	    return {
	      id: row.id,
	      companyId: row.companyId,
	      opportunityId: row.opportunityId ?? undefined,
	      contactId: row.contactId ?? undefined,
	      userId: row.userId ?? undefined,
	      userName: row.userName ?? undefined,
	      contributionId: row.contributionId ?? undefined,
	      sourceType: row.sourceType ?? undefined,
	      sourceId: row.sourceId ?? undefined,
	      sourceLabel: row.sourceLabel ?? undefined,
	      invoiceId: row.invoiceId ?? undefined,
	      role: row.role ?? undefined,
	      ruleId: row.ruleId ?? undefined,
	      serviceType: row.serviceType,
	      basis: row.basis as CommissionBasis,
	      basisAmount: Number(row.basisAmount || 0),
	      weightPercent:
	        row.weightPercent === null || row.weightPercent === undefined
	          ? undefined
	          : Number(row.weightPercent),
	      ratePercent:
	        row.ratePercent === null || row.ratePercent === undefined
	          ? undefined
	          : Number(row.ratePercent),
	      fixedAmount:
	        row.fixedAmount === null || row.fixedAmount === undefined
	          ? undefined
	          : Number(row.fixedAmount),
	      amount: Number(row.amount || 0),
	      status: row.status as CommissionStatus,
	      calculatedAt: new Date(row.calculatedAt),
	      approvedAt: row.approvedAt ? new Date(row.approvedAt) : undefined,
	      paidAt: row.paidAt ? new Date(row.paidAt) : undefined,
	      voidedAt: row.voidedAt ? new Date(row.voidedAt) : undefined,
	      approvedByUserId: row.approvedByUserId ?? undefined,
	      paidByUserId: row.paidByUserId ?? undefined,
	    };
	  }

	  private decodeRecordAttachment(row: any): RecordAttachment {
    return {
      id: row.id,
      companyId: row.companyId,
      entityType: row.entityType as RecordEntityType,
      entityId: row.entityId,
      fileName: row.fileName,
      url: row.url ?? undefined,
      mimeType: row.mimeType ?? undefined,
      sizeBytes:
        row.sizeBytes === null || row.sizeBytes === undefined ? undefined : Number(row.sizeBytes),
      note: row.note ?? undefined,
      uploadedByUserId: row.uploadedByUserId ?? undefined,
      uploadedByName: row.uploadedByName ?? undefined,
      createdAt: new Date(row.createdAt),
    };
  }

  private buildPurchaseOrderPayableSummary(
    order: PurchaseOrder,
    companyBills: VendorBill[],
  ): PurchaseOrderPayableSummary {
    const linkedBills = companyBills.filter((bill) => bill.purchaseOrderId === order.id);
    const billedAmount = Number(linkedBills.reduce((sum, bill) => sum + bill.amount, 0).toFixed(2));
    const draftBillAmount = Number(
      linkedBills
        .filter((bill) => bill.status === 'Draft')
        .reduce((sum, bill) => sum + bill.amount, 0)
        .toFixed(2),
    );
    const openPayableAmount = Number(
      linkedBills
        .filter((bill) => bill.status !== 'Draft' && (bill.outstandingAmount ?? bill.amount) > 0)
        .reduce((sum, bill) => sum + (bill.outstandingAmount ?? bill.amount), 0)
        .toFixed(2),
    );
    const paidAmount = Number(
      linkedBills.reduce((sum, bill) => sum + (bill.paidAmount ?? 0), 0).toFixed(2),
    );

    return {
      purchaseOrderId: order.id,
      companyId: order.companyId,
      orderNumber: order.orderNumber,
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      orderStatus: order.status,
      totalAmount: order.totalAmount,
      billedAmount,
      draftBillAmount,
      openPayableAmount,
      paidAmount,
      remainingToBill: Number(Math.max(0, order.totalAmount - billedAmount).toFixed(2)),
    };
  }

  private getReceivedQuantityByLine(purchaseOrderId: string): Map<number, number> {
    const receipts = this.listPurchaseReceipts(
      this.getPurchaseOrderById(purchaseOrderId)?.companyId || '',
      purchaseOrderId,
    );
    const totals = new Map<number, number>();
    receipts.forEach((receipt) => {
      receipt.items.forEach((item) => {
        totals.set(
          item.lineIndex,
          Number(((totals.get(item.lineIndex) || 0) + item.quantity).toFixed(4)),
        );
      });
    });
    return totals;
  }

  private getRemainingReceiptItems(order: PurchaseOrder): Array<{ lineIndex: number; remainingQuantity: number }> {
    const receivedByLine = this.getReceivedQuantityByLine(order.id);
    return order.items
      .map((item, lineIndex) => ({
        lineIndex,
        remainingQuantity: Number((item.quantity - (receivedByLine.get(lineIndex) || 0)).toFixed(4)),
      }))
      .filter((item) => item.remainingQuantity > 0.0001);
  }

  private decodeJournalEntry(entry: any, lines: any[]): JournalEntry {
    return {
      id: entry.id,
      companyId: entry.companyId,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId ?? undefined,
      memo: entry.memo ?? undefined,
      entryDate: new Date(entry.entryDate),
      createdAt: new Date(entry.createdAt),
      lines: lines.map((line) => ({
        id: line.id,
        accountId: line.accountId,
        description: line.description ?? undefined,
        debit: Number(line.debit) || 0,
        credit: Number(line.credit) || 0,
      })),
    };
  }

  private calculateAgingBuckets(
    entries: Array<{ dueDate: Date; amount: number }>,
    asOf: Date,
  ): AgingBucket[] {
    const buckets: AgingBucket[] = [
      { bucket: 'current', amount: 0 },
      { bucket: '1_30', amount: 0 },
      { bucket: '31_60', amount: 0 },
      { bucket: '61_90', amount: 0 },
      { bucket: 'over_90', amount: 0 },
    ];

    entries.forEach((entry) => {
      const daysPastDue = Math.floor(
        (asOf.getTime() - entry.dueDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysPastDue <= 0) {
        buckets[0].amount += entry.amount;
      } else if (daysPastDue <= 30) {
        buckets[1].amount += entry.amount;
      } else if (daysPastDue <= 60) {
        buckets[2].amount += entry.amount;
      } else if (daysPastDue <= 90) {
        buckets[3].amount += entry.amount;
      } else {
        buckets[4].amount += entry.amount;
      }
    });

    return buckets.map((bucket) => ({
      ...bucket,
      amount: Number(bucket.amount.toFixed(2)),
    }));
  }

  private getSystemAccountId(companyId: string, code: string): string {
    const row = this.db
      .prepare(
        'SELECT id FROM ledger_accounts WHERE companyId = ? AND code = ? LIMIT 1',
      )
      .get(companyId, code) as { id?: string } | undefined;
    if (!row?.id) {
      throw new Error(`Required system account ${code} was not found for company ${companyId}.`);
    }
    return row.id;
  }

  private postInvoiceJournal(invoice: Invoice) {
    const existing = this.db
      .prepare(
        "SELECT id FROM journal_entries WHERE sourceType = 'invoice' AND sourceId = ? LIMIT 1",
      )
      .get(invoice.id) as { id?: string } | undefined;
    if (existing?.id) {
      return;
    }

    const lineItemTotal = Number(
      (invoice.lineItems || []).reduce((sum, line) => {
        const amount = Number((line as any)?.amount);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0).toFixed(2),
    );
    const invoiceTotal = Number(invoice.total);
    const postingTotal = lineItemTotal > 0 ? lineItemTotal : Number.isFinite(invoiceTotal) ? invoiceTotal : 0;
    if (!Number.isFinite(postingTotal) || postingTotal <= 0) {
      return;
    }

    const arAccountId = this.getSystemAccountId(invoice.companyId, '1100');
    const revenueAccountId = this.getSystemAccountId(invoice.companyId, '4000');
    this.createJournalEntry({
      companyId: invoice.companyId,
      sourceType: 'invoice',
      sourceId: invoice.id,
      memo: `Invoice ${invoice.invoiceNumber} posted`,
      entryDate: invoice.issueDate,
      lines: [
        {
          id: uuid(),
          accountId: arAccountId,
          description: 'Accounts receivable',
          debit: postingTotal,
          credit: 0,
        },
        {
          id: uuid(),
          accountId: revenueAccountId,
          description: 'Revenue',
          debit: 0,
          credit: postingTotal,
        },
      ],
    });
  }

  private postInvoicePaymentJournal(payment: Payment) {
    const existing = this.db
      .prepare(
        "SELECT id FROM journal_entries WHERE sourceType = 'invoice_payment' AND sourceId = ? LIMIT 1",
      )
      .get(payment.id) as { id?: string } | undefined;
    if (existing?.id) {
      return;
    }

    const invoice = this.db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(payment.invoiceId) as any;
    if (!invoice) return;

    const cashAccountId = this.getSystemAccountId(invoice.companyId, '1000');
    const arAccountId = this.getSystemAccountId(invoice.companyId, '1100');

    this.createJournalEntry({
      companyId: invoice.companyId,
      sourceType: 'invoice_payment',
      sourceId: payment.id,
      memo: `Payment for invoice ${invoice.invoiceNumber}`,
      entryDate: payment.paidAt,
      lines: [
        {
          id: uuid(),
          accountId: cashAccountId,
          description: 'Cash receipt',
          debit: payment.amount,
          credit: 0,
        },
        {
          id: uuid(),
          accountId: arAccountId,
          description: 'Accounts receivable settlement',
          debit: 0,
          credit: payment.amount,
        },
      ],
    });
  }

  private postVendorBillJournal(bill: VendorBill) {
    const existing = this.db
      .prepare(
        "SELECT id FROM journal_entries WHERE sourceType = 'vendor_bill' AND sourceId = ? LIMIT 1",
      )
      .get(bill.id) as { id?: string } | undefined;
    if (existing?.id) {
      return;
    }

    const apAccountId = this.getSystemAccountId(bill.companyId, '2000');
    const expenseAccountId =
      bill.expenseAccountId ?? this.getSystemAccountId(bill.companyId, '5000');

    this.createJournalEntry({
      companyId: bill.companyId,
      sourceType: 'vendor_bill',
      sourceId: bill.id,
      memo: `Vendor bill ${bill.billNumber} posted`,
      entryDate: bill.issueDate,
      lines: [
        {
          id: uuid(),
          accountId: expenseAccountId,
          description: bill.vendorName,
          debit: bill.amount,
          credit: 0,
        },
        {
          id: uuid(),
          accountId: apAccountId,
          description: 'Accounts payable',
          debit: 0,
          credit: bill.amount,
        },
      ],
    });
  }

  /**
   * Removes any journal entries (and their lines) posted from a given source.
   * Used to reverse a posting when its source is deleted or moves back to an
   * unposted state.
   */
  private removeJournalEntriesBySource(sourceType: string, sourceId: string) {
    const entries = this.db
      .prepare('SELECT id FROM journal_entries WHERE sourceType = ? AND sourceId = ?')
      .all(sourceType, sourceId) as Array<{ id: string }>;
    if (!entries.length) return;
    const delLines = this.db.prepare('DELETE FROM journal_lines WHERE entryId = ?');
    const delEntry = this.db.prepare('DELETE FROM journal_entries WHERE id = ?');
    const trx = this.db.transaction(() => {
      for (const entry of entries) {
        delLines.run(entry.id);
        delEntry.run(entry.id);
      }
    });
    trx();
  }

  /**
   * Posts an approved/paid campaign expense to the ledger as an out-of-pocket
   * cost: DR 5700 Marketing Expense / CR 1000 Cash. Idempotent. Draft,
   * Submitted and Rejected expenses are not recognised.
   */
  private postCampaignExpenseJournal(expense: CampaignExpense) {
    if (expense.status !== 'Approved' && expense.status !== 'Paid') return;
    if (!(expense.amount > 0)) return;
    const existing = this.db
      .prepare("SELECT id FROM journal_entries WHERE sourceType = 'campaign_expense' AND sourceId = ? LIMIT 1")
      .get(expense.id) as { id?: string } | undefined;
    if (existing?.id) return;

    const expenseAccountId = this.getSystemAccountId(expense.companyId, '5700');
    const cashAccountId = this.getSystemAccountId(expense.companyId, '1000');
    this.createJournalEntry({
      companyId: expense.companyId,
      sourceType: 'campaign_expense',
      sourceId: expense.id,
      memo: `Campaign expense: ${expense.description}`,
      entryDate: expense.expenseDate ?? expense.createdAt,
      lines: [
        { id: uuid(), accountId: expenseAccountId, description: expense.description, debit: expense.amount, credit: 0 },
        { id: uuid(), accountId: cashAccountId, description: 'Cash paid', debit: 0, credit: expense.amount },
      ],
    });
  }

  /**
   * Keeps a campaign expense's ledger posting in sync with its status: posts
   * when Approved/Paid, reverses otherwise. Amount changes after approval are
   * handled by reversing then re-posting.
   */
  private syncCampaignExpenseJournal(expense: CampaignExpense) {
    const postable = expense.status === 'Approved' || expense.status === 'Paid';
    if (!postable) {
      this.removeJournalEntriesBySource('campaign_expense', expense.id);
      return;
    }
    try {
      this.postCampaignExpenseJournal(expense);
    } catch (error) {
      console.error('Failed to post campaign expense journal', error);
    }
  }

  private postVendorBillPaymentJournal(payment: VendorBillPayment) {
    const existing = this.db
      .prepare(
        "SELECT id FROM journal_entries WHERE sourceType = 'vendor_bill_payment' AND sourceId = ? LIMIT 1",
      )
      .get(payment.id) as { id?: string } | undefined;
    if (existing?.id) {
      return;
    }

    const bill = this.getVendorBillById(payment.billId);
    if (!bill) return;

    const cashAccountId = this.getSystemAccountId(bill.companyId, '1000');
    const apAccountId = this.getSystemAccountId(bill.companyId, '2000');

    this.createJournalEntry({
      companyId: bill.companyId,
      sourceType: 'vendor_bill_payment',
      sourceId: payment.id,
      memo: `Vendor bill ${bill.billNumber} payment`,
      entryDate: payment.paidAt,
      lines: [
        {
          id: uuid(),
          accountId: apAccountId,
          description: 'Accounts payable settlement',
          debit: payment.amount,
          credit: 0,
        },
        {
          id: uuid(),
          accountId: cashAccountId,
          description: 'Cash disbursement',
          debit: 0,
          credit: payment.amount,
        },
      ],
    });
  }
}
