import path from 'path';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { seedData } from './seed-data';
import {
  Company,
  Position,
  User,
  CompanyRoleAssignment,
  Project,
  Task,
  Comment,
  Client,
  Supplier,
  InventoryItem,
  InventoryIssue,
  InventoryLocationBalance,
  InventoryTransfer,
  PurchaseOrder,
  PurchaseReceipt,
  PurchaseOrderStatus,
  Invoice,
  InvoiceTemplate,
  InvoiceTemplateLayout,
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
} from '../types';

type CreateUserInput = Omit<User, 'id'> & { id?: string };
type CreateTaskInput = Omit<Task, 'id' | 'createdAt'> & { createdAt?: Date | string };
type UpdateTaskInput = Partial<Omit<Task, 'id'>>;
type CreateClientInput = Omit<Client, 'id' | 'reference'> & { reference?: string };
type CreateSupplierInput = Omit<Supplier, 'id' | 'reference'> & { reference?: string };
type CreateInventoryItemInput = Omit<InventoryItem, 'id' | 'sku'> & { sku?: string };
type CreateInventoryIssueInput = Omit<InventoryIssue, 'id' | 'issuedAt'> & {
  issuedAt?: Date | string;
};
type CreateInventoryTransferInput = Omit<InventoryTransfer, 'id' | 'transferredAt'> & {
  transferredAt?: Date | string;
};
type CreatePurchaseOrderInput = Omit<
  PurchaseOrder,
  'id' | 'orderNumber' | 'totalAmount' | 'receivedAt'
> & { orderNumber?: string };
type CreatePurchaseReceiptInput = Omit<PurchaseReceipt, 'id'>;
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
  sales_invoice: { prefix: 'INV-', padLength: 4 },
  vendor_invoice: { prefix: 'VI-', padLength: 4 },
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
    showCompanyAddress: true,
    showTaxId: false,
  },
];

const invoiceTemplateLayouts: InvoiceTemplateLayout[] = ['classic', 'modern', 'compact', 'letterhead'];

const activityEntityTypes: ActivityEvent['entityType'][] = [
  'client',
  'project',
  'task',
  'supplier',
  'inventory_item',
  'purchase_order',
  'invoice',
  'vendor_bill',
];
type CreateStockMovementInput = Omit<StockMovement, 'id' | 'createdAt'> & {
  createdAt?: Date | string;
};
type CreateActivityEventInput = Omit<ActivityEvent, 'id' | 'createdAt'> & {
  createdAt?: Date | string;
};

const defaultDbPath = path.join(process.cwd(), 'taskflow.db');

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
}

export class DataStore {
  private db: Database.Database;
  private currentActor?: { userId?: string; name?: string };

  constructor(options: DataStoreOptions = {}) {
    this.db = new Database(options.dbPath ?? defaultDbPath);
    this.applyMigrations();
    if (options.seedOnEmpty ?? true) {
      this.seedIfEmpty();
    }
    this.ensureFinanceDefaults();
    this.ensureNumberingDefaults();
    this.ensureCompanyFinanceSettings();
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
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        invoiceNumber TEXT NOT NULL,
        companyId TEXT NOT NULL,
        clientId TEXT NOT NULL,
        templateId TEXT,
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
              showCompanyAddress INTEGER NOT NULL DEFAULT 1,
              showTaxId INTEGER NOT NULL DEFAULT 1,
              createdAt TEXT NOT NULL,
              updatedAt TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_invoice_templates_company ON invoice_templates (companyId, isDefault);
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
      'INSERT OR IGNORE INTO company_finance_settings (companyId, fiscalYearStartMonth, lockedThroughDate, updatedAt) VALUES (?, ?, ?, ?)',
    );
    const nowIso = new Date().toISOString();

    const trx = this.db.transaction(() => {
      companies.forEach((company) => {
        insertSetting.run(company.id, 1, null, nowIso);
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
        paymentInstructions, terms, footerNote, showCompanyAddress, showTaxId,
        createdAt, updatedAt
      ) VALUES (
        @id, @companyId, @name, @layout, @isDefault, @primaryColor, @accentColor,
        @logoUrl, @headerImageUrl, @footerImageUrl, @letterheadPdfUrl,
        @paymentInstructions, @terms, @footerNote, @showCompanyAddress, @showTaxId,
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
      avatar: row.avatar || `https://i.pravatar.cc/150?u=${row.email}`,
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
      .prepare('INSERT INTO companies (id, name, website, address) VALUES (@id, @name, @website, @address)')
      .run(newCompany);
    this.ensureFinanceDefaults();
    this.ensureNumberingDefaults();
    this.ensureCompanyFinanceSettings();
    return newCompany;
  }

  deleteCompany(id: string) {
    this.db.prepare('DELETE FROM companies WHERE id = ?').run(id);
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
          password: user.password,
          companyIds: normalizedCompanyIds.length > 0 ? normalizedCompanyIds : existingByEmail.companyIds,
          companyRoles: normalizedCompanyRoles.length > 0 ? normalizedCompanyRoles : existingByEmail.companyRoles,
          role: user.role || normalizedCompanyRoles[0]?.role || existingByEmail.role || 'Employee',
          positionId: user.positionId ?? existingByEmail.positionId,
          avatar: user.avatar || existingByEmail.avatar || `https://i.pravatar.cc/150?u=${user.email}`,
        };
        this.db
          .prepare(
            'UPDATE users SET name=@name, email=@email, role=@role, companyIds=@companyIds, positionId=@positionId, companyRoles=@companyRoles, avatar=@avatar, password=@password WHERE id=@id',
          )
          .run({
            ...updatedUser,
            companyIds: JSON.stringify(updatedUser.companyIds || []),
            positionId: updatedUser.positionId ?? null,
            companyRoles: JSON.stringify(updatedUser.companyRoles || []),
            avatar: updatedUser.avatar || `https://i.pravatar.cc/150?u=${updatedUser.email}`,
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
      password: user.password,
      companyIds: normalizedCompanyIds,
      companyRoles: normalizedCompanyRoles,
      role: user.role || normalizedCompanyRoles[0]?.role || 'Employee',
      positionId: user.positionId,
      avatar: user.avatar || `https://i.pravatar.cc/150?u=${user.email}`,
    };

    this.db
      .prepare(
        'INSERT INTO users (id, name, email, role, companyIds, positionId, companyRoles, avatar, password) VALUES (@id, @name, @email, @role, @companyIds, @positionId, @companyRoles, @avatar, @password)',
      )
      .run({
        ...newUser,
        companyIds: JSON.stringify(newUser.companyIds || []),
        positionId: newUser.positionId ?? null,
        companyRoles: JSON.stringify(newUser.companyRoles || []),
        avatar: newUser.avatar || `https://i.pravatar.cc/150?u=${newUser.email}`,
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
      avatar: updates.avatar ?? existing.avatar ?? `https://i.pravatar.cc/150?u=${existing.email}`,
      password: updates.password ?? existing.password,
    };
    this.db
      .prepare(
        'UPDATE users SET name=@name, email=@email, role=@role, companyIds=@companyIds, positionId=@positionId, companyRoles=@companyRoles, avatar=@avatar, password=@password WHERE id=@id',
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
    this.createActivityEvent({
      companyId: newTask.companyId,
      entityType: 'task',
      entityId: newTask.id,
      action: 'created',
      summary: `Task ${newTask.title} created.`,
      metadata: { projectId: newTask.projectId, status: newTask.status },
    });
    return newTask;
  }

  updateTask(id: string, updates: UpdateTaskInput) {
    const existing = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    if (!existing) return undefined;
    const updatedAssigned = updates.assignedUserIds ?? (this.parseJson<string[]>(existing.assignedUserIds) || []);
    const updatedTags = updates.tags ?? (this.parseJson<string[]>(existing.tags) || []);
    const updatedDeps = updates.dependencies ?? (this.parseJson<string[]>(existing.dependencies) || []);
    const updated = {
      ...existing,
      ...updates,
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
    return newComment;
  }

  listClients(companyId: string): Client[] {
    const rows = this.db
      .prepare('SELECT * FROM clients WHERE companyId = ? ORDER BY name ASC')
      .all(companyId) as any[];
    return rows.map((row) => this.decodeClient(row));
  }

  getClientById(id: string): Client | undefined {
    const row = this.db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as any;
    return row ? this.decodeClient(row) : undefined;
  }

  private getNumberingDataSource(entityType: NumberingEntityType): {
    table: 'clients' | 'suppliers' | 'inventory_items' | 'purchase_orders' | 'vendor_bills' | 'invoices';
    column: 'reference' | 'sku' | 'orderNumber' | 'billNumber' | 'invoiceNumber';
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
      case 'sales_invoice':
        return { table: 'invoices', column: 'invoiceNumber' };
      case 'vendor_invoice':
        return { table: 'vendor_bills', column: 'billNumber' };
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
        'INSERT INTO company_finance_settings (companyId, fiscalYearStartMonth, lockedThroughDate, updatedAt) VALUES (?, ?, ?, ?)',
      )
      .run(companyId, 1, null, nowIso);
    return {
      companyId,
      fiscalYearStartMonth: 1,
      updatedAt: new Date(nowIso),
    };
  }

  updateCompanyFinanceSettings(
    companyId: string,
    updates: { fiscalYearStartMonth?: number; lockedThroughDate?: Date | null },
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

    this.db
      .prepare(
        'UPDATE company_finance_settings SET fiscalYearStartMonth = ?, lockedThroughDate = ?, updatedAt = ? WHERE companyId = ?',
      )
      .run(
        fiscalYearStartMonth,
        lockedThroughDate ? lockedThroughDate.toISOString() : null,
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
      layout: invoiceTemplateLayouts.includes(row.layout) ? row.layout : 'classic',
      isDefault: Boolean(row.isDefault),
      primaryColor: row.primaryColor || '#111827',
      accentColor: row.accentColor || '#2563eb',
      logoUrl: row.logoUrl ?? undefined,
      headerImageUrl: row.headerImageUrl ?? undefined,
      footerImageUrl: row.footerImageUrl ?? undefined,
      letterheadPdfUrl: row.letterheadPdfUrl ?? undefined,
      paymentInstructions: row.paymentInstructions ?? undefined,
      terms: row.terms ?? undefined,
      footerNote: row.footerNote ?? undefined,
      showCompanyAddress: row.showCompanyAddress === undefined ? true : Boolean(row.showCompanyAddress),
      showTaxId: row.showTaxId === undefined ? true : Boolean(row.showTaxId),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  listInvoiceTemplates(companyId: string): InvoiceTemplate[] {
    this.ensureInvoiceTemplateDefaults();
    const rows = this.db
      .prepare('SELECT * FROM invoice_templates WHERE companyId = ? ORDER BY isDefault DESC, name ASC')
      .all(companyId) as any[];
    return rows.map((row) => this.decodeInvoiceTemplate(row));
  }

  getInvoiceTemplateById(id: string): InvoiceTemplate | undefined {
    const row = this.db.prepare('SELECT * FROM invoice_templates WHERE id = ?').get(id) as any;
    return row ? this.decodeInvoiceTemplate(row) : undefined;
  }

  createInvoiceTemplate(template: CreateInvoiceTemplateInput): InvoiceTemplate {
    const nowIso = new Date().toISOString();
    const newTemplate: InvoiceTemplate = {
      ...template,
      id: uuid(),
      layout: invoiceTemplateLayouts.includes(template.layout) ? template.layout : 'classic',
      primaryColor: template.primaryColor || '#111827',
      accentColor: template.accentColor || '#2563eb',
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
            id, companyId, name, layout, isDefault, primaryColor, accentColor,
            logoUrl, headerImageUrl, footerImageUrl, letterheadPdfUrl,
            paymentInstructions, terms, footerNote, showCompanyAddress, showTaxId,
            createdAt, updatedAt
          ) VALUES (
            @id, @companyId, @name, @layout, @isDefault, @primaryColor, @accentColor,
            @logoUrl, @headerImageUrl, @footerImageUrl, @letterheadPdfUrl,
            @paymentInstructions, @terms, @footerNote, @showCompanyAddress, @showTaxId,
            @createdAt, @updatedAt
          )`,
        )
        .run({
          ...newTemplate,
          isDefault: newTemplate.isDefault ? 1 : 0,
          logoUrl: newTemplate.logoUrl ?? null,
          headerImageUrl: newTemplate.headerImageUrl ?? null,
          footerImageUrl: newTemplate.footerImageUrl ?? null,
          letterheadPdfUrl: newTemplate.letterheadPdfUrl ?? null,
          paymentInstructions: newTemplate.paymentInstructions ?? null,
          terms: newTemplate.terms ?? null,
          footerNote: newTemplate.footerNote ?? null,
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
            footerImageUrl=@footerImageUrl, letterheadPdfUrl=@letterheadPdfUrl,
            paymentInstructions=@paymentInstructions, terms=@terms, footerNote=@footerNote,
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
          paymentInstructions: merged.paymentInstructions ?? null,
          terms: merged.terms ?? null,
          footerNote: merged.footerNote ?? null,
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
    const rows = this.db
      .prepare('SELECT * FROM suppliers WHERE companyId = ? ORDER BY name ASC')
      .all(companyId) as any[];
    return rows.map((row) => this.decodeSupplier(row));
  }

  getSupplierById(id: string): Supplier | undefined {
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
    };

    this.db
      .prepare(
        'INSERT INTO inventory_items (id, companyId, sku, barcode, name, category, unit, vatApplicable, tracksInventory, onHand, reorderPoint, unitCost, salePrice, preferredVendor, preferredSupplierId, location) VALUES (@id, @companyId, @sku, @barcode, @name, @category, @unit, @vatApplicable, @tracksInventory, @onHand, @reorderPoint, @unitCost, @salePrice, @preferredVendor, @preferredSupplierId, @location)',
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
      this.createStockMovement({
        companyId: issue.companyId,
        inventoryItemId: issue.inventoryItemId,
        movementType: 'Issue',
        quantityChange: -issue.quantity,
        unitCost: item.unitCost,
        referenceType: 'inventory_issue',
        referenceId: issue.id,
        note: issue.note
          ? `${issue.note} (${issue.location})`
          : `Issued from ${issue.location}`,
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

    const status: PurchaseOrderStatus = input.status ?? 'Draft';
    if (status === 'Partially Received') {
      throw new Error('Purchase orders cannot start as Partially Received.');
    }
    const totalAmount = Number(
      normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2),
    );
    const shouldAutoReceive = status === 'Received';
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
    };

    this.db
      .prepare(
        'INSERT INTO purchase_orders (id, companyId, orderNumber, supplierName, supplierId, orderDate, expectedDate, status, items, totalAmount, notes, receivedAt) VALUES (@id, @companyId, @orderNumber, @supplierName, @supplierId, @orderDate, @expectedDate, @status, @items, @totalAmount, @notes, @receivedAt)',
      )
      .run({
        ...order,
        supplierId: order.supplierId ?? null,
        orderDate: order.orderDate.toISOString(),
        expectedDate: order.expectedDate ? order.expectedDate.toISOString() : null,
        items: JSON.stringify(order.items),
        notes: order.notes ?? null,
        receivedAt: null,
      });

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

  receivePurchaseOrder(
    id: string,
    input: {
      receivedAt?: Date | string;
      notes?: string;
      items: Array<{ lineIndex: number; quantity: number }>;
    },
  ): PurchaseOrder {
    const order = this.getPurchaseOrderById(id);
    if (!order) {
      throw new Error('Purchase order not found.');
    }
    if (order.status === 'Cancelled') {
      throw new Error('Cancelled purchase orders cannot be received.');
    }

    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
    const receivedByLine = this.getReceivedQuantityByLine(order.id);
    const normalizedItems = input.items
      .map((item) => ({
        lineIndex: Number(item.lineIndex),
        quantity: Number(item.quantity),
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
          updateById.run(item.quantity, inventoryItemId, order.companyId);
          this.incrementLocationBalance(
            order.companyId,
            inventoryItemId,
            this.normalizeInventoryLocation(inventoryItem?.location),
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
    this.db
      .prepare(
        'INSERT INTO invoices (id, invoiceNumber, companyId, clientId, templateId, issueDate, dueDate, lineItems, total, status, notes, currency, taxRate, sentAt, paidAt) VALUES (@id, @invoiceNumber, @companyId, @clientId, @templateId, @issueDate, @dueDate, @lineItems, @total, @status, @notes, @currency, @taxRate, @sentAt, @paidAt)',
      )
      .run({
        ...newInvoice,
        templateId: newInvoice.templateId ?? null,
        issueDate: newInvoice.issueDate.toISOString(),
        dueDate: newInvoice.dueDate.toISOString(),
        lineItems: JSON.stringify(normalizedLineItems),
        notes: newInvoice.notes ?? null,
        currency: newInvoice.currency ?? 'USD',
        taxRate: newInvoice.taxRate ?? 0,
        sentAt: newInvoice.sentAt ? newInvoice.sentAt.toISOString() : null,
        paidAt: newInvoice.paidAt ? newInvoice.paidAt.toISOString() : null,
      });
    try {
      this.postInvoiceJournal(newInvoice);
    } catch (error) {
      console.error('Failed to auto-post invoice journal', error);
    }
    this.createActivityEvent({
      companyId: newInvoice.companyId,
      entityType: 'invoice',
      entityId: newInvoice.id,
      action: 'created',
      summary: `Invoice ${newInvoice.invoiceNumber} created.`,
      metadata: { status: newInvoice.status, total: newInvoice.total, clientId: newInvoice.clientId },
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
    this.createActivityEvent({
      companyId: updated.companyId,
      entityType: 'invoice',
      entityId: updated.id,
      action: 'status_changed',
      summary: `Invoice ${updated.invoiceNumber} moved to ${updated.status}.`,
      metadata: { status: updated.status, total: updated.total, outstandingAmount: updated.outstandingAmount },
    });
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
    this.db
      .prepare(
        'UPDATE invoices SET invoiceNumber=@invoiceNumber, companyId=@companyId, clientId=@clientId, templateId=@templateId, issueDate=@issueDate, dueDate=@dueDate, lineItems=@lineItems, total=@total, status=@status, notes=@notes, currency=@currency, taxRate=@taxRate, sentAt=@sentAt, paidAt=@paidAt WHERE id=@id',
      )
      .run({ ...merged, id: invoiceId, templateId: merged.templateId ?? null });
    this.refreshInvoicePaymentStatus(invoiceId);
    return this.getInvoiceById(invoiceId);
  }

  private decodeInvoice(row: any): Invoice {
    const paidAmount = this.getInvoicePaidAmount(row.id);
    const total = Number(row.total) || 0;
    return {
      ...row,
      templateId: row.templateId ?? undefined,
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
      outstandingAmount: Number(Math.max(0, total - paidAmount).toFixed(2)),
    };
  }

  private normalizeInvoiceLineItems(rawItems: any[]): Invoice['lineItems'] {
    return (Array.isArray(rawItems) ? rawItems : [])
      .map((item) => {
        const taskId = item?.taskId ? String(item.taskId) : undefined;
        const quantity = Number(item?.quantity ?? 1);
        const unitPrice = Number(item?.unitPrice ?? item?.amount ?? 0);
        const fallbackAmount = quantity * unitPrice;
        const amount = Number(item?.amount ?? fallbackAmount);

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
      })
      .filter((item) => item.description && item.amount >= 0)
      .map((item) => ({
        ...item,
        quantity: Number(item.quantity.toFixed(4)),
        unitPrice: Number(item.unitPrice.toFixed(4)),
        amount: Number(item.amount.toFixed(2)),
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
    this.db
      .prepare('INSERT INTO payments (id, invoiceId, amount, method, note, paidAt) VALUES (@id, @invoiceId, @amount, @method, @note, @paidAt)')
      .run({
        ...newPayment,
        paidAt: newPayment.paidAt.toISOString(),
      });
    try {
      this.postInvoicePaymentJournal(newPayment);
    } catch (error) {
      console.error('Failed to auto-post invoice payment journal', error);
    }
    this.refreshInvoicePaymentStatus(newPayment.invoiceId);
    const refreshedInvoice = this.getInvoiceById(newPayment.invoiceId);
    if (refreshedInvoice) {
      this.createActivityEvent({
        companyId: refreshedInvoice.companyId,
        entityType: 'invoice',
        entityId: refreshedInvoice.id,
        action: 'payment_recorded',
        summary: `Payment recorded for invoice ${refreshedInvoice.invoiceNumber}.`,
        metadata: {
          amount: newPayment.amount,
          method: newPayment.method,
          outstandingAmount: refreshedInvoice.outstandingAmount,
        },
      });
    }
    return newPayment;
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
      paidAt = new Date().toISOString();
    } else if (paidTotal > 0 || status === 'Paid') {
      status = invoice.dueDate < new Date() ? 'Overdue' : 'Sent';
      paidAt = null;
    }

    this.db
      .prepare('UPDATE invoices SET status = ?, paidAt = ? WHERE id = ?')
      .run(status, paidAt, invoiceId);
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
        'INSERT INTO vendor_bills (id, companyId, vendorName, supplierId, purchaseOrderId, billNumber, referenceInvoiceNumber, issueDate, dueDate, amount, status, notes, expenseAccountId, paidAt) VALUES (@id, @companyId, @vendorName, @supplierId, @purchaseOrderId, @billNumber, @referenceInvoiceNumber, @issueDate, @dueDate, @amount, @status, @notes, @expenseAccountId, @paidAt)',
      )
      .run({
        ...bill,
        supplierId: bill.supplierId ?? null,
        purchaseOrderId: bill.purchaseOrderId ?? null,
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
    });

    trx();

    try {
      this.postVendorBillPaymentJournal(payment);
    } catch (error) {
      console.error('Failed to auto-post vendor bill payment journal', error);
    }

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
      metadata: { amount: payment.amount, method: payment.method, outstandingAmount: updatedBill.outstandingAmount },
    });

    return { payment, bill: updatedBill };
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

    return {
      openReceivables: Number(openReceivablesAmount.toFixed(2)),
      openPayables: Number(openPayablesAmount.toFixed(2)),
      paidThisMonth: Number(paidThisMonthRow.amount || 0),
      billedThisMonth: Number(billedThisMonthRow.amount || 0),
      expenseReceiptsThisMonth: Number(expensesRow.amount || 0),
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
      { id: 'open-companies', label: 'Companies', route: '/companies' },
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
      orderDate: new Date(row.orderDate),
      expectedDate: row.expectedDate ? new Date(row.expectedDate) : undefined,
      status: row.status as PurchaseOrderStatus,
      items: this.normalizePurchaseOrderItems(this.parseJson(row.items) || []),
      totalAmount: Number(row.totalAmount) || 0,
      notes: row.notes ?? undefined,
      receivedAt: row.receivedAt ? new Date(row.receivedAt) : undefined,
    };
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
        'INSERT INTO stock_movements (id, companyId, inventoryItemId, movementType, quantityChange, unitCost, referenceType, referenceId, note, createdAt) VALUES (@id, @companyId, @inventoryItemId, @movementType, @quantityChange, @unitCost, @referenceType, @referenceId, @note, @createdAt)',
      )
      .run({
        ...movement,
        unitCost: movement.unitCost ?? null,
        referenceType: movement.referenceType ?? null,
        referenceId: movement.referenceId ?? null,
        note: movement.note ?? null,
        createdAt: movement.createdAt.toISOString(),
      });

    return movement;
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
      createdAt: new Date(row.createdAt),
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
