import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { DataStore, type DataStoreOptions } from './data/store';
import { sendWelcomeEmail } from './email';
import { renderInvoicePdf } from './pdf/invoice-pdf';
import {
  influencerPlatforms,
  type InfluencerAccount,
  type CompanyRoleAssignment,
  type Invoice,
  type InvoiceTemplate,
  type InvoiceTemplateLayout,
  type InvoiceColumn,
  type InvoiceBankAccount,
  type InvoiceSectionKey,
  invoiceSectionKeys,
  type InvoiceLineItem,
  type JournalEntryLine,
	  type Project,
	  type ProjectVisibility,
	  type PurchaseOrderLineItem,
	  type ProposalLineItem,
	  type SalesOrderLineItem,
  type SanitizedUser,
  type UserRole,
  type VendorBillStatus,
  type InvoiceStatus,
  type LedgerAccountType,
  type PurchaseOrderStatus,
  type SalesOrderStatus,
  type DeliveryStatus,
  type NumberingEntityType,
  type RecordEntityType,
	  activityCategories,
	  leadStatuses,
	  leadSources,
	  contactPriorities,
		  opportunityStages,
		  campaignStatuses,
		  proposalStatuses,
		  vendorRequestStatuses,
		  commissionBases,
		  commissionRateTypes,
		  commissionStatuses,
		  campaignDeliverableStatuses,
		  campaignAssignmentStatuses,
		  campaignExpenseStatuses,
		  campaignFulfillments,
		} from './types';
import {
  HttpError,
  canAccessCompany,
  getAccessibleCompanyIds,
  getEffectiveRole,
  requireCompanyRole,
} from './http';
import {
  asRecord,
  enumValue,
  optionalDateInput,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requiredArray,
  requiredDateInput,
  requiredNumber,
  requiredString,
  stringArray,
} from './validation';
import { validateInvoiceDoc } from './invoice-doc';

type AuthedRequest = Request & { user?: SanitizedUser };

// Sanitizes the influencer social accounts array from a request body.
function parseInfluencerAccounts(raw: unknown): InfluencerAccount[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    .map((a) => ({
      id: typeof a.id === 'string' && a.id ? a.id : randomUUID(),
      platform: enumValue(a.platform, 'platform', influencerPlatforms),
      handle: optionalString(a.handle),
      url: optionalString(a.url),
      followers: optionalNumber(a.followers),
      avgViews: optionalNumber(a.avgViews),
      engagementRate: optionalNumber(a.engagementRate),
      estimatedAvg: optionalNumber(a.estimatedAvg),
      notes: optionalString(a.notes),
    }));
}

const invoiceColumnKeys: InvoiceColumn['key'][] = ['sku', 'description', 'quantity', 'unitPrice', 'amount', 'custom'];
const invoiceColumnAligns: NonNullable<InvoiceColumn['align']>[] = ['left', 'center', 'right'];

function parseInvoiceColumns(raw: unknown): InvoiceColumn[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      id: typeof c.id === 'string' && c.id ? c.id : randomUUID(),
      key: invoiceColumnKeys.includes(c.key as any) ? (c.key as InvoiceColumn['key']) : 'custom',
      label: optionalString(c.label) ?? '',
      visible: c.visible === undefined ? true : Boolean(c.visible),
      width: optionalNumber(c.width),
      align: invoiceColumnAligns.includes(c.align as any) ? (c.align as InvoiceColumn['align']) : undefined,
    }));
}

function parseSectionBreaks(raw: unknown): InvoiceSectionKey[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is InvoiceSectionKey => invoiceSectionKeys.includes(k as InvoiceSectionKey));
}

function parseBankAccounts(raw: unknown): InvoiceBankAccount[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
    .map((b) => ({
      id: typeof b.id === 'string' && b.id ? b.id : randomUUID(),
      bankName: optionalString(b.bankName),
      accountHolder: optionalString(b.accountHolder),
      accountNumber: optionalString(b.accountNumber),
      iban: optionalString(b.iban),
      swift: optionalString(b.swift),
      currency: optionalString(b.currency),
    }));
}

export interface CreateServerOptions extends DataStoreOptions {
  allowSeedReset?: boolean;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

const invoiceStatuses: InvoiceStatus[] = ['Draft', 'Sent', 'Paid', 'Overdue'];
const invoiceTemplateLayouts: InvoiceTemplateLayout[] = ['classic', 'modern', 'compact', 'letterhead'];
const vendorBillStatuses: VendorBillStatus[] = ['Draft', 'Approved', 'Paid', 'Overdue'];
const purchaseOrderStatuses: PurchaseOrderStatus[] = [
  'Draft',
  'Ordered',
  'Partially Received',
  'Received',
  'Cancelled',
];
const salesOrderStatuses: SalesOrderStatus[] = ['Draft', 'Confirmed', 'Invoiced', 'Cancelled'];
const deliveryStatuses: DeliveryStatus[] = ['Pending', 'Shipped', 'Delivered', 'Cancelled'];

import { greenApi, toChatId, GreenApiError } from './services/greenApi';
const ledgerAccountTypes: LedgerAccountType[] = [
  'Asset',
  'Liability',
  'Equity',
  'Revenue',
  'Expense',
];
const userRoles: UserRole[] = ['Admin', 'Manager', 'Employee', 'Accountant'];
const companyManagementRoles: UserRole[] = ['Admin', 'Manager', 'Accountant'];
const clientStatuses = ['Lead', 'Active', 'At Risk', 'Inactive'] as const;
const contactRoles = ['Lead', 'Client', 'Vendor', 'Influencer', 'Partner'] as const;
const activityEntityTypes = [
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
  'invoice',
  'vendor_bill',
] as const;
const recordEntityTypes = [
  ...activityEntityTypes,
  'company',
  'ledger_account',
  'journal_entry',
  'payment',
  'vendor_payment',
  'purchase_receipt',
  'stock_movement',
] as const;
const numberingEntityTypes = [
  'client',
  'supplier',
  'inventory_item',
  'purchase_order',
  'sales_order',
  'sales_invoice',
  'vendor_invoice',
] as const;

const parseAllowedOrigins = () =>
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const defaultAllowedOrigins = new Set([
  'http://localhost:9002',
  'http://127.0.0.1:9002',
  'http://localhost:9003',
  'http://127.0.0.1:9003',
]);

const isLoopbackDevOrigin = (origin: string) => {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const parsed = new URL(origin);
    return (
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
      && /^https?:$/.test(parsed.protocol)
    );
  } catch {
    return false;
  }
};

const isAllowedOrigin = (origin?: string) => {
  if (!origin) return true;

  const configuredOrigins = parseAllowedOrigins();
  if (configuredOrigins.includes('*')) {
    return true;
  }
  if (configuredOrigins.includes(origin) || defaultAllowedOrigins.has(origin)) {
    return true;
  }
  if (isLoopbackDevOrigin(origin)) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    if (
      parsed.protocol === 'https:'
      && parsed.hostname.endsWith('.devtunnels.ms')
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
};

const csvEscape = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

const toCsv = (headers: string[], rows: Array<Array<unknown>>): string => {
  const headerRow = headers.map(csvEscape).join(',');
  const body = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  return body ? `${headerRow}\n${body}` : `${headerRow}\n`;
};

const handler =
  (
    fn: (req: AuthedRequest, res: Response, next: NextFunction) => unknown | Promise<unknown>,
  ) =>
  (req: AuthedRequest, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const parseCompanyRoles = (value: unknown, fieldName = 'companyRoles'): CompanyRoleAssignment[] => {
  const rows = requiredArray<unknown>(value, fieldName);
  if (rows.length === 0) {
    throw new HttpError(400, `${fieldName} must contain at least one assignment.`);
  }
  return rows.map((row, index) => {
    const record = asRecord(row, `${fieldName}[${index}]`);
    return {
      companyId: requiredString(record.companyId, `${fieldName}[${index}].companyId`),
      role: enumValue(record.role, `${fieldName}[${index}].role`, userRoles),
      positionId: optionalString(record.positionId),
    };
  });
};

const parseInvoiceLineItems = (value: unknown): InvoiceLineItem[] => {
  const rows = requiredArray<unknown>(value, 'lineItems');
  if (rows.length === 0) {
    throw new HttpError(400, 'lineItems must contain at least one item.');
  }
  return rows.map((row, index) => {
    const record = asRecord(row, `lineItems[${index}]`);
    const quantity = requiredNumber(record.quantity ?? 1, `lineItems[${index}].quantity`);
    const unitPrice = requiredNumber(record.unitPrice ?? record.amount ?? 0, `lineItems[${index}].unitPrice`);
    return {
      taskId: optionalString(record.taskId),
      itemType: enumValue(
        record.itemType ?? (record.taskId ? 'Task' : 'Manual'),
        `lineItems[${index}].itemType`,
        ['Task', 'Manual'],
      ),
      sku: optionalString(record.sku),
      description: requiredString(record.description, `lineItems[${index}].description`, {
        min: 2,
      }),
      quantity,
      unitPrice,
      amount: requiredNumber(
        record.amount ?? quantity * unitPrice,
        `lineItems[${index}].amount`,
      ),
    };
  });
};

const parsePurchaseOrderItems = (value: unknown): PurchaseOrderLineItem[] => {
  const rows = requiredArray<unknown>(value, 'items');
  if (rows.length === 0) {
    throw new HttpError(400, 'items must contain at least one line item.');
  }
  return rows.map((row, index) => {
    const record = asRecord(row, `items[${index}]`);
    const quantity = requiredNumber(record.quantity, `items[${index}].quantity`);
    const unitCost = requiredNumber(record.unitCost, `items[${index}].unitCost`);
    return {
      inventoryItemId: optionalString(record.inventoryItemId),
      sku: optionalString(record.sku),
      description: requiredString(record.description, `items[${index}].description`, { min: 2 }),
      quantity,
      unitCost,
      lineTotal: requiredNumber(
        record.lineTotal ?? quantity * unitCost,
        `items[${index}].lineTotal`,
      ),
    };
  });
};

const parseSalesOrderItems = (value: unknown): SalesOrderLineItem[] => {
  const rows = requiredArray<unknown>(value, 'items');
  if (rows.length === 0) {
    throw new HttpError(400, 'items must contain at least one line item.');
  }
  return rows.map((row, index) => {
    const record = asRecord(row, `items[${index}]`);
    const quantity = requiredNumber(record.quantity, `items[${index}].quantity`);
    const unitPrice = requiredNumber(record.unitPrice, `items[${index}].unitPrice`);
    return {
      inventoryItemId: optionalString(record.inventoryItemId),
      sku: optionalString(record.sku),
      description: requiredString(record.description, `items[${index}].description`, { min: 2 }),
      quantity,
      unitPrice,
      lineTotal: requiredNumber(
        record.lineTotal ?? quantity * unitPrice,
        `items[${index}].lineTotal`,
      ),
    };
  });
};

const parseProposalItems = (value: unknown): ProposalLineItem[] => {
  const rows = requiredArray<unknown>(value, 'items');
  if (rows.length === 0) {
    throw new HttpError(400, 'items must contain at least one proposal line item.');
  }
  return rows.map((row, index) => {
    const record = asRecord(row, `items[${index}]`);
    const quantity = requiredNumber(record.quantity ?? 1, `items[${index}].quantity`);
    const unitPrice = requiredNumber(record.unitPrice, `items[${index}].unitPrice`);
    return {
      description: requiredString(record.description, `items[${index}].description`, { min: 2 }),
      quantity,
      unitPrice,
      lineTotal: requiredNumber(record.lineTotal ?? quantity * unitPrice, `items[${index}].lineTotal`),
    };
  });
};

const parsePurchaseReceiptItems = (
  value: unknown,
): Array<{ lineIndex: number; quantity: number }> => {
  const rows = requiredArray<unknown>(value, 'items');
  if (rows.length === 0) {
    throw new HttpError(400, 'items must contain at least one receipt line.');
  }
  return rows.map((row, index) => {
    const record = asRecord(row, `items[${index}]`);
    const lineIndex = requiredNumber(record.lineIndex, `items[${index}].lineIndex`);
    const quantity = requiredNumber(record.quantity, `items[${index}].quantity`);
    if (!Number.isInteger(lineIndex) || lineIndex < 0) {
      throw new HttpError(400, `items[${index}].lineIndex must be a non-negative integer.`);
    }
    if (quantity <= 0) {
      throw new HttpError(400, `items[${index}].quantity must be greater than zero.`);
    }
    return { lineIndex, quantity };
  });
};

const parseJournalLines = (value: unknown): JournalEntryLine[] => {
  const rows = requiredArray<unknown>(value, 'lines');
  if (rows.length === 0) {
    throw new HttpError(400, 'lines must contain at least one row.');
  }
  return rows.map((row, index) => {
    const record = asRecord(row, `lines[${index}]`);
    return {
      id: optionalString(record.id) || '',
      accountId: requiredString(record.accountId, `lines[${index}].accountId`),
      description: optionalString(record.description),
      debit: requiredNumber(record.debit ?? 0, `lines[${index}].debit`),
      credit: requiredNumber(record.credit ?? 0, `lines[${index}].credit`),
    };
  });
};

const defaultPassword = () => Math.random().toString(36).slice(-8);

export function createServer(options: CreateServerOptions = {}) {
  const logger = options.logger ?? console;
  const allowSeedReset =
    options.allowSeedReset ?? process.env.ALLOW_SEED_RESET === 'true';
  const store = new DataStore({
    dbPath: options.dbPath,
    seedOnEmpty: options.seedOnEmpty ?? process.env.SEED_ON_EMPTY !== 'false',
  });

  // Background sweep: every 30 minutes, queue InvoiceOverdue follow-ups for
  // any unpaid invoice past its dueDate. Idempotent — won't duplicate.
  // Disabled in test environment to avoid leaking timers.
  if (process.env.NODE_ENV !== 'test') {
    const sweepIntervalMs =
      Number(process.env.FOLLOWUP_SWEEP_INTERVAL_MS) || 30 * 60 * 1000;
    const runSweep = () => {
      try {
        const created = store.sweepOverdueInvoiceFollowups();
        if (created > 0) {
          logger.info(`[followups] created ${created} overdue-invoice follow-up(s)`);
        }
      } catch (error) {
        logger.error('[followups] overdue sweep failed', error);
      }
    };
    setTimeout(runSweep, 30 * 1000).unref?.();
    setInterval(runSweep, sweepIntervalMs).unref?.();
  }

  const app = express();
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, isAllowedOrigin(origin));
      },
      credentials: true,
    }),
  );
  // Uploaded images are sent as base64 data URLs. A 2 MB image expands to
  // roughly 2.7 MB in JSON, so the parser must allow more than the file limit.
  app.use(express.json({ limit: '4mb' }));

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
    });
    next();
  });

  const authMiddleware = (req: AuthedRequest, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header) return next(new HttpError(401, 'Unauthorized'));
    const token = header.replace('Bearer ', '').trim();
    const user = store.getUserByToken(token);
    if (!user) return next(new HttpError(401, 'Unauthorized'));
    req.user = user;
    next();
  };

  const withActor = <T>(req: AuthedRequest, fn: () => T): T =>
    store.runAsActor(
      req.user ? { userId: req.user.id, name: req.user.name } : undefined,
      fn,
    );

  // Auto-convert a contact to Client when a transaction is created for them
  const autoConvertContactToClient = (contactId: string | undefined, companyId: string) => {
    if (!contactId) return;
    const contact = store.getContactById(contactId);
    if (!contact || contact.companyId !== companyId) return;
    if (!contact.roles?.includes('Client')) {
      store.addContactRole(contactId, companyId, 'Client', 'Manual');
    }
    if (contact.leadStatus && contact.leadStatus !== 'Won') {
      store.updateContact(contactId, { leadStatus: 'Won', convertedToClientAt: new Date() });
    }
  };

  const requireAdmin = (req: AuthedRequest) => {
    if (!req.user || req.user.role !== 'Admin') {
      throw new HttpError(403, 'Admin access required.');
    }
  };

  // Platform-wide gate. Use for /admin/* routes, impersonation, cross-tenant
  // operations, and anything that should NEVER be available to a customer's
  // in-house Admin.
  const requireSuperAdmin = (req: AuthedRequest) => {
    if (!req.user || !req.user.isSuperAdmin) {
      throw new HttpError(403, 'Super-admin access required.');
    }
  };

  const requireCompanyAccess = (req: AuthedRequest, companyId: string) => {
    if (!req.user || !canAccessCompany(req.user, companyId)) {
      throw new HttpError(403, 'You do not have access to this company.');
    }
  };

  const requireCompanyRoles = (
    req: AuthedRequest,
    companyId: string,
    roles: UserRole[],
  ) => {
    requireCompanyAccess(req, companyId);
    if (!requireCompanyRole(req.user!, companyId, roles)) {
      throw new HttpError(403, 'You do not have permission to perform this action.');
    }
  };

  const canViewProject = (user: SanitizedUser, project: Project): boolean => {
    const role = getEffectiveRole(user, project.companyId);
    if (!role) return false;
    if (role !== 'Employee') return true;
    return project.visibility === 'Public' || Boolean(project.memberIds?.includes(user.id));
  };

  const requireProjectViewAccess = (req: AuthedRequest, project: Project) => {
    requireCompanyAccess(req, project.companyId);
    if (!canViewProject(req.user!, project)) {
      throw new HttpError(403, 'You do not have access to this project.');
    }
  };

  // A task without a project is a general company task: visible to anyone with
  // company access. A task attached to a project inherits that project's visibility.
  const canViewTask = (
    user: SanitizedUser,
    task: { projectId?: string | null },
  ): boolean => {
    if (!task.projectId) return true;
    const project = store.getProjectById(task.projectId);
    return Boolean(project && canViewProject(user, project));
  };

  const requireTaskViewAccess = (
    req: AuthedRequest,
    task: { companyId: string; projectId?: string | null },
  ) => {
    requireCompanyAccess(req, task.companyId);
    if (!canViewTask(req.user!, task)) {
      throw new HttpError(403, 'You do not have access to this task.');
    }
  };

  const requireRecordSupportAccess = (
    req: AuthedRequest,
    companyId: string,
    entityType: RecordEntityType,
    entityId: string,
  ) => {
    if (entityType === 'project') {
      const project = store.getProjectById(entityId);
      if (!project || project.companyId !== companyId) {
        throw new HttpError(404, 'Project not found.');
      }
      requireProjectViewAccess(req, project);
      return;
    }
    if (entityType === 'task') {
      const task = store.getTaskById(entityId);
      if (!task || task.companyId !== companyId) {
        throw new HttpError(404, 'Task not found.');
      }
      requireTaskViewAccess(req, task);
      return;
    }
    requireCompanyRoles(req, companyId, companyManagementRoles);
  };

  const ensureUsersBelongToCompany = (userIds: string[], companyId: string, fieldName: string) => {
    if (!userIds.length) return;
    const allowed = new Set(store.getUsersByCompany(companyId).map((user) => user.id));
    const invalidUserId = userIds.find((userId) => !allowed.has(userId));
    if (invalidUserId) {
      throw new HttpError(
        400,
        `${fieldName} contains user ${invalidUserId}, which does not belong to company ${companyId}.`,
      );
    }
  };

  const ensureClientBelongsToCompany = (clientId: string | undefined, companyId: string) => {
    if (!clientId) return;
    const client = store.getClientById(clientId);
    if (!client || client.companyId !== companyId) {
      throw new HttpError(400, `Client ${clientId} does not belong to company ${companyId}.`);
    }
  };

  const ensureProjectBelongsToCompany = (projectId: string, companyId: string) => {
    const project = store.getProjectById(projectId);
    if (!project || project.companyId !== companyId) {
      throw new HttpError(400, `Project ${projectId} does not belong to company ${companyId}.`);
    }
    return project;
  };

  const ensureTaskIdsBelongToCompany = (taskIds: string[], companyId: string) => {
    taskIds.forEach((taskId) => {
      const task = store.getTaskById(taskId);
      if (!task || task.companyId !== companyId) {
        throw new HttpError(400, `Task ${taskId} does not belong to company ${companyId}.`);
      }
    });
  };

  const ensureLedgerAccountBelongsToCompany = (
    accountId: string | undefined,
    companyId: string,
  ) => {
    if (!accountId) return;
    const account = store.getLedgerAccountById(accountId);
    if (!account || account.companyId !== companyId) {
      throw new HttpError(
        400,
        `Ledger account ${accountId} does not belong to company ${companyId}.`,
      );
    }
  };

  const ensureSupplierBelongsToCompany = (
    supplierId: string | undefined,
    companyId: string,
  ) => {
    if (!supplierId) return undefined;
    const supplier = store.getSupplierById(supplierId);
    if (!supplier || supplier.companyId !== companyId) {
      throw new HttpError(400, `Supplier ${supplierId} does not belong to company ${companyId}.`);
    }
    return supplier;
  };

  const ensurePurchaseItemsBelongToCompany = (
    items: PurchaseOrderLineItem[],
    companyId: string,
  ) => {
    items.forEach((item, index) => {
      if (item.inventoryItemId) {
        const inventoryItem = store.getInventoryItemById(item.inventoryItemId);
        if (!inventoryItem || inventoryItem.companyId !== companyId) {
          throw new HttpError(
            400,
            `items[${index}].inventoryItemId does not belong to company ${companyId}.`,
          );
        }
      }
      if (item.sku) {
        const inventoryItem = store.getInventoryItemBySku(companyId, item.sku);
        if (!inventoryItem) {
          throw new HttpError(
            400,
            `items[${index}].sku does not exist in company ${companyId} inventory.`,
          );
        }
      }
    });
  };

  const ensureSalesItemsBelongToCompany = (
    items: SalesOrderLineItem[],
    companyId: string,
  ) => {
    items.forEach((item, index) => {
      if (!item.inventoryItemId && !item.sku) return;
      const inventoryItem = item.inventoryItemId
        ? store.getInventoryItemById(item.inventoryItemId)
        : item.sku
          ? store.getInventoryItemBySku(companyId, item.sku)
          : undefined;
      if (!inventoryItem || inventoryItem.companyId !== companyId) {
        throw new HttpError(
          400,
          `items[${index}] must reference inventory in company ${companyId}.`,
        );
      }
    });
  };

  const ensurePurchaseOrderBelongsToCompany = (purchaseOrderId: string | undefined, companyId: string) => {
    if (!purchaseOrderId) return undefined;
    const order = store.getPurchaseOrderById(purchaseOrderId);
    if (!order || order.companyId !== companyId) {
      throw new HttpError(
        400,
        `Purchase order ${purchaseOrderId} does not belong to company ${companyId}.`,
      );
    }
    return order;
  };

  const ensureJournalLinesBelongToCompany = (
    lines: JournalEntryLine[],
    companyId: string,
  ) => {
    lines.forEach((line, index) => {
      ensureLedgerAccountBelongsToCompany(line.accountId, companyId);
      if (line.debit < 0 || line.credit < 0) {
        throw new HttpError(
          400,
          `lines[${index}] must not contain negative debit or credit values.`,
        );
      }
    });

    const nonZeroLines = lines.filter((line) => line.debit > 0 || line.credit > 0);
    if (!nonZeroLines.length) {
      throw new HttpError(400, 'lines must contain at least one non-zero row.');
    }

    const totals = nonZeroLines.reduce(
      (acc, line) => ({
        debit: acc.debit + line.debit,
        credit: acc.credit + line.credit,
      }),
      { debit: 0, credit: 0 },
    );

    if (Math.abs(totals.debit - totals.credit) > 0.005) {
      throw new HttpError(400, 'Journal entry is unbalanced. Debits must equal credits.');
    }
  };

  const assertUserManagementPermission = (
    actor: SanitizedUser,
    assignments: CompanyRoleAssignment[],
  ) => {
    if (actor.isSuperAdmin) return;
    if (actor.role === 'Admin') return;
    const invalidCompany = assignments.find(
      (assignment) => !requireCompanyRole(actor, assignment.companyId, ['Admin', 'Manager']),
    );
    if (invalidCompany) {
      throw new HttpError(403, 'You can only manage users in companies you administer or manage.');
    }
    const elevatedAssignment = assignments.find(
      (assignment) =>
        assignment.role !== 'Employee'
        && !requireCompanyRole(actor, assignment.companyId, ['Admin']),
    );
    if (elevatedAssignment) {
      throw new HttpError(
        403,
        'Only company admins can assign Admin, Manager, or Accountant roles in that company.',
      );
    }
  };

  const parseUserPayload = (
    body: unknown,
    options: { partial?: boolean } = {},
  ): Partial<{
    name: string;
    email: string;
    role: UserRole;
    companyIds: string[];
    companyRoles: CompanyRoleAssignment[];
    positionId?: string;
    avatar?: string;
    password: string;
    isSuperAdmin?: boolean;
    commissionEligible?: boolean;
    defaultCommissionRate?: number;
    defaultCommissionBasis?: import('./types').CommissionBasis;
    costRatePerHour?: number;
  }> => {
    const record = asRecord(body, 'body');
    const partial = Boolean(options.partial);
    const companyRoles = record.companyRoles
      ? parseCompanyRoles(record.companyRoles)
      : undefined;
    const companyIds = record.companyIds
      ? stringArray(record.companyIds, 'companyIds')
      : companyRoles?.map((assignment) => assignment.companyId);
    const payload = {
      name: record.name !== undefined ? requiredString(record.name, 'name', { min: 2 }) : undefined,
      email: record.email !== undefined ? requiredString(record.email, 'email', { min: 3 }) : undefined,
      role: record.role !== undefined ? enumValue(record.role, 'role', userRoles) : undefined,
      companyIds,
      companyRoles,
      positionId: optionalString(record.positionId),
      avatar: optionalString(record.avatar),
      password:
        record.password !== undefined
          ? requiredString(record.password, 'password', { min: 6 })
          : partial
            ? undefined
            : defaultPassword(),
      isSuperAdmin:
        record.isSuperAdmin !== undefined
          ? Boolean(record.isSuperAdmin)
          : undefined,
      commissionEligible:
        record.commissionEligible !== undefined
          ? Boolean(record.commissionEligible)
          : undefined,
      defaultCommissionRate:
        record.defaultCommissionRate !== undefined
          ? optionalNumber(record.defaultCommissionRate) ?? undefined
          : undefined,
      defaultCommissionBasis:
        record.defaultCommissionBasis !== undefined
          ? (enumValue(record.defaultCommissionBasis, 'defaultCommissionBasis', commissionBases) as import('./types').CommissionBasis)
          : undefined,
      costRatePerHour:
        record.costRatePerHour !== undefined
          ? optionalNumber(record.costRatePerHour) ?? undefined
          : undefined,
    };

    if (!partial) {
      if (!payload.name || !payload.email || !payload.companyRoles?.length) {
        throw new HttpError(400, 'name, email, and companyRoles are required.');
      }
    }
    return payload;
  };

  const uploadedImage = (value: unknown, fieldName: string): string => {
    const image = String(value || '');
    if (!image) return '';
    if (!image.startsWith('data:image/')) {
      throw new HttpError(400, `${fieldName} must be an uploaded image.`);
    }
    if (image.length > 2_800_000) {
      throw new HttpError(400, `${fieldName} exceeds the 2 MB upload limit.`);
    }
    return image;
  };

  const parseProjectPayload = (body: unknown, options: { partial?: boolean } = {}) => {
    const record = asRecord(body, 'body');
    const partial = Boolean(options.partial);
    const payload = {
      name: record.name !== undefined ? requiredString(record.name, 'name', { min: 2 }) : undefined,
      description: record.description !== undefined ? optionalString(record.description) : undefined,
      color: record.color !== undefined ? optionalString(record.color) : undefined,
      companyId: record.companyId !== undefined ? requiredString(record.companyId, 'companyId') : undefined,
      visibility:
        record.visibility !== undefined
          ? enumValue(record.visibility, 'visibility', ['Public', 'Private'])
          : undefined,
      memberIds: record.memberIds !== undefined ? stringArray(record.memberIds, 'memberIds') : undefined,
      clientId: record.clientId !== undefined ? optionalString(record.clientId) : undefined,
    };
    if (!partial && (!payload.name || !payload.companyId || !payload.visibility)) {
      throw new HttpError(400, 'name, companyId, and visibility are required.');
    }
    return payload;
  };

  const parseTaskPayload = (body: unknown, options: { partial?: boolean } = {}) => {
    const record = asRecord(body, 'body');
    const partial = Boolean(options.partial);
    const payload = {
      title: record.title !== undefined ? requiredString(record.title, 'title', { min: 2 }) : undefined,
      description: record.description !== undefined ? optionalString(record.description) : undefined,
      status:
        record.status !== undefined
          ? enumValue(record.status, 'status', ['To Do', 'In Progress', 'Done'])
          : undefined,
      priority:
        record.priority !== undefined
          ? enumValue(record.priority, 'priority', ['Low', 'Medium', 'High'])
          : undefined,
      createdAt: record.createdAt !== undefined ? requiredDateInput(record.createdAt, 'createdAt') : undefined,
      dueDate: record.dueDate !== undefined ? optionalDateInput(record.dueDate) : undefined,
      assignedUserIds:
        record.assignedUserIds !== undefined
          ? stringArray(record.assignedUserIds, 'assignedUserIds')
          : undefined,
      tags: record.tags !== undefined ? stringArray(record.tags, 'tags') : undefined,
      companyId: record.companyId !== undefined ? requiredString(record.companyId, 'companyId') : undefined,
      projectId: record.projectId !== undefined ? requiredString(record.projectId, 'projectId') : undefined,
      color: record.color !== undefined ? optionalString(record.color) : undefined,
      dependencies:
        record.dependencies !== undefined ? stringArray(record.dependencies, 'dependencies') : undefined,
      parentTaskId: record.parentTaskId !== undefined ? optionalString(record.parentTaskId) : undefined,
      invoiceImage: record.invoiceImage !== undefined ? optionalString(record.invoiceImage) : undefined,
      invoiceVendor: record.invoiceVendor !== undefined ? optionalString(record.invoiceVendor) : undefined,
      invoiceNumber: record.invoiceNumber !== undefined ? optionalString(record.invoiceNumber) : undefined,
      invoiceAmount:
        record.invoiceAmount !== undefined ? optionalNumber(record.invoiceAmount) : undefined,
      invoiceDate: record.invoiceDate !== undefined ? optionalDateInput(record.invoiceDate) : undefined,
      generatedInvoiceId:
        record.generatedInvoiceId !== undefined ? optionalString(record.generatedInvoiceId) : undefined,
    };
    if (!partial && (!payload.title || !payload.priority || !payload.companyId)) {
      throw new HttpError(400, 'title, priority, and companyId are required.');
    }
    return payload;
  };

  const parseInvoicePayload = (body: unknown, options: { partial?: boolean } = {}) => {
    const record = asRecord(body, 'body');
    const partial = Boolean(options.partial);
    const payload = {
      invoiceNumber:
        record.invoiceNumber !== undefined
          ? requiredString(record.invoiceNumber, 'invoiceNumber')
          : undefined,
      companyId: record.companyId !== undefined ? requiredString(record.companyId, 'companyId') : undefined,
      clientId: record.clientId !== undefined ? requiredString(record.clientId, 'clientId') : undefined,
      contactId: record.contactId !== undefined ? optionalString(record.contactId) : undefined,
      salesOrderId: record.salesOrderId !== undefined ? optionalString(record.salesOrderId) : undefined,
      templateId: record.templateId !== undefined ? optionalString(record.templateId) : undefined,
      issueDate: record.issueDate !== undefined ? requiredDateInput(record.issueDate, 'issueDate') : undefined,
      dueDate: record.dueDate !== undefined ? requiredDateInput(record.dueDate, 'dueDate') : undefined,
      lineItems: record.lineItems !== undefined ? parseInvoiceLineItems(record.lineItems) : undefined,
      status:
        record.status !== undefined
          ? enumValue(record.status, 'status', invoiceStatuses)
          : undefined,
      notes: record.notes !== undefined ? optionalString(record.notes) : undefined,
      currency: record.currency !== undefined ? optionalString(record.currency) : undefined,
      taxRate: record.taxRate !== undefined ? optionalNumber(record.taxRate) : undefined,
      sentAt: record.sentAt !== undefined ? optionalDateInput(record.sentAt) : undefined,
      paidAt: record.paidAt !== undefined ? optionalDateInput(record.paidAt) : undefined,
    };
    if (
      !partial
      && (!payload.companyId || !payload.clientId || !payload.issueDate || !payload.dueDate || !payload.lineItems)
    ) {
      throw new HttpError(
        400,
        'companyId, clientId, issueDate, dueDate, and lineItems are required.',
      );
    }
    return payload;
  };

  const parseInvoiceTemplatePayload = (body: unknown, options: { partial?: boolean } = {}) => {
    const record = asRecord(body, 'body');
    const partial = Boolean(options.partial);
    const payload = {
      name: record.name !== undefined ? requiredString(record.name, 'name', { min: 2 }) : undefined,
      layout:
        record.layout !== undefined
          ? enumValue(record.layout, 'layout', invoiceTemplateLayouts)
          : undefined,
      isDefault: record.isDefault !== undefined ? optionalBoolean(record.isDefault) : undefined,
      primaryColor: record.primaryColor !== undefined ? requiredString(record.primaryColor, 'primaryColor') : undefined,
      accentColor: record.accentColor !== undefined ? requiredString(record.accentColor, 'accentColor') : undefined,
      logoUrl: record.logoUrl !== undefined ? optionalString(record.logoUrl) : undefined,
      headerImageUrl: record.headerImageUrl !== undefined ? optionalString(record.headerImageUrl) : undefined,
      footerImageUrl: record.footerImageUrl !== undefined ? optionalString(record.footerImageUrl) : undefined,
      letterheadPdfUrl:
        record.letterheadPdfUrl !== undefined ? optionalString(record.letterheadPdfUrl) : undefined,
      stampUrl: record.stampUrl !== undefined ? optionalString(record.stampUrl) : undefined,
      signatureUrl: record.signatureUrl !== undefined ? optionalString(record.signatureUrl) : undefined,
      signatureLabel: record.signatureLabel !== undefined ? optionalString(record.signatureLabel) : undefined,
      columns: record.columns !== undefined ? parseInvoiceColumns(record.columns) : undefined,
      bankAccounts: record.bankAccounts !== undefined ? parseBankAccounts(record.bankAccounts) : undefined,
      qrEnabled: record.qrEnabled !== undefined ? optionalBoolean(record.qrEnabled) : undefined,
      qrPosition:
        record.qrPosition !== undefined
          ? enumValue(record.qrPosition, 'qrPosition', ['left', 'center', 'right'] as const)
          : undefined,
      sectionBreaks: record.sectionBreaks !== undefined ? parseSectionBreaks(record.sectionBreaks) : undefined,
      doc: record.doc !== undefined ? (record.doc === null ? undefined : record.doc) : undefined,
      paymentInstructions:
        record.paymentInstructions !== undefined ? optionalString(record.paymentInstructions) : undefined,
      terms: record.terms !== undefined ? optionalString(record.terms) : undefined,
      footerNote: record.footerNote !== undefined ? optionalString(record.footerNote) : undefined,
      watermarkEnabled:
        record.watermarkEnabled !== undefined ? optionalBoolean(record.watermarkEnabled) : undefined,
      watermarkText: record.watermarkText !== undefined ? optionalString(record.watermarkText) : undefined,
      watermarkOpacity:
        record.watermarkOpacity !== undefined ? optionalNumber(record.watermarkOpacity) : undefined,
      showCompanyAddress:
        record.showCompanyAddress !== undefined ? optionalBoolean(record.showCompanyAddress) : undefined,
      showTaxId: record.showTaxId !== undefined ? optionalBoolean(record.showTaxId) : undefined,
    };
    if (
      !partial
      && (!payload.name || !payload.layout || !payload.primaryColor || !payload.accentColor)
    ) {
      throw new HttpError(400, 'name, layout, primaryColor, and accentColor are required.');
    }
    if (payload.doc !== undefined) {
      const docErrors = validateInvoiceDoc(payload.doc);
      if (docErrors.length > 0) {
        throw new HttpError(400, `Invalid invoice document: ${docErrors.join(' ')}`);
      }
    }
    if (!partial) return payload;
    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined),
    ) as typeof payload;
  };

  app.get(
    '/health',
    handler((_req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        seedOnEmpty: options.seedOnEmpty ?? process.env.SEED_ON_EMPTY !== 'false',
        allowSeedReset,
        migrations: store.getAppliedMigrationIds(),
      });
    }),
  );

  // Public, unauthenticated read-only view of an invoice (the QR code target).
  // Invoice ids are random UUIDs, so they're not enumerable.
  app.get(
    '/public/invoices/:id',
    handler((req, res) => {
      const invoice = store.getInvoiceById(req.params.id);
      if (!invoice) throw new HttpError(404, 'Invoice not found.');
      const companyRecord = store.getCompanyById(invoice.companyId);
      const templates = store.listInvoiceTemplates(invoice.companyId);
      // Prefer the snapshot frozen at issue time so the public copy never drifts
      // from what the customer was originally sent.
      const template =
        invoice.templateSnapshot ||
        (invoice.templateId ? store.getInvoiceTemplateById(invoice.templateId) : undefined) ||
        templates.find((t) => t.isDefault) ||
        templates[0] ||
        undefined;
      const client =
        (invoice.clientId ? store.getClientById(invoice.clientId) : undefined) ||
        (invoice.contactId ? store.getClientById(invoice.contactId) : undefined);
      res.json({
        invoice,
        template,
        company: companyRecord
          ? { id: companyRecord.id, name: companyRecord.name, address: companyRecord.address, logoUrl: companyRecord.logoUrl }
          : undefined,
        client: client
          ? { id: client.id, name: client.name, address: client.address, email: client.email }
          : undefined,
      });
    }),
  );

  app.get(
    '/invoices/:id/pdf',
    authMiddleware,
    handler(async (req, res) => {
      const invoice = store.getInvoiceById(req.params.id);
      if (!invoice) throw new HttpError(404, 'Invoice not found.');
      requireCompanyAccess(req, invoice.companyId);

      // Page geometry follows the frozen template's document settings when present.
      const docPage = (invoice.templateSnapshot as any)?.doc?.page as
        | { size?: string; orientation?: string }
        | undefined;
      const format: 'A4' | 'Letter' = docPage?.size === 'Letter' ? 'Letter' : 'A4';
      const landscape = docPage?.orientation === 'landscape';

      // Render the same public page a customer would see (snapshot-aware, no auth).
      // Forward the caller's language so the PDF matches the on-screen language/RTL.
      const appUrl = (process.env.APP_PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
      const lang = typeof req.query.lang === 'string' && /^[a-z-]{2,8}$/i.test(req.query.lang) ? req.query.lang : '';
      const url = `${appUrl}/invoice/${invoice.id}${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`;

      let pdf: Buffer;
      try {
        pdf = await renderInvoicePdf({ url, format, landscape });
      } catch (err) {
        throw new HttpError(
          503,
          'PDF rendering is unavailable. Ensure APP_PUBLIC_URL points to the running app and Chromium is installed.',
        );
      }

      const safeNumber = invoice.invoiceNumber.replace(/[^a-zA-Z0-9._-]+/g, '-');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Invoice-${safeNumber}.pdf"`);
      res.setHeader('Content-Length', pdf.length);
      res.end(pdf);
    }),
  );

  app.post(
    '/auth/login',
    handler((req, res) => {
      const body = asRecord(req.body, 'body');
      const email = requiredString(body.email, 'email', { min: 3 });
      const password = requiredString(body.password, 'password', { min: 1 });
      const user = store.findUserByEmail(email);
      if (!user || user.password !== password) {
        throw new HttpError(401, 'Invalid credentials.');
      }
      const token = store.issueToken(user.id);
      res.json({ token, user: store.sanitizeUser(user) });
    }),
  );

  app.post('/auth/logout', (req, res) => {
    const header = req.headers.authorization;
    if (header) {
      const token = header.replace('Bearer ', '').trim();
      store.revokeToken(token);
    }
    res.json({ success: true });
  });

  app.get(
    '/auth/me',
    authMiddleware,
    handler((req, res) => {
      res.json({ user: req.user });
    }),
  );

  app.put(
    '/auth/me',
    authMiddleware,
    handler((req, res) => {
      const body = asRecord(req.body, 'body');
      const user = store.updateUser(req.user!.id, {
        name: body.name !== undefined ? requiredString(body.name, 'name', { min: 2 }) : undefined,
        avatar: body.avatar !== undefined ? uploadedImage(body.avatar, 'avatar') : undefined,
      });
      if (!user) throw new HttpError(404, 'User not found.');
      res.json({ user });
    }),
  );

  // ─── Admin / super-user panel ────────────────────────────────────────────

  app.get('/admin/overview', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    res.json(store.getAdminOverview());
  }));

  app.get('/admin/companies', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    res.json(store.listAdminCompanies());
  }));

  app.get('/admin/users', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    res.json(store.listAdminUsers());
  }));

  app.get('/admin/activity', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    const q = req.query as Record<string, string | undefined>;
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    if (from && Number.isNaN(from.getTime())) throw new HttpError(400, 'Invalid from date');
    if (to && Number.isNaN(to.getTime())) throw new HttpError(400, 'Invalid to date');
    res.json(store.listAdminActivity({
      companyId: q.companyId || undefined,
      entityType: q.entityType || undefined,
      actorUserId: q.actorUserId || undefined,
      action: q.action || undefined,
      from,
      to,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    }));
  }));

  app.get('/admin/health', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    res.json(store.getAdminHealth());
  }));

  // Tools
  app.post('/admin/tools/sweep-overdue-all', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    res.json({ created: store.sweepOverdueInvoiceFollowupsAll() });
  }));

  app.post('/admin/tools/recompute-commissions-all', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    res.json({ recomputed: store.recomputeCommissionsAll() });
  }));

  app.post('/admin/tools/refresh-invoice-statuses', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    res.json({ refreshed: store.refreshAllInvoiceStatuses() });
  }));

  app.get('/admin/tools/backup', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    const bytes = store.readDatabaseFile();
    if (!bytes) throw new HttpError(500, 'Could not read database file.');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="taskflow-${stamp}.db"`);
    res.send(bytes);
  }));

  // Impersonation — Admin steps into another user's session.
  // Frontend stores the original admin token in localStorage and swaps to
  // the returned token; "Exit" restores the original token client-side.
  app.post('/admin/impersonate/:userId', authMiddleware, handler((req, res) => {
    requireSuperAdmin(req);
    const target = store.getUserById(req.params.userId);
    if (!target) throw new HttpError(404, 'User not found.');
    const token = store.issueToken(target.id);
    // Audit
    store.createActivityEvent({
      companyId: target.companyIds[0] ?? 'system',
      entityType: 'contact',     // no admin entity type; piggyback on contact
      entityId: target.id,
      action: 'admin_impersonate_start',
      summary: `Admin ${req.user!.name} started impersonating ${target.name}.`,
      metadata: { adminUserId: req.user!.id, targetUserId: target.id },
    });
    res.json({ token, user: target });
  }));

  app.get(
    '/companies',
    authMiddleware,
    handler((req, res) => {
      const companies = store.listCompanies();
      if (req.user!.isSuperAdmin) {
        return res.json(companies);
      }
      const accessible = new Set(getAccessibleCompanyIds(req.user!));
      res.json(companies.filter((company) => accessible.has(company.id)));
    }),
  );

  app.get(
    '/companies/:id',
    authMiddleware,
    handler((req, res) => {
      requireCompanyAccess(req, req.params.id);
      const company = store.getCompanyById(req.params.id);
      if (!company) throw new HttpError(404, 'Company not found.');
      res.json(company);
    }),
  );

  app.post(
    '/companies',
    authMiddleware,
    handler((req, res) => {
      requireSuperAdmin(req);
      const body = asRecord(req.body, 'body');
      const company = store.createCompany({
        name: requiredString(body.name, 'name', { min: 2 }),
        website: optionalString(body.website),
        address: optionalString(body.address),
        logoUrl: optionalString(body.logoUrl),
      });
      res.status(201).json(company);
    }),
  );

  app.put(
    '/companies/:id',
    authMiddleware,
    handler((req, res) => {
      requireSuperAdmin(req);
      const body = asRecord(req.body, 'body');
      const company = store.updateCompany(req.params.id, {
        name: body.name !== undefined ? requiredString(body.name, 'name', { min: 2 }) : undefined,
        website: body.website !== undefined ? String(body.website || '') : undefined,
        address: body.address !== undefined ? String(body.address || '') : undefined,
        logoUrl: body.logoUrl !== undefined ? uploadedImage(body.logoUrl, 'logoUrl') : undefined,
      });
      if (!company) throw new HttpError(404, 'Company not found.');
      res.json(company);
    }),
  );

  app.delete(
    '/companies/:id',
    authMiddleware,
    handler((req, res) => {
      requireSuperAdmin(req);
      const cascade = req.query.cascade === 'true' || req.query.cascade === '1';
      store.deleteCompany(req.params.id, { cascade });
      res.json({ success: true });
    }),
  );

  app.get(
    '/companies/:companyId/numbering-settings',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager']);
      res.json(store.listCompanyNumberingSettings(req.params.companyId));
    }),
  );

  app.put(
    '/companies/:companyId/numbering-settings/:entityType',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager']);
      const entityType = enumValue(
        req.params.entityType,
        'entityType',
        numberingEntityTypes,
      ) as NumberingEntityType;
      const body = asRecord(req.body, 'body');
      try {
        const setting = store.updateCompanyNumberingSetting(req.params.companyId, entityType, {
          prefix: body.prefix !== undefined ? requiredString(body.prefix, 'prefix') : undefined,
          padLength: body.padLength !== undefined ? requiredNumber(body.padLength, 'padLength') : undefined,
          nextNumber: body.nextNumber !== undefined ? requiredNumber(body.nextNumber, 'nextNumber') : undefined,
        });
        res.json(setting);
      } catch (error: any) {
        throw new HttpError(400, error?.message || 'Could not update numbering setting.');
      }
    }),
  );

  app.get(
    '/companies/:companyId/finance/settings',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.getCompanyFinanceSettings(req.params.companyId));
    }),
  );

  app.put(
    '/companies/:companyId/finance/settings',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager']);
      const body = asRecord(req.body, 'body');
      const lockedThroughDate =
        body.lockedThroughDate === null
          ? null
          : body.lockedThroughDate !== undefined
            ? new Date(requiredDateInput(body.lockedThroughDate, 'lockedThroughDate'))
            : undefined;
      try {
        res.json(
          store.updateCompanyFinanceSettings(req.params.companyId, {
            fiscalYearStartMonth:
              body.fiscalYearStartMonth !== undefined
                ? requiredNumber(body.fiscalYearStartMonth, 'fiscalYearStartMonth')
                : undefined,
            lockedThroughDate,
            currencyCode:
              body.currencyCode !== undefined
                ? requiredString(body.currencyCode, 'currencyCode', { min: 3 })
                : undefined,
          }),
        );
      } catch (error: any) {
        throw new HttpError(400, error?.message || 'Could not update finance settings.');
      }
    }),
  );

  app.get(
    '/companies/:companyId/invoice-templates',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listInvoiceTemplates(req.params.companyId));
    }),
  );

  app.post(
    '/companies/:companyId/invoice-templates',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const payload = parseInvoiceTemplatePayload(req.body);
      try {
        res.status(201).json(
          store.createInvoiceTemplate({
            companyId: req.params.companyId,
            name: payload.name!,
            layout: payload.layout!,
            isDefault: payload.isDefault ?? false,
            primaryColor: payload.primaryColor!,
            accentColor: payload.accentColor!,
            logoUrl: payload.logoUrl,
            headerImageUrl: payload.headerImageUrl,
            footerImageUrl: payload.footerImageUrl,
            letterheadPdfUrl: payload.letterheadPdfUrl,
            stampUrl: payload.stampUrl,
            signatureUrl: payload.signatureUrl,
            signatureLabel: payload.signatureLabel,
            columns: payload.columns,
            bankAccounts: payload.bankAccounts,
            qrEnabled: payload.qrEnabled ?? true,
            qrPosition: payload.qrPosition ?? 'center',
            sectionBreaks: payload.sectionBreaks,
            doc: payload.doc,
            paymentInstructions: payload.paymentInstructions,
            terms: payload.terms,
            footerNote: payload.footerNote,
            watermarkEnabled: payload.watermarkEnabled ?? false,
            watermarkText: payload.watermarkText,
            watermarkOpacity: payload.watermarkOpacity,
            showCompanyAddress: payload.showCompanyAddress ?? true,
            showTaxId: payload.showTaxId ?? true,
          }),
        );
      } catch (error: any) {
        throw new HttpError(400, error?.message || 'Could not create invoice template.');
      }
    }),
  );

  app.put(
    '/invoice-templates/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getInvoiceTemplateById(req.params.id);
      if (!existing) throw new HttpError(404, 'Invoice template not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      const payload = parseInvoiceTemplatePayload(req.body, { partial: true });
      try {
        const updated = store.updateInvoiceTemplate(req.params.id, payload);
        if (!updated) throw new HttpError(404, 'Invoice template not found.');
        res.json(updated);
      } catch (error: any) {
        throw new HttpError(400, error?.message || 'Could not update invoice template.');
      }
    }),
  );

  app.delete(
    '/invoice-templates/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getInvoiceTemplateById(req.params.id);
      if (!existing) throw new HttpError(404, 'Invoice template not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      try {
        store.deleteInvoiceTemplate(req.params.id);
        res.json({ success: true });
      } catch (error: any) {
        throw new HttpError(400, error?.message || 'Could not delete invoice template.');
      }
    }),
  );

  app.get(
    '/positions',
    authMiddleware,
    handler((req, res) => {
      requireAdmin(req);
      res.json(store.listPositions());
    }),
  );

  app.get(
    '/positions/:id',
    authMiddleware,
    handler((req, res) => {
      requireAdmin(req);
      const position = store.getPositionById(req.params.id);
      if (!position) throw new HttpError(404, 'Position not found.');
      res.json(position);
    }),
  );

  app.post(
    '/positions',
    authMiddleware,
    handler((req, res) => {
      requireAdmin(req);
      const body = asRecord(req.body, 'body');
      const position = store.createPosition({
        title: requiredString(body.title, 'title', { min: 2 }),
        companyId: optionalString(body.companyId),
      });
      res.status(201).json(position);
    }),
  );

  app.delete(
    '/positions/:id',
    authMiddleware,
    handler((req, res) => {
      requireAdmin(req);
      store.deletePosition(req.params.id);
      res.json({ success: true });
    }),
  );

  app.get(
    '/users',
    authMiddleware,
    handler((req, res) => {
      requireAdmin(req);
      res.json(store.listUsers());
    }),
  );

  app.get(
    '/users/:id',
    authMiddleware,
    handler((req, res) => {
      if (req.user!.role !== 'Admin' && req.user!.id !== req.params.id) {
        throw new HttpError(403, 'You do not have permission to view this user.');
      }
      const user = store.getUserById(req.params.id);
      if (!user) throw new HttpError(404, 'User not found.');
      res.json(user);
    }),
  );

  app.get(
    '/companies/:companyId/users',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager']);
      res.json(store.getUsersByCompany(req.params.companyId));
    }),
  );

  app.post(
    '/users',
    authMiddleware,
    handler(async (req, res) => {
      const payload = parseUserPayload(req.body);
      assertUserManagementPermission(req.user!, payload.companyRoles!);
      // Only an existing super-admin may grant the super-admin flag.
      const isSuperAdmin =
        payload.isSuperAdmin === true && req.user?.isSuperAdmin === true
          ? true
          : false;
      const user = store.createUser({
        id: optionalString(asRecord(req.body, 'body').id),
        name: payload.name!,
        email: payload.email!,
        password: payload.password!,
        companyIds: payload.companyIds!,
        companyRoles: payload.companyRoles!,
        role: payload.role || payload.companyRoles![0].role,
        positionId: payload.positionId,
        avatar: payload.avatar,
        isSuperAdmin,
        commissionEligible: payload.commissionEligible,
        defaultCommissionRate: payload.defaultCommissionRate,
        defaultCommissionBasis: payload.defaultCommissionBasis,
        costRatePerHour: payload.costRatePerHour,
      });
      sendWelcomeEmail({
        to: user.email,
        name: user.name,
        password: payload.password!,
      }).catch((error) => logger.error('Failed to send welcome email', error));
      res.status(201).json({ user });
    }),
  );

  app.put(
    '/users/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getUserById(req.params.id);
      if (!existing) throw new HttpError(404, 'User not found.');
      const payload = parseUserPayload(req.body, { partial: true });
      const existingAssignments =
        existing.companyRoles
        || existing.companyIds.map((companyId) => ({
          companyId,
          role: existing.role,
          positionId: existing.positionId,
        }));
      const targetAssignments =
        payload.companyRoles
        || existingAssignments;
      if (req.user!.role === 'Admin' || req.user!.isSuperAdmin) {
        // Super-admins have role 'Employee' but full user-management power via
        // the isSuperAdmin flag, so route them through the simple check (which
        // early-returns) instead of the per-company branch below.
        assertUserManagementPermission(req.user!, targetAssignments);
      } else {
        const existingByCompany = new Map(
          existingAssignments.map((assignment) => [assignment.companyId, assignment]),
        );
        const targetByCompany = new Map(
          targetAssignments.map((assignment) => [assignment.companyId, assignment]),
        );
        const canManageAssignment = (companyId: string) =>
          requireCompanyRole(req.user!, companyId, ['Admin', 'Manager']);
        const changedAssignments = targetAssignments.filter((assignment) => {
          const existingAssignment = existingByCompany.get(assignment.companyId);
          return (
            canManageAssignment(assignment.companyId) &&
            (
              !existingAssignment ||
              existingAssignment.role !== assignment.role ||
              existingAssignment.positionId !== assignment.positionId
            )
          );
        });
        const unmanagedTargetChange = targetAssignments.find((assignment) => {
          if (canManageAssignment(assignment.companyId)) return false;
          const existingAssignment = existingByCompany.get(assignment.companyId);
          return (
            !existingAssignment ||
            existingAssignment.role !== assignment.role ||
            existingAssignment.positionId !== assignment.positionId
          );
        });
        const unmanagedRemoval = existingAssignments.find(
          (assignment) =>
            !canManageAssignment(assignment.companyId) &&
            !targetByCompany.has(assignment.companyId),
        );
        if (unmanagedTargetChange || unmanagedRemoval) {
          throw new HttpError(403, 'You can only change user assignments in companies you administer or manage.');
        }
        const assignmentsToAuthorize =
          changedAssignments.length > 0
            ? changedAssignments
            : targetAssignments.filter((assignment) => canManageAssignment(assignment.companyId));
        if (!assignmentsToAuthorize.length) {
          throw new HttpError(403, 'You can only manage users in companies you administer or manage.');
        }
        assertUserManagementPermission(req.user!, assignmentsToAuthorize);
      }
      // isSuperAdmin can only be toggled by an existing super-admin.
      // For non-super-admin callers, drop the field entirely from the patch.
      const safePayload = req.user?.isSuperAdmin === true
        ? payload
        : { ...payload, isSuperAdmin: undefined };
      const updated = store.updateUser(req.params.id, {
        ...safePayload,
        companyIds: payload.companyIds || targetAssignments.map((assignment) => assignment.companyId),
        companyRoles: targetAssignments,
        role: payload.role || targetAssignments[0]?.role || existing.role,
      });
      if (!updated) throw new HttpError(404, 'User not found.');
      res.json(updated);
    }),
  );

  app.delete(
    '/users/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getUserById(req.params.id);
      if (!existing) throw new HttpError(404, 'User not found.');
      const targetAssignments =
        existing.companyRoles
        || existing.companyIds.map((companyId) => ({
          companyId,
          role: existing.role,
          positionId: existing.positionId,
        }));
      assertUserManagementPermission(req.user!, targetAssignments);
      store.deleteUser(req.params.id);
      res.json({ success: true });
    }),
  );

  app.get(
    '/projects',
    authMiddleware,
    handler((req, res) => {
      const accessible = new Set(getAccessibleCompanyIds(req.user!));
      res.json(
        store
          .listProjects()
          .filter(
            (project) =>
              accessible.has(project.companyId) && canViewProject(req.user!, project),
          ),
      );
    }),
  );

  app.get(
    '/projects/:id',
    authMiddleware,
    handler((req, res) => {
      const project = store.getProjectById(req.params.id);
      if (!project) throw new HttpError(404, 'Project not found.');
      requireProjectViewAccess(req, project);
      res.json(project);
    }),
  );

  app.post(
    '/projects',
    authMiddleware,
    handler((req, res) => {
      const payload = parseProjectPayload(req.body);
      requireCompanyRoles(req, payload.companyId!, ['Admin', 'Manager']);
      ensureUsersBelongToCompany(payload.memberIds || [], payload.companyId!, 'memberIds');
      ensureClientBelongsToCompany(payload.clientId, payload.companyId!);
      const project = withActor(req, () =>
        store.createProject({
          name: payload.name!,
          description: payload.description || '',
          color: payload.color || '',
          companyId: payload.companyId!,
          visibility: payload.visibility!,
          memberIds: payload.memberIds || [],
          clientId: payload.clientId,
        }),
      );
      res.status(201).json(project);
    }),
  );

  app.put(
    '/projects/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getProjectById(req.params.id);
      if (!existing) throw new HttpError(404, 'Project not found.');
      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager']);
      const payload = parseProjectPayload(req.body, { partial: true });
      if (payload.companyId && payload.companyId !== existing.companyId) {
        requireCompanyRoles(req, payload.companyId, ['Admin', 'Manager']);
      }
      const targetCompanyId = payload.companyId || existing.companyId;
      const targetMemberIds = payload.memberIds ?? existing.memberIds ?? [];
      const targetClientId = payload.clientId !== undefined ? payload.clientId : existing.clientId;
      ensureUsersBelongToCompany(targetMemberIds, targetCompanyId, 'memberIds');
      ensureClientBelongsToCompany(targetClientId, targetCompanyId);
      const project = withActor(req, () => store.updateProject(req.params.id, payload));
      if (!project) throw new HttpError(404, 'Project not found.');
      res.json(project);
    }),
  );

  app.delete(
    '/projects/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getProjectById(req.params.id);
      if (!existing) throw new HttpError(404, 'Project not found.');
      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager']);
      store.deleteProject(req.params.id);
      res.json({ success: true });
    }),
  );

  app.post(
    '/projects/:id/members',
    authMiddleware,
    handler((req, res) => {
      const project = store.getProjectById(req.params.id);
      if (!project) throw new HttpError(404, 'Project not found.');
      requireCompanyRoles(req, project.companyId, ['Admin', 'Manager']);
      const body = asRecord(req.body, 'body');
      const userId = requiredString(body.userId, 'userId');
      ensureUsersBelongToCompany([userId], project.companyId, 'userId');
      const updated = withActor(req, () => store.addProjectMember(req.params.id, userId));
      if (!updated) throw new HttpError(404, 'Project not found.');
      res.json(updated);
    }),
  );

  app.delete(
    '/projects/:id/members/:userId',
    authMiddleware,
    handler((req, res) => {
      const project = store.getProjectById(req.params.id);
      if (!project) throw new HttpError(404, 'Project not found.');
      requireCompanyRoles(req, project.companyId, ['Admin', 'Manager']);
      ensureUsersBelongToCompany([req.params.userId], project.companyId, 'userId');
      const updated = withActor(req, () => store.removeProjectMember(req.params.id, req.params.userId));
      if (!updated) throw new HttpError(404, 'Project not found.');
      res.json(updated);
    }),
  );

  app.get(
    '/tasks',
    authMiddleware,
    handler((req, res) => {
      const accessible = new Set(getAccessibleCompanyIds(req.user!));
      res.json(
        store
          .listTasks()
          .filter((task) => accessible.has(task.companyId))
          .filter((task) => canViewTask(req.user!, task)),
      );
    }),
  );

  app.get(
    '/tasks/:id',
    authMiddleware,
    handler((req, res) => {
      const task = store.getTaskById(req.params.id);
      if (!task) throw new HttpError(404, 'Task not found.');
      requireTaskViewAccess(req, task);
      res.json(task);
    }),
  );

  app.get(
    '/companies/:companyId/clients/:clientId/tasks',
    authMiddleware,
    handler((req, res) => {
      requireCompanyAccess(req, req.params.companyId);
      res.json(
        store
          .getTasksByClient(req.params.companyId, req.params.clientId)
          .filter((task) => {
            const project = store.getProjectById(task.projectId);
            return Boolean(project && canViewProject(req.user!, project));
          }),
      );
    }),
  );

  app.post(
    '/tasks',
    authMiddleware,
    handler((req, res) => {
      const payload = parseTaskPayload(req.body);
      requireCompanyAccess(req, payload.companyId!);
      if (payload.projectId) {
        ensureProjectBelongsToCompany(payload.projectId, payload.companyId!);
      }
      ensureUsersBelongToCompany(payload.assignedUserIds || [], payload.companyId!, 'assignedUserIds');
      ensureTaskIdsBelongToCompany(payload.dependencies || [], payload.companyId!);
      const task = withActor(req, () =>
        store.createTask({
          title: payload.title!,
          description: payload.description || '',
          status: payload.status || 'To Do',
          priority: payload.priority!,
          createdAt: payload.createdAt ? new Date(payload.createdAt) : new Date(),
          dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
          assignedUserIds: payload.assignedUserIds || [],
          tags: payload.tags || [],
          companyId: payload.companyId!,
          projectId: payload.projectId ?? '',
          color: payload.color,
          dependencies: payload.dependencies || [],
          parentTaskId: payload.parentTaskId,
          invoiceImage: payload.invoiceImage,
          invoiceVendor: payload.invoiceVendor,
          invoiceNumber: payload.invoiceNumber,
          invoiceAmount: payload.invoiceAmount,
          invoiceDate: payload.invoiceDate ? new Date(payload.invoiceDate) : undefined,
          generatedInvoiceId: payload.generatedInvoiceId,
        }),
      );
      res.status(201).json(task);
    }),
  );

  app.put(
    '/tasks/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getTaskById(req.params.id);
      if (!existing) throw new HttpError(404, 'Task not found.');
      requireCompanyAccess(req, existing.companyId);
      const payload = parseTaskPayload(req.body, { partial: true });
      const targetCompanyId = payload.companyId || existing.companyId;
      const targetProjectId = payload.projectId || existing.projectId;
      if (targetCompanyId !== existing.companyId) {
        requireCompanyAccess(req, targetCompanyId);
      }
      const targetAssignedUserIds = payload.assignedUserIds ?? existing.assignedUserIds ?? [];
      const targetDependencies = payload.dependencies ?? existing.dependencies ?? [];
      if (targetProjectId) {
        ensureProjectBelongsToCompany(targetProjectId, targetCompanyId);
      }
      ensureUsersBelongToCompany(
        targetAssignedUserIds,
        targetCompanyId,
        'assignedUserIds',
      );
      ensureTaskIdsBelongToCompany(targetDependencies, targetCompanyId);
      const task = withActor(req, () =>
        store.updateTask(req.params.id, {
          ...payload,
          createdAt: payload.createdAt ? new Date(payload.createdAt) : undefined,
          dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
          invoiceDate: payload.invoiceDate ? new Date(payload.invoiceDate) : undefined,
        }),
      );
      if (!task) throw new HttpError(404, 'Task not found.');
      res.json(task);
    }),
  );

  app.post(
    '/tasks/mark-invoiced',
    authMiddleware,
    handler((req, res) => {
      const body = asRecord(req.body, 'body');
      const taskIds = stringArray(body.taskIds, 'taskIds');
      const invoiceId = requiredString(body.invoiceId, 'invoiceId');
      const tasks = taskIds.map((taskId) => {
        const task = store.getTaskById(taskId);
        if (!task) throw new HttpError(404, `Task ${taskId} not found.`);
        requireCompanyAccess(req, task.companyId);
        return task;
      });
      const companyIds = new Set(tasks.map((task) => task.companyId));
      if (companyIds.size > 1) {
        throw new HttpError(400, 'All tasks must belong to the same company.');
      }
      const companyId = tasks[0]?.companyId;
      const invoice = store.getInvoiceById(invoiceId);
      if (!invoice || !companyId || invoice.companyId !== companyId) {
        throw new HttpError(400, 'Invoice must exist and belong to the same company as the tasks.');
      }
      withActor(req, () => store.markTasksAsInvoiced(taskIds, invoiceId));
      res.json({ success: true });
    }),
  );

  app.get(
    '/tasks/:taskId/comments',
    authMiddleware,
    handler((req, res) => {
      const task = store.getTaskById(req.params.taskId);
      if (!task) throw new HttpError(404, 'Task not found.');
      requireTaskViewAccess(req, task);
      res.json(store.listCommentsByTask(req.params.taskId));
    }),
  );

  app.post(
    '/tasks/:taskId/comments',
    authMiddleware,
    handler((req, res) => {
      const task = store.getTaskById(req.params.taskId);
      if (!task) throw new HttpError(404, 'Task not found.');
      requireCompanyAccess(req, task.companyId);
      const body = asRecord(req.body, 'body');
      const comment = store.createComment({
        taskId: req.params.taskId,
        userId: req.user!.id,
        content: requiredString(body.content, 'content', { min: 1 }),
      });
      res.status(201).json(comment);
    }),
  );

  // ─── Contacts ────────────────────────────────────────────────────────────

	  app.get(
	    '/companies/:companyId/contacts',
	    authMiddleware,
	    handler((req, res) => {
	      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
	      const role = req.query.role as string | undefined;
	      const effectiveRole = getEffectiveRole(req.user!, req.params.companyId);
	      const viewer = { userId: req.user!.id, role: effectiveRole ?? 'Employee' };
	      const contacts = store.listContacts(req.params.companyId, role as any, viewer);
	      res.json(contacts);
	    }),
	  );

  app.post(
    '/companies/:companyId/contacts',
    authMiddleware,
    handler((req, res) => {
	      const { companyId } = req.params;
	      requireCompanyRoles(req, companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
	      const body = asRecord(req.body, 'body');
	      const effectiveRole = getEffectiveRole(req.user!, companyId);
	      const contact = store.createContact({
        companyId,
        kind: (optionalString(body.kind) as any) ?? 'Organization',
        name: requiredString(body.name, 'name'),
        legalName: optionalString(body.legalName),
        contactPerson: optionalString(body.contactPerson),
        email: optionalString(body.email),
        phone: optionalString(body.phone),
        address: optionalString(body.address),
        taxNumber: optionalString(body.taxNumber),
		        tags: Array.isArray(body.tags) ? body.tags : undefined,
		        notes: optionalString(body.notes),
		        roles: Array.isArray(body.roles) ? body.roles : undefined,
		        leadStatus: body.leadStatus !== undefined ? enumValue(body.leadStatus, 'leadStatus', leadStatuses) : undefined,
		        leadSource: body.leadSource !== undefined ? enumValue(body.leadSource, 'leadSource', leadSources) : undefined,
		        priority: body.priority !== undefined ? enumValue(body.priority, 'priority', contactPriorities) : undefined,
		        ownerUserId: effectiveRole === 'Employee' ? req.user!.id : optionalString(body.ownerUserId),
		        ownerName: effectiveRole === 'Employee' ? req.user!.name : optionalString(body.ownerName),
		        nextFollowupDate: body.nextFollowupDate ? new Date(optionalDateInput(body.nextFollowupDate)!) : undefined,
		        nextFollowupNote: optionalString(body.nextFollowupNote),
		        influencerPlatform: optionalString(body.influencerPlatform),
	        influencerHandle: optionalString(body.influencerHandle),
	        influencerNiche: optionalString(body.influencerNiche),
	        followerCount: optionalNumber(body.followerCount),
	        engagementRate: optionalNumber(body.engagementRate),
	        rateCardAmount: optionalNumber(body.rateCardAmount),
	        location: optionalString(body.location),
	        languages: Array.isArray(body.languages) ? body.languages.map((item, index) => requiredString(item, `languages[${index}]`)) : undefined,
	        availabilityStatus: optionalString(body.availabilityStatus),
	        influencerAccounts: parseInfluencerAccounts(body.influencerAccounts),
	      });
      res.status(201).json(contact);
    }),
  );

  app.get(
    '/contacts/:id',
    authMiddleware,
    handler((req, res) => {
      const contact = store.getContactById(req.params.id);
      if (!contact) { res.status(404).json({ error: 'Not found' }); return; }
      requireCompanyRoles(req, contact.companyId, companyManagementRoles);
      res.json(contact);
    }),
  );

  app.put(
    '/contacts/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getContactById(req.params.id);
      if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const contact = store.updateContact(req.params.id, {
        kind: optionalString(body.kind) as any,
        name: optionalString(body.name),
        legalName: optionalString(body.legalName),
        contactPerson: optionalString(body.contactPerson),
        email: optionalString(body.email),
        phone: optionalString(body.phone),
        address: optionalString(body.address),
        taxNumber: optionalString(body.taxNumber),
	        tags: Array.isArray(body.tags) ? body.tags : undefined,
	        notes: optionalString(body.notes),
	        influencerPlatform: body.influencerPlatform !== undefined ? optionalString(body.influencerPlatform) : undefined,
	        influencerHandle: body.influencerHandle !== undefined ? optionalString(body.influencerHandle) : undefined,
	        influencerNiche: body.influencerNiche !== undefined ? optionalString(body.influencerNiche) : undefined,
	        followerCount: body.followerCount !== undefined ? optionalNumber(body.followerCount) : undefined,
	        engagementRate: body.engagementRate !== undefined ? optionalNumber(body.engagementRate) : undefined,
	        rateCardAmount: body.rateCardAmount !== undefined ? optionalNumber(body.rateCardAmount) : undefined,
	        location: body.location !== undefined ? optionalString(body.location) : undefined,
	        languages: body.languages !== undefined
	          ? requiredArray(body.languages, 'languages').map((item, index) => requiredString(item, `languages[${index}]`))
	          : undefined,
	        availabilityStatus: body.availabilityStatus !== undefined ? optionalString(body.availabilityStatus) : undefined,
	        influencerAccounts: body.influencerAccounts !== undefined ? parseInfluencerAccounts(body.influencerAccounts) : undefined,
	      });
      res.json(contact);
    }),
  );

  app.post(
    '/contacts/:id/roles',
    authMiddleware,
    handler((req, res) => {
      const contact = store.getContactById(req.params.id);
      if (!contact) { res.status(404).json({ error: 'Not found' }); return; }
      requireCompanyRoles(req, contact.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const role = requiredString(body.role, 'role') as any;
      store.addContactRole(req.params.id, contact.companyId, role, 'Manual');
      res.json(store.getContactById(req.params.id));
    }),
  );

  /**
   * Contact 360° summary — all records linked to a contact, used by the
   * WhatsApp inbox detail panel and contact pages. Read-only.
   */
  app.get(
    '/contacts/:id/summary',
    authMiddleware,
    handler((req, res) => {
      const contact = store.getContactById(req.params.id);
      if (!contact) throw new HttpError(404, 'Contact not found.');
      requireCompanyRoles(req, contact.companyId, [
        'Admin',
        'Manager',
        'Accountant',
        'Employee',
      ]);
      const companyId = contact.companyId;
      const linkedClientId = contact.clientId;
      const linkedSupplierId = contact.supplierId;

      const invoices = store
        .listInvoices(companyId)
        .filter(
          (inv) =>
            inv.contactId === contact.id ||
            (linkedClientId && inv.clientId === linkedClientId),
        );
      const salesOrders = store
        .listSalesOrders(companyId)
        .filter(
          (order) =>
            order.contactId === contact.id ||
            (linkedClientId && order.clientId === linkedClientId),
        );
      const purchaseOrders = linkedSupplierId
        ? store
            .listPurchaseOrders(companyId)
            .filter((po) => po.supplierId === linkedSupplierId)
        : [];
      const vendorBills = linkedSupplierId
        ? store
            .listVendorBills(companyId)
            .filter((bill) => bill.supplierId === linkedSupplierId)
        : [];
      const opportunities = store
        .listOpportunities(companyId)
        .filter((opp) => opp.contactId === contact.id);
      const projects = linkedClientId
        ? store
            .listProjects()
            .filter(
              (project) =>
                project.companyId === companyId && project.clientId === linkedClientId,
            )
        : [];

      const totals = {
        invoiceCount: invoices.length,
        invoiceOutstanding: invoices.reduce(
          (sum, inv) => sum + (inv.outstandingAmount || 0),
          0,
        ),
        invoiceTotal: invoices.reduce((sum, inv) => sum + (inv.total || 0), 0),
        salesOrderCount: salesOrders.length,
        salesOrderTotal: salesOrders.reduce(
          (sum, so) => sum + (so.totalAmount || 0),
          0,
        ),
        purchaseOrderCount: purchaseOrders.length,
        vendorBillCount: vendorBills.length,
        vendorBillOutstanding: vendorBills.reduce(
          (sum, bill) => sum + (bill.outstandingAmount || 0),
          0,
        ),
        opportunityCount: opportunities.length,
        projectCount: projects.length,
      };

      res.json({
        contact,
        totals,
        invoices: invoices.slice(0, 50),
        salesOrders: salesOrders.slice(0, 50),
        purchaseOrders: purchaseOrders.slice(0, 50),
        vendorBills: vendorBills.slice(0, 50),
        opportunities: opportunities.slice(0, 50),
        projects: projects.slice(0, 50),
      });
    }),
  );

  app.delete(
    '/contacts/:id/roles/:role',
    authMiddleware,
    handler((req, res) => {
      const contact = store.getContactById(req.params.id);
      if (!contact) { res.status(404).json({ error: 'Not found' }); return; }
      requireCompanyRoles(req, contact.companyId, companyManagementRoles);
      store.removeContactRole(req.params.id, req.params.role as any);
      res.json(store.getContactById(req.params.id));
    }),
  );

  app.delete(
    '/contacts/:id',
    authMiddleware,
    handler((req, res) => {
      const contact = store.getContactById(req.params.id);
      if (!contact) { res.status(404).json({ error: 'Not found' }); return; }
      requireCompanyRoles(req, contact.companyId, companyManagementRoles);
      store.deleteContact(req.params.id);
      res.status(204).end();
    }),
  );

  // ─── CRM: Activities ─────────────────────────────────────────────────────

  app.post(
    '/contacts/:id/activities',
    authMiddleware,
    handler((req, res) => {
      const contact = store.getContactById(req.params.id);
      if (!contact) { res.status(404).json({ error: 'Not found' }); return; }
      requireCompanyRoles(req, contact.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const activity = withActor(req, () =>
        store.createCrmActivity({
          companyId: contact.companyId,
          contactId: req.params.id,
          category: enumValue(body.category, 'category', activityCategories),
          summary: requiredString(body.summary, 'summary', { min: 1 }),
          outcome: optionalString(body.outcome),
          nextAction: optionalString(body.nextAction),
          nextActionDueDate: body.nextActionDueDate
            ? new Date(optionalDateInput(body.nextActionDueDate)!)
            : undefined,
          durationMinutes: body.durationMinutes ? optionalNumber(body.durationMinutes) : undefined,
        }),
      );
      res.status(201).json(activity);
    }),
  );

  app.get(
    '/contacts/:id/activities',
    authMiddleware,
    handler((req, res) => {
      const contact = store.getContactById(req.params.id);
      if (!contact) { res.status(404).json({ error: 'Not found' }); return; }
      requireCompanyRoles(req, contact.companyId, companyManagementRoles);
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      res.json(store.listActivityEvents(contact.companyId, { entityType: 'contact', entityId: req.params.id, limit }));
    }),
  );

  // PATCH for CRM-specific contact fields (leadStatus, priority, followup, etc.)
  app.patch(
    '/contacts/:id',
    authMiddleware,
    handler((req, res) => {
      const contact = store.getContactById(req.params.id);
      if (!contact) { res.status(404).json({ error: 'Not found' }); return; }
      requireCompanyRoles(req, contact.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
      const effectiveRolePatch = getEffectiveRole(req.user!, contact.companyId);
      // Employees can only patch contacts they own
      if (effectiveRolePatch === 'Employee' && contact.ownerUserId && contact.ownerUserId !== req.user!.id) {
        throw new HttpError(403, 'You can only update your own contacts.');
      }
      const body = asRecord(req.body, 'body');
      const updated = store.updateContact(req.params.id, {
        leadStatus: body.leadStatus !== undefined ? enumValue(body.leadStatus, 'leadStatus', leadStatuses) : undefined,
        leadSource: body.leadSource !== undefined ? enumValue(body.leadSource, 'leadSource', leadSources) : undefined,
        priority: body.priority !== undefined ? enumValue(body.priority, 'priority', contactPriorities) : undefined,
        ownerUserId: body.ownerUserId !== undefined ? optionalString(body.ownerUserId) : undefined,
        ownerName: body.ownerName !== undefined ? optionalString(body.ownerName) : undefined,
        nextFollowupDate:
          body.nextFollowupDate !== undefined
            ? body.nextFollowupDate
              ? new Date(optionalDateInput(body.nextFollowupDate)!)
              : null
            : undefined,
        nextFollowupNote: body.nextFollowupNote !== undefined ? optionalString(body.nextFollowupNote) : undefined,
        visibility: body.visibility !== undefined ? enumValue(body.visibility, 'visibility', ['Public', 'Private'] as const) : undefined,
      });
      res.json(updated);
    }),
  );

  // ─── CRM: Follow-ups ─────────────────────────────────────────────────────

	  // Mark a single follow-up as done. The id is either the activity_event
	  // id, or the "contact:<id>" synthetic id for contact-level follow-ups.
	  app.post(
	    '/followups/:id/done',
	    authMiddleware,
	    handler((req, res) => {
	      const rawId = req.params.id;
	      if (rawId.startsWith('contact:')) {
	        const contactId = rawId.slice('contact:'.length);
	        const contact = store.getContactById(contactId);
	        if (!contact) throw new HttpError(404, 'Contact not found.');
	        requireCompanyRoles(req, contact.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
	        const updated = store.updateContact(contactId, {
	          nextFollowupDate: null,
	          nextFollowupNote: '',
	        });
	        res.json(updated);
	        return;
	      }
	      const event = store.getActivityEventById(rawId);
	      if (!event) throw new HttpError(404, 'Follow-up not found.');
	      requireCompanyRoles(req, event.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
	      const updated = store.updateActivityFollowup(rawId, {
	        nextActionDueDate: null,
	        nextAction: null,
	      });
	      res.json(updated);
	    }),
	  );

	  // Reschedule a follow-up to a later date.
	  app.post(
	    '/followups/:id/reschedule',
	    authMiddleware,
	    handler((req, res) => {
	      const rawId = req.params.id;
	      const body = asRecord(req.body, 'body');
	      const dueDateStr = requiredString(body.nextActionDueDate, 'nextActionDueDate');
	      const dueDate = new Date(dueDateStr);
	      if (Number.isNaN(dueDate.getTime())) {
	        throw new HttpError(400, 'Invalid date.');
	      }
	      if (rawId.startsWith('contact:')) {
	        const contactId = rawId.slice('contact:'.length);
	        const contact = store.getContactById(contactId);
	        if (!contact) throw new HttpError(404, 'Contact not found.');
	        requireCompanyRoles(req, contact.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
	        const updated = store.updateContact(contactId, {
	          nextFollowupDate: dueDate,
	          nextFollowupNote: optionalString(body.nextAction) ?? contact.nextFollowupNote,
	        });
	        res.json(updated);
	        return;
	      }
	      const event = store.getActivityEventById(rawId);
	      if (!event) throw new HttpError(404, 'Follow-up not found.');
	      requireCompanyRoles(req, event.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
	      const updated = store.updateActivityFollowup(rawId, {
	        nextActionDueDate: dueDate,
	        nextAction: optionalString(body.nextAction),
	      });
	      res.json(updated);
	    }),
	  );

	  app.post(
	    '/companies/:companyId/followups/sweep-overdue',
	    authMiddleware,
	    handler((req, res) => {
	      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Accountant']);
	      const created = store.sweepOverdueInvoiceFollowups(req.params.companyId);
	      res.json({ created });
	    }),
	  );

	  app.get(
	    '/companies/:companyId/followups',
	    authMiddleware,
	    handler((req, res) => {
	      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
	      const contactId = optionalString(req.query.contactId);
	      const effectiveRole = getEffectiveRole(req.user!, req.params.companyId);
	      const requestedOwnerUserId = optionalString(req.query.ownerUserId);
	      const ownerUserId = effectiveRole === 'Employee' ? req.user!.id : requestedOwnerUserId;
	      const overdueParam = req.query.overdue;
      const overdue = overdueParam === 'true' ? true : overdueParam === 'false' ? false : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      const followups = store.listFollowups(req.params.companyId, { contactId, ownerUserId, overdue, limit });
      // Enrich with contact info
      const enriched = followups.map((f) => {
        const contact = store.getContactById(f.entityId);
        return { ...f, contact: contact ? { id: contact.id, name: contact.name, email: contact.email, roles: contact.roles } : null };
      });
	      res.json(enriched);
	    }),
	  );

		  // ─── CRM: Opportunities ──────────────────────────────────────────────────

		  app.get(
		    '/companies/:companyId/crm-dashboard',
		    authMiddleware,
		    handler((req, res) => {
		      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		      const ownerParam = optionalString(req.query.ownerUserId);
		      const ownerUserId = ownerParam === 'me' ? req.user!.id : ownerParam;
		      if (ownerUserId && ownerUserId !== req.user!.id) {
		        requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
		      }
		      res.json(store.getCrmDashboardSummary(req.params.companyId, ownerUserId));
		    }),
		  );

	  app.get(
    '/companies/:companyId/crm-performance',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const fromRaw = (req.query.from as string | undefined) || undefined;
      const toRaw = (req.query.to as string | undefined) || undefined;
      const from = fromRaw ? new Date(fromRaw) : undefined;
      const to = toRaw ? new Date(toRaw) : undefined;
      if (from && Number.isNaN(from.getTime())) throw new HttpError(400, 'Invalid `from` date');
      if (to && Number.isNaN(to.getTime())) throw new HttpError(400, 'Invalid `to` date');
      const results = store.getCompanyPerformance(req.params.companyId, { from, to });
      res.json(results);
    }),
  );

	  app.get(
		    '/companies/:companyId/opportunities',
		    authMiddleware,
		    handler((req, res) => {
		      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		      const opportunities = store.listOpportunities(req.params.companyId);
		      const effectiveRole = getEffectiveRole(req.user!, req.params.companyId);
		      res.json(effectiveRole === 'Employee' ? opportunities.filter((item) => item.ownerUserId === req.user!.id) : opportunities);
		    }),
		  );

	  app.post(
	    '/companies/:companyId/opportunities',
		    authMiddleware,
		    handler((req, res) => {
		      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		      const body = asRecord(req.body, 'body');
		      const effectiveRole = getEffectiveRole(req.user!, req.params.companyId);
		      const opportunity = withActor(req, () =>
		        store.createOpportunity({
	          companyId: req.params.companyId,
	          contactId: requiredString(body.contactId, 'contactId'),
		          ownerUserId: effectiveRole === 'Employee' ? req.user!.id : body.ownerUserId !== undefined ? optionalString(body.ownerUserId) : req.user!.id,
		          ownerName: effectiveRole === 'Employee' ? req.user!.name : body.ownerName !== undefined ? optionalString(body.ownerName) : req.user!.name,
	          title: requiredString(body.title, 'title', { min: 2 }),
	          serviceType: requiredString(body.serviceType, 'serviceType', { min: 2 }),
	          stage: body.stage !== undefined ? enumValue(body.stage, 'stage', opportunityStages) : 'New',
	          expectedRevenue: optionalNumber(body.expectedRevenue) ?? 0,
	          probability: optionalNumber(body.probability) ?? 0,
	          expectedCloseDate: body.expectedCloseDate ? new Date(optionalDateInput(body.expectedCloseDate)!) : undefined,
	          notes: optionalString(body.notes),
	        }),
	      );
	      res.status(201).json(opportunity);
	    }),
	  );

		  app.patch(
		    '/opportunities/:id/stage',
	    authMiddleware,
	    handler((req, res) => {
	      const existing = store.getOpportunityById(req.params.id);
	      if (!existing) throw new HttpError(404, 'Opportunity not found.');
	      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
	      const effectiveRole = getEffectiveRole(req.user!, existing.companyId);
	      if (effectiveRole === 'Employee' && existing.ownerUserId !== req.user!.id) {
	        throw new HttpError(403, 'You can only update your own opportunities.');
	      }
	      const body = asRecord(req.body, 'body');
	      const newStage = enumValue(body.stage, 'stage', opportunityStages);
	      const updated = withActor(req, () => store.updateOpportunityStage(req.params.id, newStage));
	      if (!updated) throw new HttpError(404, 'Opportunity not found.');
	      if (newStage === 'Won') {
	        store.calculateCommissionsForOpportunity(req.params.id);
	        autoConvertContactToClient(existing.contactId, existing.companyId);
	      }
		      res.json(updated);
		    }),
		  );

		  app.put(
		    '/opportunities/:id',
		    authMiddleware,
		    handler((req, res) => {
		      const existing = store.getOpportunityById(req.params.id);
		      if (!existing) throw new HttpError(404, 'Opportunity not found.');
		      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		      const effectiveRole = getEffectiveRole(req.user!, existing.companyId);
		      if (effectiveRole === 'Employee' && existing.ownerUserId !== req.user!.id) {
		        throw new HttpError(403, 'You can only edit your own opportunities.');
		      }
		      const body = asRecord(req.body, 'body');
		      const updated = withActor(req, () =>
		        store.updateOpportunity(req.params.id, {
		          contactId: body.contactId !== undefined ? requiredString(body.contactId, 'contactId') : undefined,
		          ownerUserId: effectiveRole === 'Employee' ? existing.ownerUserId : body.ownerUserId !== undefined ? optionalString(body.ownerUserId) : undefined,
		          ownerName: effectiveRole === 'Employee' ? existing.ownerName : body.ownerName !== undefined ? optionalString(body.ownerName) : undefined,
		          title: body.title !== undefined ? requiredString(body.title, 'title', { min: 2 }) : undefined,
		          serviceType: body.serviceType !== undefined ? requiredString(body.serviceType, 'serviceType', { min: 2 }) : undefined,
		          stage: body.stage !== undefined ? enumValue(body.stage, 'stage', opportunityStages) : undefined,
		          expectedRevenue: body.expectedRevenue !== undefined ? optionalNumber(body.expectedRevenue) ?? 0 : undefined,
		          probability: body.probability !== undefined ? optionalNumber(body.probability) ?? 0 : undefined,
		          expectedCloseDate:
		            body.expectedCloseDate !== undefined && body.expectedCloseDate ? new Date(optionalDateInput(body.expectedCloseDate)!) : undefined,
		          notes: body.notes !== undefined ? optionalString(body.notes) : undefined,
		        }),
		      );
		      if (!updated) throw new HttpError(404, 'Opportunity not found.');
		      res.json(updated);
		    }),
		  );

		  app.delete(
		    '/opportunities/:id',
		    authMiddleware,
		    handler((req, res) => {
		      const existing = store.getOpportunityById(req.params.id);
		      if (!existing) throw new HttpError(404, 'Opportunity not found.');
		      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		      const effectiveRole = getEffectiveRole(req.user!, existing.companyId);
		      if (effectiveRole === 'Employee' && existing.ownerUserId !== req.user!.id) {
		        throw new HttpError(403, 'You can only archive your own opportunities.');
		      }
		      const updated = withActor(req, () => store.updateOpportunity(req.params.id, { stage: 'Cancelled' }));
		      if (!updated) throw new HttpError(404, 'Opportunity not found.');
		      res.status(204).end();
		    }),
		  );

		  // ─── CRM: Proposals / Quotes ────────────────────────────────────────────

		  app.get(
		    '/companies/:companyId/proposals',
		    authMiddleware,
		    handler((req, res) => {
		      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		      const proposals = store.listCrmProposals(req.params.companyId);
		      const effectiveRole = getEffectiveRole(req.user!, req.params.companyId);
		      if (effectiveRole !== 'Employee') {
		        res.json(proposals);
		        return;
		      }
		      const ownedOpportunityIds = new Set(
		        store.listOpportunities(req.params.companyId)
		          .filter((opportunity) => opportunity.ownerUserId === req.user!.id)
		          .map((opportunity) => opportunity.id),
		      );
		      res.json(proposals.filter((proposal) => ownedOpportunityIds.has(proposal.opportunityId)));
		    }),
		  );

		  app.post(
		    '/companies/:companyId/proposals',
		    authMiddleware,
		    handler((req, res) => {
		      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		      const body = asRecord(req.body, 'body');
		      const opportunity = store.getOpportunityById(requiredString(body.opportunityId, 'opportunityId'));
		      if (!opportunity || opportunity.companyId !== req.params.companyId) {
		        throw new HttpError(400, 'Opportunity must belong to the selected company.');
		      }
		      const effectiveRole = getEffectiveRole(req.user!, req.params.companyId);
		      if (effectiveRole === 'Employee' && opportunity.ownerUserId !== req.user!.id) {
		        throw new HttpError(403, 'You can only create proposals for your own opportunities.');
		      }
		      const proposal = withActor(req, () =>
		        store.createCrmProposal({
		          companyId: req.params.companyId,
		          opportunityId: opportunity.id,
		          title: requiredString(body.title, 'title', { min: 2 }),
		          status: body.status !== undefined ? enumValue(body.status, 'status', proposalStatuses) : 'Draft',
		          issueDate: body.issueDate ? new Date(optionalDateInput(body.issueDate)!) : new Date(),
		          validUntil: body.validUntil ? new Date(optionalDateInput(body.validUntil)!) : undefined,
		          items: parseProposalItems(body.items),
		          notes: optionalString(body.notes),
		        }),
		      );
		      res.status(201).json(proposal);
		    }),
		  );

		  app.patch(
		    '/proposals/:id/status',
		    authMiddleware,
		    handler((req, res) => {
		      const existing = store.getCrmProposalById(req.params.id);
		      if (!existing) throw new HttpError(404, 'Proposal not found.');
		      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		      const effectiveRole = getEffectiveRole(req.user!, existing.companyId);
		      if (effectiveRole === 'Employee') {
		        const opportunity = store.getOpportunityById(existing.opportunityId);
		        if (opportunity?.ownerUserId !== req.user!.id) {
		          throw new HttpError(403, 'You can only update your own proposals.');
		        }
		      }
		      const body = asRecord(req.body, 'body');
		      const updated = withActor(req, () =>
		        store.updateCrmProposalStatus(req.params.id, enumValue(body.status, 'status', proposalStatuses)),
		      );
		      if (!updated) throw new HttpError(404, 'Proposal not found.');
		      res.json(updated);
		    }),
		  );

		  app.put(
		    '/proposals/:id',
		    authMiddleware,
		    handler((req, res) => {
		      const existing = store.getCrmProposalById(req.params.id);
		      if (!existing) throw new HttpError(404, 'Proposal not found.');
		      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		      const effectiveRole = getEffectiveRole(req.user!, existing.companyId);
		      if (effectiveRole === 'Employee') {
		        const opportunity = store.getOpportunityById(existing.opportunityId);
		        if (opportunity?.ownerUserId !== req.user!.id) {
		          throw new HttpError(403, 'You can only edit your own proposals.');
		        }
		      }
		      const body = asRecord(req.body, 'body');
		      const updated = withActor(req, () =>
		        store.updateCrmProposal(req.params.id, {
		          title: body.title !== undefined ? requiredString(body.title, 'title', { min: 2 }) : undefined,
		          status: body.status !== undefined ? enumValue(body.status, 'status', proposalStatuses) : undefined,
		          issueDate: body.issueDate !== undefined && body.issueDate ? new Date(optionalDateInput(body.issueDate)!) : undefined,
		          validUntil: body.validUntil !== undefined && body.validUntil ? new Date(optionalDateInput(body.validUntil)!) : undefined,
		          items: body.items !== undefined ? parseProposalItems(body.items) : undefined,
		          notes: body.notes !== undefined ? optionalString(body.notes) : undefined,
		        }),
		      );
		      if (!updated) throw new HttpError(404, 'Proposal not found.');
		      res.json(updated);
		    }),
		  );

		  app.delete(
		    '/proposals/:id',
		    authMiddleware,
		    handler((req, res) => {
		      const existing = store.getCrmProposalById(req.params.id);
		      if (!existing) throw new HttpError(404, 'Proposal not found.');
		      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		      const effectiveRole = getEffectiveRole(req.user!, existing.companyId);
		      if (effectiveRole === 'Employee') {
		        const opportunity = store.getOpportunityById(existing.opportunityId);
		        if (opportunity?.ownerUserId !== req.user!.id) {
		          throw new HttpError(403, 'You can only archive your own proposals.');
		        }
		      }
		      if (!store.deleteCrmProposal(req.params.id)) throw new HttpError(404, 'Proposal not found.');
		      res.status(204).end();
		    }),
		  );

		  // ─── CRM: Campaigns ─────────────────────────────────────────────────────

		  app.get(
		    '/companies/:companyId/campaigns',
		    authMiddleware,
		    handler((req, res) => {
		      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		      const includeArchived = req.query.includeArchived === 'true';
		      const campaigns = store.listCrmCampaigns(req.params.companyId, includeArchived);
		      const effectiveRole = getEffectiveRole(req.user!, req.params.companyId);
		      res.json(effectiveRole === 'Employee' ? campaigns.filter((campaign) => campaign.ownerUserId === req.user!.id) : campaigns);
		    }),
		  );

		  app.post(
		    '/companies/:companyId/campaigns',
		    authMiddleware,
		    handler((req, res) => {
		      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		      const body = asRecord(req.body, 'body');
		      const contactId = optionalString(body.contactId);
		      if (contactId) {
		        const contact = store.getContactById(contactId);
		        if (!contact || contact.companyId !== req.params.companyId) throw new HttpError(400, 'Contact must belong to the selected company.');
		      }
		      const effectiveRole = getEffectiveRole(req.user!, req.params.companyId);
		      const campaign = withActor(req, () =>
		        store.createCrmCampaign({
		          companyId: req.params.companyId,
		          proposalId: optionalString(body.proposalId),
		          opportunityId: optionalString(body.opportunityId),
		          contactId,
		          projectId: optionalString(body.projectId),
		          name: requiredString(body.name, 'name', { min: 2 }),
		          status: body.status !== undefined ? enumValue(body.status, 'status', campaignStatuses) : 'Planned',
		          startDate: body.startDate ? new Date(optionalDateInput(body.startDate)!) : undefined,
		          endDate: body.endDate ? new Date(optionalDateInput(body.endDate)!) : undefined,
		          budget: optionalNumber(body.budget),
		          ownerUserId: effectiveRole === 'Employee' ? req.user!.id : optionalString(body.ownerUserId) ?? req.user!.id,
		          ownerName: effectiveRole === 'Employee' ? req.user!.name : optionalString(body.ownerName) ?? req.user!.name,
		          visibility: body.visibility !== undefined ? enumValue(body.visibility, 'visibility', ['Public', 'Private'] as ProjectVisibility[]) : 'Public',
		          notes: optionalString(body.notes),
		        }),
		      );
		      // Auto-assign 'Client' role to the contact when linked to a campaign
		      if (contactId) {
		        store.addContactRole(contactId, req.params.companyId, 'Client', 'Manual');
		      }
		      res.status(201).json(campaign);
		    }),
		  );

		  app.put(
		    '/campaigns/:id',
		    authMiddleware,
		    handler((req, res) => {
		      const existing = store.getCrmCampaignById(req.params.id);
		      if (!existing) throw new HttpError(404, 'Campaign not found.');
		      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		      const effectiveRole = getEffectiveRole(req.user!, existing.companyId);
		      if (effectiveRole === 'Employee' && existing.ownerUserId !== req.user!.id) {
		        throw new HttpError(403, 'You can only edit your own campaigns.');
		      }
		      const body = asRecord(req.body, 'body');
		      const updated = withActor(req, () =>
		        store.updateCrmCampaign(req.params.id, {
		          proposalId: body.proposalId !== undefined ? optionalString(body.proposalId) : undefined,
		          opportunityId: body.opportunityId !== undefined ? optionalString(body.opportunityId) : undefined,
		          contactId: body.contactId !== undefined ? optionalString(body.contactId) : undefined,
		          projectId: body.projectId !== undefined ? optionalString(body.projectId) : undefined,
		          name: body.name !== undefined ? requiredString(body.name, 'name', { min: 2 }) : undefined,
		          status: body.status !== undefined ? enumValue(body.status, 'status', campaignStatuses) : undefined,
		          startDate: body.startDate !== undefined && body.startDate ? new Date(optionalDateInput(body.startDate)!) : undefined,
		          endDate: body.endDate !== undefined && body.endDate ? new Date(optionalDateInput(body.endDate)!) : undefined,
		          budget: body.budget !== undefined ? optionalNumber(body.budget) : undefined,
		          ownerUserId: effectiveRole === 'Employee' ? existing.ownerUserId : body.ownerUserId !== undefined ? optionalString(body.ownerUserId) : undefined,
		          ownerName: effectiveRole === 'Employee' ? existing.ownerName : body.ownerName !== undefined ? optionalString(body.ownerName) : undefined,
		          visibility: body.visibility !== undefined ? enumValue(body.visibility, 'visibility', ['Public', 'Private'] as ProjectVisibility[]) : undefined,
		          notes: body.notes !== undefined ? optionalString(body.notes) : undefined,
		        }),
		      );
		      if (!updated) throw new HttpError(404, 'Campaign not found.');
		      res.json(updated);
		    }),
		  );

		  app.delete(
		    '/campaigns/:id',
		    authMiddleware,
		    handler((req, res) => {
		      const existing = store.getCrmCampaignById(req.params.id);
		      if (!existing) throw new HttpError(404, 'Campaign not found.');
		      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager']);
		      if (!store.deleteCrmCampaign(req.params.id)) throw new HttpError(404, 'Campaign not found.');
		      res.status(204).end();
		    }),
		  );

		  app.post(
		    '/companies/:companyId/campaigns/:campaignId/generate-invoice',
		    authMiddleware,
		    handler((req, res) => {
		      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
		      const campaign = store.getCrmCampaignById(req.params.campaignId);
		      if (!campaign || campaign.companyId !== req.params.companyId) {
		        throw new HttpError(404, 'Campaign not found.');
		      }
		      if (campaign.invoiceId) {
		        const existing = store.getInvoiceById(campaign.invoiceId);
		        if (existing) { res.json(existing); return; }
		      }
		      const deliverables = store.listCampaignDeliverables(campaign.id);
		      const lineItems = deliverables.map((d) => ({
		        itemType: 'Manual' as const,
		        description: d.title,
		        quantity: 1,
		        unitPrice: d.price || 0,
		        amount: d.price || 0,
		      }));
		      // Resolve clientId — campaigns use contactId; find or create the linked client
		      let clientId: string | undefined;
		      if (campaign.contactId) {
		        const contact = store.getContactById(campaign.contactId);
		        if (contact) {
		          store.addContactRole(contact.id, req.params.companyId, 'Client', 'Invoice');
		          clientId = contact.id;
		        }
		      }
		      if (!clientId) {
		        // No contactId on campaign — throw a helpful error
		        throw new HttpError(400, 'Please select a client contact for this campaign before generating an invoice.');
		      }
		      const now = new Date();
		      const invoice = withActor(req, () =>
		        store.createInvoice({
		          companyId: campaign.companyId,
		          clientId,
		          contactId: campaign.contactId ?? undefined,
		          campaignId: campaign.id,
		          issueDate: now,
		          dueDate: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30),
		          lineItems: lineItems.length > 0 ? lineItems : [{ itemType: 'Manual' as const, description: `Campaign: ${campaign.name}`, quantity: 1, unitPrice: 0, amount: 0 }],
		          total: 0,
		          status: 'Draft',
		          notes: `Generated from campaign: ${campaign.name}`,
		          currency: undefined,
		          taxRate: undefined,
		        }),
		      );
		      store.updateCrmCampaign(campaign.id, { invoiceId: invoice.id });
		      res.status(201).json(invoice);
		    }),
		  );

		  app.post(
		    '/companies/:companyId/campaigns/:campaignId/generate-vendor-bills',
		    authMiddleware,
		    handler((req, res) => {
		      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		      const campaign = store.getCrmCampaignById(req.params.campaignId);
		      if (!campaign || campaign.companyId !== req.params.companyId) {
		        throw new HttpError(404, 'Campaign not found.');
		      }
		      const bills = withActor(req, () =>
		        store.generateCampaignVendorBills(req.params.companyId, req.params.campaignId),
		      );
		      res.status(201).json(bills);
		    }),
		  );

		  const requireCampaignAccess = (req: AuthedRequest, campaignId: string, action: string) => {
		    const campaign = store.getCrmCampaignById(campaignId);
		    if (!campaign) throw new HttpError(404, 'Campaign not found.');
		    requireCompanyRoles(req, campaign.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		    const effectiveRole = getEffectiveRole(req.user!, campaign.companyId);
		    if (effectiveRole === 'Employee' && campaign.ownerUserId !== req.user!.id) {
		      throw new HttpError(403, `You can only ${action} your own campaigns.`);
		    }
		    return campaign;
		  };

		  app.get(
		    '/campaigns/:id/deliverables',
		    authMiddleware,
		    handler((req, res) => {
		      requireCampaignAccess(req, req.params.id, 'view');
		      res.json(store.listCampaignDeliverables(req.params.id));
		    }),
		  );

		  app.post(
		    '/campaigns/:id/deliverables',
		    authMiddleware,
		    handler((req, res) => {
		      const campaign = requireCampaignAccess(req, req.params.id, 'edit');
		      const body = asRecord(req.body, 'body');
		      const createFulfillment = body.fulfillment !== undefined ? enumValue(body.fulfillment, 'fulfillment', campaignFulfillments) : undefined;
		      if (createFulfillment === 'External' && !optionalString(body.vendorContactId)) {
		        throw new HttpError(400, 'An external deliverable needs a vendor contact.');
		      }
		      const deliverable = withActor(req, () =>
		        store.createCampaignDeliverable({
		          companyId: campaign.companyId,
		          campaignId: campaign.id,
		          contactId: optionalString(body.contactId),
		          vendorContactId: optionalString(body.vendorContactId),
		          assignedUserId: optionalString(body.assignedUserId),
		          assignedUserName: optionalString(body.assignedUserName),
		          title: requiredString(body.title, 'title', { min: 2 }),
		          platform: optionalString(body.platform),
		          dueDate: body.dueDate ? new Date(optionalDateInput(body.dueDate)!) : undefined,
		          status: body.status !== undefined ? enumValue(body.status, 'status', campaignDeliverableStatuses) : 'Planned',
		          contentUrl: optionalString(body.contentUrl),
		          publishedAt: body.publishedAt ? new Date(optionalDateInput(body.publishedAt)!) : undefined,
		          notes: optionalString(body.notes),
		          price: optionalNumber(body.price),
		          cost: optionalNumber(body.cost),
		          fulfillment: body.fulfillment !== undefined ? enumValue(body.fulfillment, 'fulfillment', campaignFulfillments) : undefined,
		        }),
		      );
		      res.status(201).json(deliverable);
		    }),
		  );

		  app.put(
		    '/campaign-deliverables/:id',
		    authMiddleware,
		    handler((req, res) => {
		      const existing = store.getCampaignDeliverableById(req.params.id);
		      if (!existing) throw new HttpError(404, 'Deliverable not found.');
		      requireCampaignAccess(req, existing.campaignId, 'edit');
		      const body = asRecord(req.body, 'body');
		      const updateFulfillment = body.fulfillment !== undefined ? enumValue(body.fulfillment, 'fulfillment', campaignFulfillments) : undefined;
		      const effectiveFulfillment = updateFulfillment ?? existing.fulfillment ?? 'Internal';
		      const effectiveVendor = body.vendorContactId !== undefined ? optionalString(body.vendorContactId) : existing.vendorContactId;
		      if (effectiveFulfillment === 'External' && !effectiveVendor) {
		        throw new HttpError(400, 'An external deliverable needs a vendor contact.');
		      }
		      const updated = withActor(req, () =>
		        store.updateCampaignDeliverable(req.params.id, {
		          contactId: body.contactId !== undefined ? optionalString(body.contactId) : undefined,
		          vendorContactId: body.vendorContactId !== undefined ? optionalString(body.vendorContactId) : undefined,
		          assignedUserId: body.assignedUserId !== undefined ? optionalString(body.assignedUserId) : undefined,
		          assignedUserName: body.assignedUserName !== undefined ? optionalString(body.assignedUserName) : undefined,
		          title: body.title !== undefined ? requiredString(body.title, 'title', { min: 2 }) : undefined,
		          platform: body.platform !== undefined ? optionalString(body.platform) : undefined,
		          dueDate: body.dueDate !== undefined && body.dueDate ? new Date(optionalDateInput(body.dueDate)!) : undefined,
		          status: body.status !== undefined ? enumValue(body.status, 'status', campaignDeliverableStatuses) : undefined,
		          contentUrl: body.contentUrl !== undefined ? optionalString(body.contentUrl) : undefined,
		          publishedAt: body.publishedAt !== undefined && body.publishedAt ? new Date(optionalDateInput(body.publishedAt)!) : undefined,
		          notes: body.notes !== undefined ? optionalString(body.notes) : undefined,
		          price: body.price !== undefined ? optionalNumber(body.price) : undefined,
		          cost: body.cost !== undefined ? optionalNumber(body.cost) : undefined,
		          fulfillment: body.fulfillment !== undefined ? enumValue(body.fulfillment, 'fulfillment', campaignFulfillments) : undefined,
		        }),
		      );
		      if (!updated) throw new HttpError(404, 'Deliverable not found.');
		      res.json(updated);
		    }),
		  );

		  app.delete(
		    '/campaign-deliverables/:id',
		    authMiddleware,
		    handler((req, res) => {
		      const existing = store.getCampaignDeliverableById(req.params.id);
		      if (!existing) throw new HttpError(404, 'Deliverable not found.');
		      requireCampaignAccess(req, existing.campaignId, 'edit');
		      if (!store.deleteCampaignDeliverable(req.params.id)) throw new HttpError(404, 'Deliverable not found.');
		      res.status(204).end();
		    }),
		  );

		  app.get(
		    '/campaigns/:id/assignments',
		    authMiddleware,
		    handler((req, res) => {
		      requireCampaignAccess(req, req.params.id, 'view');
		      res.json(store.listCampaignAssignments(req.params.id));
		    }),
		  );

		  app.post(
		    '/campaigns/:id/assignments',
		    authMiddleware,
		    handler((req, res) => {
		      const campaign = requireCampaignAccess(req, req.params.id, 'edit');
		      const body = asRecord(req.body, 'body');
		      const assignment = withActor(req, () =>
		        store.createCampaignAssignment({
		          companyId: campaign.companyId,
		          campaignId: campaign.id,
		          contactId: requiredString(body.contactId, 'contactId'),
		          role: enumValue(body.role, 'role', contactRoles),
		          agreedRate: optionalNumber(body.agreedRate),
		          status: body.status !== undefined ? enumValue(body.status, 'status', campaignAssignmentStatuses) : 'Planned',
		          notes: optionalString(body.notes),
		        }),
		      );
		      // Auto-assign the assignment role to the contact's roles
		      store.addContactRole(assignment.contactId, campaign.companyId, assignment.role, 'Manual');
		      res.status(201).json(assignment);
		    }),
		  );

		  app.put(
		    '/campaign-assignments/:id',
		    authMiddleware,
		    handler((req, res) => {
		      const existing = store.getCampaignAssignmentById(req.params.id);
		      if (!existing) throw new HttpError(404, 'Assignment not found.');
		      requireCampaignAccess(req, existing.campaignId, 'edit');
		      const body = asRecord(req.body, 'body');
		      const updated = withActor(req, () =>
		        store.updateCampaignAssignment(req.params.id, {
		          role: body.role !== undefined ? enumValue(body.role, 'role', contactRoles) : undefined,
		          agreedRate: body.agreedRate !== undefined ? optionalNumber(body.agreedRate) : undefined,
		          status: body.status !== undefined ? enumValue(body.status, 'status', campaignAssignmentStatuses) : undefined,
		          notes: body.notes !== undefined ? optionalString(body.notes) : undefined,
		        }),
		      );
		      if (!updated) throw new HttpError(404, 'Assignment not found.');
		      res.json(updated);
		    }),
		  );

		  app.delete(
		    '/campaign-assignments/:id',
		    authMiddleware,
		    handler((req, res) => {
		      const existing = store.getCampaignAssignmentById(req.params.id);
		      if (!existing) throw new HttpError(404, 'Assignment not found.');
		      requireCampaignAccess(req, existing.campaignId, 'edit');
		      if (!store.deleteCampaignAssignment(req.params.id)) throw new HttpError(404, 'Assignment not found.');
		      res.status(204).end();
		    }),
		  );

		  app.get(
		    '/campaigns/:id/expenses',
		    authMiddleware,
		    handler((req, res) => {
		      requireCampaignAccess(req, req.params.id, 'view');
		      res.json(store.listCampaignExpenses(req.params.id));
		    }),
		  );

		  app.post(
		    '/campaigns/:id/expenses',
		    authMiddleware,
		    handler((req, res) => {
		      const campaign = requireCampaignAccess(req, req.params.id, 'edit');
		      const body = asRecord(req.body, 'body');
		      const expense = withActor(req, () =>
		        store.createCampaignExpense({
		          companyId: campaign.companyId,
		          campaignId: campaign.id,
		          contactId: optionalString(body.contactId),
		          vendorRequestId: optionalString(body.vendorRequestId),
		          description: requiredString(body.description, 'description', { min: 2 }),
		          amount: optionalNumber(body.amount) ?? 0,
		          expenseDate: body.expenseDate ? new Date(optionalDateInput(body.expenseDate)!) : undefined,
		          status: body.status !== undefined ? enumValue(body.status, 'status', campaignExpenseStatuses) : 'Draft',
		          billable: optionalBoolean(body.billable) ?? false,
		          notes: optionalString(body.notes),
		        }),
		      );
		      res.status(201).json(expense);
		    }),
		  );

		  app.put(
		    '/campaign-expenses/:id',
		    authMiddleware,
		    handler((req, res) => {
		      const existing = store.getCampaignExpenseById(req.params.id);
		      if (!existing) throw new HttpError(404, 'Campaign expense not found.');
		      requireCampaignAccess(req, existing.campaignId, 'edit');
		      const body = asRecord(req.body, 'body');
		      const updated = withActor(req, () =>
		        store.updateCampaignExpense(req.params.id, {
		          contactId: body.contactId !== undefined ? optionalString(body.contactId) : undefined,
		          vendorRequestId: body.vendorRequestId !== undefined ? optionalString(body.vendorRequestId) : undefined,
		          description: body.description !== undefined ? requiredString(body.description, 'description', { min: 2 }) : undefined,
		          amount: body.amount !== undefined ? optionalNumber(body.amount) ?? 0 : undefined,
		          expenseDate: body.expenseDate !== undefined && body.expenseDate ? new Date(optionalDateInput(body.expenseDate)!) : undefined,
		          status: body.status !== undefined ? enumValue(body.status, 'status', campaignExpenseStatuses) : undefined,
		          billable: body.billable !== undefined ? optionalBoolean(body.billable) ?? false : undefined,
		          notes: body.notes !== undefined ? optionalString(body.notes) : undefined,
		        }),
		      );
		      if (!updated) throw new HttpError(404, 'Campaign expense not found.');
		      res.json(updated);
		    }),
		  );

		  app.delete(
		    '/campaign-expenses/:id',
		    authMiddleware,
		    handler((req, res) => {
		      const existing = store.getCampaignExpenseById(req.params.id);
		      if (!existing) throw new HttpError(404, 'Campaign expense not found.');
		      requireCampaignAccess(req, existing.campaignId, 'edit');
		      if (!store.deleteCampaignExpense(req.params.id)) throw new HttpError(404, 'Campaign expense not found.');
		      res.status(204).end();
		    }),
		  );

		  // ─── CRM: Vendor / Influencer Requests ───────────────────────────────────

	  app.get(
	    '/companies/:companyId/vendor-requests',
		    authMiddleware,
		    handler((req, res) => {
		      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		      const requests = store.listVendorRequests(req.params.companyId);
		      const effectiveRole = getEffectiveRole(req.user!, req.params.companyId);
		      res.json(effectiveRole === 'Employee' ? requests.filter((request) => request.requestedByUserId === req.user!.id) : requests);
		    }),
		  );

	  app.post(
	    '/companies/:companyId/vendor-requests',
	    authMiddleware,
	    handler((req, res) => {
	      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
	      const body = asRecord(req.body, 'body');
	      const request = withActor(req, () =>
	        store.createVendorRequest({
	          companyId: req.params.companyId,
		          contactId: optionalString(body.contactId),
		          name: requiredString(body.name, 'name', { min: 2 }),
		          role: enumValue(body.role, 'role', contactRoles),
		          requestType: optionalString(body.requestType),
		          platform: optionalString(body.platform),
		          handle: optionalString(body.handle),
		          details: optionalString(body.details),
		          dueDate: body.dueDate ? new Date(optionalDateInput(body.dueDate)!) : undefined,
		          cost: optionalNumber(body.cost),
		          status: body.status !== undefined ? enumValue(body.status, 'status', vendorRequestStatuses) : 'New',
	          notes: optionalString(body.notes),
	        }),
	      );
	      res.status(201).json(request);
	    }),
	  );

	  app.patch(
	    '/vendor-requests/:id/status',
	    authMiddleware,
	    handler((req, res) => {
	      const existing = store
	        .listCompanies()
	        .flatMap((company) => store.listVendorRequests(company.id))
	        .find((request) => request.id === req.params.id);
	      if (!existing) throw new HttpError(404, 'Vendor request not found.');
	      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager']);
	      const body = asRecord(req.body, 'body');
	      const updated = withActor(req, () =>
	        store.reviewVendorRequest(
	          req.params.id,
	          enumValue(body.status, 'status', vendorRequestStatuses),
	          optionalString(body.notes),
	        ),
	      );
	      if (!updated) throw new HttpError(404, 'Vendor request not found.');
	      res.json(updated);
	    }),
	  );

	  app.put(
	    '/vendor-requests/:id',
	    authMiddleware,
	    handler((req, res) => {
	      const existing = store.getVendorRequestById(req.params.id);
	      if (!existing) throw new HttpError(404, 'Vendor request not found.');
	      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
	      const effectiveRole = getEffectiveRole(req.user!, existing.companyId);
	      if (effectiveRole === 'Employee' && existing.requestedByUserId !== req.user!.id) {
	        throw new HttpError(403, 'You can only edit your own vendor requests.');
	      }
	      const body = asRecord(req.body, 'body');
	      const updated = withActor(req, () =>
	        store.updateVendorRequest(req.params.id, {
	          contactId: body.contactId !== undefined ? optionalString(body.contactId) : undefined,
	          name: body.name !== undefined ? requiredString(body.name, 'name', { min: 2 }) : undefined,
	          role: body.role !== undefined ? enumValue(body.role, 'role', contactRoles) : undefined,
	          requestType: body.requestType !== undefined ? optionalString(body.requestType) : undefined,
	          platform: body.platform !== undefined ? optionalString(body.platform) : undefined,
	          handle: body.handle !== undefined ? optionalString(body.handle) : undefined,
	          details: body.details !== undefined ? optionalString(body.details) : undefined,
	          dueDate: body.dueDate !== undefined && body.dueDate ? new Date(optionalDateInput(body.dueDate)!) : undefined,
	          cost: body.cost !== undefined ? optionalNumber(body.cost) : undefined,
	          status:
	            body.status !== undefined && effectiveRole !== 'Employee'
	              ? enumValue(body.status, 'status', vendorRequestStatuses)
	              : undefined,
	          notes: body.notes !== undefined ? optionalString(body.notes) : undefined,
	        }),
	      );
	      if (!updated) throw new HttpError(404, 'Vendor request not found.');
	      res.json(updated);
	    }),
	  );

	  app.delete(
	    '/vendor-requests/:id',
	    authMiddleware,
	    handler((req, res) => {
	      const existing = store.getVendorRequestById(req.params.id);
	      if (!existing) throw new HttpError(404, 'Vendor request not found.');
	      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
	      const effectiveRole = getEffectiveRole(req.user!, existing.companyId);
	      if (effectiveRole === 'Employee' && existing.requestedByUserId !== req.user!.id) {
	        throw new HttpError(403, 'You can only archive your own vendor requests.');
	      }
	      if (!store.deleteVendorRequest(req.params.id)) throw new HttpError(404, 'Vendor request not found.');
	      res.status(204).end();
	    }),
	  );

	  // ─── Contributions (commission attribution) ──────────────────────────────

	  // List contributions for a single source (e.g. opportunity, project, task, invoice).
	  // sourceType + sourceId are required so a manager can audit/edit who shares
	  // the commission on that specific entity.
	  app.get(
	    '/companies/:companyId/contributions',
	    authMiddleware,
	    handler((req, res) => {
	      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
	      const sourceType = optionalString(req.query.sourceType) as
	        | import('./types').ContributionSourceType
	        | undefined;
	      const sourceId = optionalString(req.query.sourceId);
	      const userId = optionalString(req.query.userId);
	      res.json(store.listContributions(req.params.companyId, { sourceType, sourceId, userId }));
	    }),
	  );

	  // Add or update a contributor on a source.
	  app.post(
	    '/companies/:companyId/contributions',
	    authMiddleware,
	    handler((req, res) => {
	      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
	      const body = asRecord(req.body, 'body');
	      const sourceTypeValue = enumValue(body.sourceType, 'sourceType', [
	        'opportunity',
	        'project',
	        'task',
	        'invoice',
	      ] as const);
	      const roleValue = enumValue(body.role, 'role', [
	        'Sales',
	        'Account Manager',
	        'Project Lead',
	        'Contributor',
	        'Other',
	      ] as const);
	      try {
	        const created = store.setContribution({
	          companyId: req.params.companyId,
	          userId: requiredString(body.userId, 'userId'),
	          userName: optionalString(body.userName) || undefined,
	          sourceType: sourceTypeValue,
	          sourceId: requiredString(body.sourceId, 'sourceId'),
	          role: roleValue,
	          roleNote: optionalString(body.roleNote) || undefined,
	          weightPercent: optionalNumber(body.weightPercent) ?? 100,
	          notes: optionalString(body.notes) || undefined,
	        });
	        res.status(201).json(created);
	      } catch (error) {
	        throw new HttpError(400, error instanceof Error ? error.message : 'Could not save contribution.');
	      }
	    }),
	  );

	  app.delete(
	    '/contributions/:id',
	    authMiddleware,
	    handler((req, res) => {
	      const existing = store.getContributionById(req.params.id);
	      if (!existing) throw new HttpError(404, 'Contribution not found.');
	      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
	      const removed = store.deleteContribution(req.params.id);
	      res.json({ success: removed });
	    }),
	  );

	  // ─── CRM: Commissions ────────────────────────────────────────────────────

	  app.get(
	    '/companies/:companyId/commission-rules',
		    authMiddleware,
		    handler((req, res) => {
		      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		      res.json(store.listCommissionRules(req.params.companyId));
		    }),
		  );

	  app.post(
	    '/companies/:companyId/commission-rules',
	    authMiddleware,
	    handler((req, res) => {
	      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Accountant']);
	      const body = asRecord(req.body, 'body');
	      const rule = store.createCommissionRule({
	        companyId: req.params.companyId,
	        userId: optionalString(body.userId) || undefined,
	        role:
	          body.role !== undefined && body.role !== null && body.role !== ''
	            ? (enumValue(body.role, 'role', [
	                'Sales',
	                'Account Manager',
	                'Project Lead',
	                'Contributor',
	                'Other',
	              ] as const) as import('./types').ContributionRole)
	            : undefined,
	        serviceType:
	          body.serviceType !== undefined && body.serviceType !== null && body.serviceType !== ''
	            ? requiredString(body.serviceType, 'serviceType', { min: 2 })
	            : undefined,
	        basis: enumValue(body.basis, 'basis', commissionBases),
	        rateType: enumValue(body.rateType, 'rateType', commissionRateTypes),
	        rate: optionalNumber(body.rate) ?? 0,
	        fixedAmount: optionalNumber(body.fixedAmount),
	        priority: optionalNumber(body.priority) ?? 0,
	        isActive: optionalBoolean(body.isActive) ?? true,
	        notes: optionalString(body.notes) || undefined,
	      });
	      // Recompute open commissions so the rate change surfaces immediately
	      try { store.recomputeCommissionsForCompany(rule.companyId); } catch {}
	      res.status(201).json(rule);
	    }),
	  );

	  app.put(
	    '/commission-rules/:id',
	    authMiddleware,
	    handler((req, res) => {
	      const existing = (store as any).db
	        .prepare('SELECT companyId FROM commission_rules WHERE id = ?')
	        .get(req.params.id) as { companyId?: string } | undefined;
	      if (!existing?.companyId) throw new HttpError(404, 'Rule not found.');
	      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager', 'Accountant']);
	      const body = asRecord(req.body, 'body');
	      const updates: Record<string, unknown> = {};
	      if (body.userId !== undefined) updates.userId = optionalString(body.userId) || undefined;
	      if (body.role !== undefined) {
	        updates.role =
	          body.role === null || body.role === ''
	            ? undefined
	            : (enumValue(body.role, 'role', [
	                'Sales',
	                'Account Manager',
	                'Project Lead',
	                'Contributor',
	                'Other',
	              ] as const) as import('./types').ContributionRole);
	      }
	      if (body.serviceType !== undefined) {
	        updates.serviceType =
	          body.serviceType === null || body.serviceType === ''
	            ? undefined
	            : String(body.serviceType);
	      }
	      if (body.basis !== undefined) updates.basis = enumValue(body.basis, 'basis', commissionBases);
	      if (body.rateType !== undefined) updates.rateType = enumValue(body.rateType, 'rateType', commissionRateTypes);
	      if (body.rate !== undefined) updates.rate = optionalNumber(body.rate) ?? 0;
	      if (body.fixedAmount !== undefined) updates.fixedAmount = optionalNumber(body.fixedAmount);
	      if (body.priority !== undefined) updates.priority = optionalNumber(body.priority) ?? 0;
	      if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
	      if (body.notes !== undefined) updates.notes = optionalString(body.notes) || undefined;
	      const result = store.updateCommissionRule(req.params.id, updates as any);
	      if (!result) throw new HttpError(404, 'Rule not found.');
	      try { store.recomputeCommissionsForCompany(existing.companyId); } catch {}
	      res.json(result);
	    }),
	  );

	  app.delete(
	    '/commission-rules/:id',
	    authMiddleware,
	    handler((req, res) => {
	      const existing = (store as any).db
	        .prepare('SELECT companyId FROM commission_rules WHERE id = ?')
	        .get(req.params.id) as { companyId?: string } | undefined;
	      if (!existing?.companyId) throw new HttpError(404, 'Rule not found.');
	      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager', 'Accountant']);
	      const removed = store.deleteCommissionRule(req.params.id);
	      try { store.recomputeCommissionsForCompany(existing.companyId); } catch {}
	      res.json({ success: removed });
	    }),
	  );

	  app.post(
	    '/companies/:companyId/commissions/recompute',
	    authMiddleware,
	    handler((req, res) => {
	      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Accountant']);
	      const touched = store.recomputeCommissionsForCompany(req.params.companyId);
	      res.json({ recomputed: touched });
	    }),
	  );

		  app.get(
		    '/companies/:companyId/commissions',
		    authMiddleware,
		    handler((req, res) => {
		      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Employee', 'Accountant']);
		      const commissions = store.listCommissions(req.params.companyId);
		      const effectiveRole = getEffectiveRole(req.user!, req.params.companyId);
		      res.json(effectiveRole === 'Employee' ? commissions.filter((commission) => commission.userId === req.user!.id) : commissions);
		    }),
		  );

		  // Legacy endpoint (kept for back-compat). Delegates to the explicit
		  // approve/pay/void endpoints below which post journal entries.
		  app.patch(
		    '/commissions/:id/status',
		    authMiddleware,
		    handler((req, res) => {
		      const existing = store.getCommissionById(req.params.id);
		      if (!existing) throw new HttpError(404, 'Commission not found.');
		      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager', 'Accountant']);
		      const body = asRecord(req.body, 'body');
		      const target = enumValue(body.status, 'status', commissionStatuses);
		      let updated;
		      try {
		        updated = withActor(req, () => {
		          if (target === 'Approved') return store.approveCommission(req.params.id);
		          if (target === 'Paid')     return store.payCommission(req.params.id);
		          return store.updateCommissionStatus(req.params.id, target);
		        });
		      } catch (error) {
		        throw new HttpError(400, error instanceof Error ? error.message : 'Could not update commission.');
		      }
		      if (!updated) throw new HttpError(404, 'Commission not found.');
		      res.json(updated);
		    }),
		  );

		  app.post(
		    '/commissions/:id/approve',
		    authMiddleware,
		    handler((req, res) => {
		      const existing = store.getCommissionById(req.params.id);
		      if (!existing) throw new HttpError(404, 'Commission not found.');
		      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager', 'Accountant']);
		      try {
		        const updated = withActor(req, () => store.approveCommission(req.params.id));
		        if (!updated) throw new HttpError(404, 'Commission not found.');
		        res.json(updated);
		      } catch (error) {
		        throw new HttpError(400, error instanceof Error ? error.message : 'Could not approve commission.');
		      }
		    }),
		  );

		  app.post(
		    '/commissions/:id/pay',
		    authMiddleware,
		    handler((req, res) => {
		      const existing = store.getCommissionById(req.params.id);
		      if (!existing) throw new HttpError(404, 'Commission not found.');
		      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager', 'Accountant']);
		      try {
		        const updated = withActor(req, () => store.payCommission(req.params.id));
		        if (!updated) throw new HttpError(404, 'Commission not found.');
		        res.json(updated);
		      } catch (error) {
		        throw new HttpError(400, error instanceof Error ? error.message : 'Could not pay commission.');
		      }
		    }),
		  );

		  app.post(
		    '/commissions/:id/void',
		    authMiddleware,
		    handler((req, res) => {
		      const existing = store.getCommissionById(req.params.id);
		      if (!existing) throw new HttpError(404, 'Commission not found.');
		      requireCompanyRoles(req, existing.companyId, ['Admin', 'Manager', 'Accountant']);
		      const body = asRecord(req.body ?? {}, 'body');
		      try {
		        const updated = withActor(req, () =>
		          store.voidCommission(req.params.id, optionalString(body.reason) || undefined),
		        );
		        if (!updated) throw new HttpError(404, 'Commission not found.');
		        res.json(updated);
		      } catch (error) {
		        throw new HttpError(400, error instanceof Error ? error.message : 'Could not void commission.');
		      }
		    }),
		  );

		  app.post(
	    '/opportunities/:id/commissions/recalculate',
	    authMiddleware,
	    handler((req, res) => {
	      const opportunity = store.getOpportunityById(req.params.id);
	      if (!opportunity) throw new HttpError(404, 'Opportunity not found.');
	      requireCompanyRoles(req, opportunity.companyId, ['Admin', 'Manager', 'Accountant']);
	      res.json(store.calculateCommissionsForOpportunity(req.params.id));
	    }),
	  );

	  // ─── Clients ─────────────────────────────────────────────────────────────

  app.get(
    '/companies/:companyId/clients',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listClients(req.params.companyId));
    }),
  );

	  app.post(
	    '/clients',
	    authMiddleware,
	    handler((req, res) => {
	      const body = asRecord(req.body, 'body');
	      const companyId = requiredString(body.companyId, 'companyId');
	      requireCompanyRoles(req, companyId, companyManagementRoles);
	      const client = withActor(req, () =>
	        store.createClient({
	          companyId,
	          name: requiredString(body.name, 'name', { min: 2 }),
	          email: requiredString(body.email, 'email', { min: 3 }),
	          address: requiredString(body.address, 'address', { min: 5 }),
	          contactName: optionalString(body.contactName),
	          phone: optionalString(body.phone),
	          vatNumber: optionalString(body.vatNumber),
	          creditLimit: optionalNumber(body.creditLimit),
	          creditNumber: optionalString(body.creditNumber),
	          paymentMethod: optionalString(body.paymentMethod),
	          status: body.status !== undefined ? enumValue(body.status, 'status', clientStatuses) : 'Active',
	          notes: optionalString(body.notes),
	        }),
	      );
	      res.status(201).json(client);
	    }),
	  );

  app.put(
    '/clients/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getClientById(req.params.id);
	      if (!existing) throw new HttpError(404, 'Client not found.');
	      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
	      const body = asRecord(req.body, 'body');
	      const updated = withActor(req, () =>
	        store.updateClient(req.params.id, {
          name: body.name !== undefined ? requiredString(body.name, 'name', { min: 2 }) : undefined,
          email: body.email !== undefined ? requiredString(body.email, 'email', { min: 3 }) : undefined,
          address: body.address !== undefined ? requiredString(body.address, 'address', { min: 5 }) : undefined,
          contactName: body.contactName !== undefined ? optionalString(body.contactName) : undefined,
          phone: body.phone !== undefined ? optionalString(body.phone) : undefined,
          vatNumber: body.vatNumber !== undefined ? optionalString(body.vatNumber) : undefined,
          creditLimit: body.creditLimit !== undefined ? optionalNumber(body.creditLimit) : undefined,
          creditNumber: body.creditNumber !== undefined ? optionalString(body.creditNumber) : undefined,
          paymentMethod: body.paymentMethod !== undefined ? optionalString(body.paymentMethod) : undefined,
          status: body.status !== undefined ? enumValue(body.status, 'status', clientStatuses) : undefined,
          notes: body.notes !== undefined ? optionalString(body.notes) : undefined,
        }),
	      );
	      if (!updated) throw new HttpError(404, 'Client not found.');
	      const contactRow = (store as any).db
	        .prepare(`SELECT id FROM contacts WHERE clientId = ? OR id = ? LIMIT 1`)
	        .get(req.params.id, req.params.id) as any;
	      if (contactRow) {
	        store.updateContact(contactRow.id, {
	          name: updated.name,
	          email: updated.email,
	          address: updated.address,
	          contactPerson: updated.contactName,
	          phone: updated.phone,
	          taxNumber: updated.vatNumber,
	          notes: updated.notes,
	        });
	      }
	      res.json(updated);
	    }),
	  );

  app.get(
    '/companies/:companyId/activity-events',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Accountant']);
      const entityType = req.query.entityType
        ? enumValue(req.query.entityType, 'entityType', activityEntityTypes)
        : undefined;
      const entityId = optionalString(req.query.entityId);
      const actorUserId = optionalString(req.query.actorUserId);
      const limit = req.query.limit ? Number(req.query.limit) : 25;
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new HttpError(400, 'limit must be a positive number.');
      }
      res.json(
        store.listActivityEvents(req.params.companyId, {
          entityType,
          entityId,
          actorUserId,
          limit,
        }),
      );
    }),
  );

  app.get(
    '/companies/:companyId/records/:entityType/:entityId/attachments',
    authMiddleware,
    handler((req, res) => {
      const entityType = enumValue(
        req.params.entityType,
        'entityType',
        recordEntityTypes,
      ) as RecordEntityType;
      requireRecordSupportAccess(req, req.params.companyId, entityType, req.params.entityId);
      res.json(store.listRecordAttachments(req.params.companyId, entityType, req.params.entityId));
    }),
  );

  app.post(
    '/companies/:companyId/records/:entityType/:entityId/attachments',
    authMiddleware,
    handler((req, res) => {
      const entityType = enumValue(
        req.params.entityType,
        'entityType',
        recordEntityTypes,
      ) as RecordEntityType;
      requireRecordSupportAccess(req, req.params.companyId, entityType, req.params.entityId);
      const body = asRecord(req.body, 'body');
      const sizeBytes = optionalNumber(body.sizeBytes);
      if (sizeBytes !== undefined && sizeBytes < 0) {
        throw new HttpError(400, 'sizeBytes must not be negative.');
      }
      const attachment = withActor(req, () =>
        store.createRecordAttachment({
          companyId: req.params.companyId,
          entityType,
          entityId: req.params.entityId,
          fileName: requiredString(body.fileName, 'fileName', { min: 1 }),
          url: optionalString(body.url),
          mimeType: optionalString(body.mimeType),
          sizeBytes,
          note: optionalString(body.note),
        }),
      );
      res.status(201).json(attachment);
    }),
  );

  app.get(
    '/companies/:companyId/records/:entityType/:entityId/timeline',
    authMiddleware,
    handler((req, res) => {
      const entityType = enumValue(
        req.params.entityType,
        'entityType',
        recordEntityTypes,
      ) as RecordEntityType;
      requireRecordSupportAccess(req, req.params.companyId, entityType, req.params.entityId);
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new HttpError(400, 'limit must be a positive number.');
      }
      res.json(store.getRecordTimeline(req.params.companyId, entityType, req.params.entityId, limit));
    }),
  );

  app.delete(
    '/record-attachments/:id',
    authMiddleware,
    handler((req, res) => {
      const attachment = store.getRecordAttachmentById(req.params.id);
      if (!attachment) throw new HttpError(404, 'Attachment not found.');
      requireCompanyRoles(req, attachment.companyId, companyManagementRoles);
      store.deleteRecordAttachment(req.params.id);
      res.status(204).end();
    }),
  );

  app.get(
    '/companies/:companyId/suppliers',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listSuppliers(req.params.companyId));
    }),
  );

	  app.post(
	    '/companies/:companyId/suppliers',
	    authMiddleware,
	    handler((req, res) => {
	      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
	      const body = asRecord(req.body, 'body');
	      const supplier = withActor(req, () =>
	        store.createSupplier({
	          companyId: req.params.companyId,
	          name: requiredString(body.name, 'name', { min: 2 }),
	          contactName: optionalString(body.contactName),
	          email: optionalString(body.email),
	          phone: optionalString(body.phone),
	          paymentTermsDays: optionalNumber(body.paymentTermsDays),
	          notes: optionalString(body.notes),
	          isActive: optionalBoolean(body.isActive) ?? true,
	        }),
	      );
	      res.status(201).json(supplier);
	    }),
	  );

  app.get(
    '/companies/:companyId/inventory-items',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Accountant']);
      res.json(store.listInventoryItems(req.params.companyId));
    }),
  );

  app.post(
    '/companies/:companyId/inventory-items',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Accountant']);
      const body = asRecord(req.body, 'body');
      const preferredSupplierId = optionalString(body.preferredSupplierId);
      ensureSupplierBelongsToCompany(preferredSupplierId, req.params.companyId);
      const item = withActor(req, () =>
        store.createInventoryItem({
          companyId: req.params.companyId,
          name: requiredString(body.name, 'name', { min: 2 }),
          category: requiredString(body.category, 'category', { min: 2 }),
          unit: requiredString(body.unit, 'unit', { min: 1 }),
          barcode: optionalString(body.barcode),
          vatApplicable: optionalBoolean(body.vatApplicable) ?? true,
          tracksInventory: optionalBoolean(body.tracksInventory) ?? true,
          onHand: requiredNumber(body.onHand ?? 0, 'onHand'),
          reorderPoint: requiredNumber(body.reorderPoint ?? 0, 'reorderPoint'),
          unitCost: requiredNumber(body.unitCost ?? 0, 'unitCost'),
          salePrice: optionalNumber(body.salePrice),
          preferredVendor: optionalString(body.preferredVendor),
          preferredSupplierId,
          location: optionalString(body.location),
        }),
      );
      res.status(201).json(item);
    }),
  );

  app.get(
    '/companies/:companyId/stock-movements',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Accountant']);
      const inventoryItemId =
        req.query.inventoryItemId !== undefined
          ? requiredString(req.query.inventoryItemId, 'inventoryItemId')
          : undefined;
      if (inventoryItemId) {
        const item = store.getInventoryItemById(inventoryItemId);
        if (!item || item.companyId !== req.params.companyId) {
          throw new HttpError(404, 'Inventory item not found.');
        }
      }
      res.json(store.listStockMovements(req.params.companyId, inventoryItemId));
    }),
  );

  app.get(
    '/companies/:companyId/inventory-location-balances',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Accountant']);
      const inventoryItemId =
        req.query.inventoryItemId !== undefined
          ? requiredString(req.query.inventoryItemId, 'inventoryItemId')
          : undefined;
      if (inventoryItemId) {
        const item = store.getInventoryItemById(inventoryItemId);
        if (!item || item.companyId !== req.params.companyId) {
          throw new HttpError(404, 'Inventory item not found.');
        }
      }
      res.json(store.listInventoryLocationBalances(req.params.companyId, inventoryItemId));
    }),
  );

  app.post(
    '/companies/:companyId/inventory-items/:itemId/adjustments',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Accountant']);
      const item = store.getInventoryItemById(req.params.itemId);
      if (!item || item.companyId !== req.params.companyId) {
        throw new HttpError(404, 'Inventory item not found.');
      }
      if (!item.tracksInventory) {
        throw new HttpError(400, 'This item is not tracked in inventory.');
      }
      const body = asRecord(req.body, 'body');
      const quantityChange = requiredNumber(body.quantityChange, 'quantityChange');
      if (quantityChange === 0) {
        throw new HttpError(400, 'quantityChange must be non-zero.');
      }
      let movement;
      try {
        movement = withActor(req, () =>
          store.createInventoryAdjustment(
            req.params.companyId,
            req.params.itemId,
            quantityChange,
            optionalString(body.note),
            optionalString(body.location),
          ),
        );
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not adjust inventory.');
      }
      res.status(201).json({
        movement,
        item: store.getInventoryItemById(req.params.itemId),
      });
    }),
  );

  app.post(
    '/companies/:companyId/inventory-items/:itemId/issues',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Accountant']);
      const item = store.getInventoryItemById(req.params.itemId);
      if (!item || item.companyId !== req.params.companyId) {
        throw new HttpError(404, 'Inventory item not found.');
      }
      if (!item.tracksInventory) {
        throw new HttpError(400, 'This item is not tracked in inventory.');
      }
      const body = asRecord(req.body, 'body');
      try {
        const issue = withActor(req, () =>
          store.createInventoryIssue({
            companyId: req.params.companyId,
            inventoryItemId: req.params.itemId,
            quantity: requiredNumber(body.quantity, 'quantity'),
            location: optionalString(body.location) || item.location || 'Unassigned',
            issuedAt: optionalDateInput(body.issuedAt),
            issuedTo: optionalString(body.issuedTo),
            note: optionalString(body.note),
            projectId: optionalString(body.projectId),
            taskId: optionalString(body.taskId),
          }),
        );
        res.status(201).json({
          issue,
          item: store.getInventoryItemById(req.params.itemId),
          balances: store.listInventoryLocationBalances(req.params.companyId, req.params.itemId),
        });
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not issue inventory.');
      }
    }),
  );

  app.post(
    '/companies/:companyId/inventory-items/:itemId/transfers',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Accountant']);
      const item = store.getInventoryItemById(req.params.itemId);
      if (!item || item.companyId !== req.params.companyId) {
        throw new HttpError(404, 'Inventory item not found.');
      }
      if (!item.tracksInventory) {
        throw new HttpError(400, 'This item is not tracked in inventory.');
      }
      const body = asRecord(req.body, 'body');
      try {
        const transfer = withActor(req, () =>
          store.createInventoryTransfer({
            companyId: req.params.companyId,
            inventoryItemId: req.params.itemId,
            quantity: requiredNumber(body.quantity, 'quantity'),
            fromLocation: optionalString(body.fromLocation) || item.location || 'Unassigned',
            toLocation: requiredString(body.toLocation, 'toLocation', { min: 2 }),
            transferredAt: optionalDateInput(body.transferredAt),
            note: optionalString(body.note),
          }),
        );
        res.status(201).json({
          transfer,
          item: store.getInventoryItemById(req.params.itemId),
          balances: store.listInventoryLocationBalances(req.params.companyId, req.params.itemId),
        });
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not transfer inventory.');
      }
    }),
  );

  app.get(
    '/companies/:companyId/purchase-orders',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listPurchaseOrders(req.params.companyId));
    }),
  );

  app.get(
    '/companies/:companyId/purchase-order-payables',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listPurchaseOrderPayables(req.params.companyId));
    }),
  );

  app.post(
    '/companies/:companyId/purchase-orders',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const expectedDate = optionalDateInput(body.expectedDate);
      const items = parsePurchaseOrderItems(body.items);
      const contactId = optionalString(body.contactId);
      const supplierId = requiredString(body.supplierId, 'supplierId');
      const supplier = ensureSupplierBelongsToCompany(supplierId, req.params.companyId);
      ensurePurchaseItemsBelongToCompany(items, req.params.companyId);
      const supplierName = supplier?.name;
      if (!supplierName) {
        throw new HttpError(400, 'supplierId must reference a supplier in the same company.');
      }
      const status = enumValue(body.status ?? 'Draft', 'status', purchaseOrderStatuses);
      if (status === 'Partially Received') {
        throw new HttpError(400, 'Purchase orders cannot be created as Partially Received.');
      }
      const order = withActor(req, () =>
        store.createPurchaseOrder({
          companyId: req.params.companyId,
          supplierName,
          supplierId,
          contactId: contactId ?? undefined,
          orderDate: new Date(requiredDateInput(body.orderDate, 'orderDate')),
          expectedDate: expectedDate ? new Date(expectedDate) : undefined,
          status,
          items,
          notes: optionalString(body.notes),
        }),
      );
      res.status(201).json(order);
    }),
  );

  app.get(
    '/companies/:companyId/purchase-receipts',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const purchaseOrderId = optionalString(req.query.purchaseOrderId);
      if (purchaseOrderId) {
        ensurePurchaseOrderBelongsToCompany(purchaseOrderId, req.params.companyId);
      }
      res.json(store.listPurchaseReceipts(req.params.companyId, purchaseOrderId));
    }),
  );

  app.patch(
    '/purchase-orders/:id/status',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getPurchaseOrderById(req.params.id);
      if (!existing) throw new HttpError(404, 'Purchase order not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const nextStatus = enumValue(body.status, 'status', purchaseOrderStatuses);
      if (nextStatus === 'Partially Received') {
        throw new HttpError(400, 'Use purchase receipts to mark an order as partially received.');
      }
      const order = withActor(req, () =>
        store.updatePurchaseOrderStatus(
          req.params.id,
          nextStatus,
        ),
      );
      if (!order) throw new HttpError(404, 'Purchase order not found.');
      res.json(order);
    }),
  );

  app.post(
    '/purchase-orders/:id/receipts',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getPurchaseOrderById(req.params.id);
      if (!existing) throw new HttpError(404, 'Purchase order not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const receipt = withActor(req, () =>
        store.receivePurchaseOrder(req.params.id, {
          receivedAt: optionalDateInput(body.receivedAt),
          notes: optionalString(body.notes),
          items: parsePurchaseReceiptItems(body.items),
        }),
      );
      res.status(201).json(receipt);
    }),
  );

  app.get(
    '/companies/:companyId/sales-orders',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listSalesOrders(req.params.companyId));
    }),
  );

  app.post(
    '/companies/:companyId/sales-orders',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const items = parseSalesOrderItems(body.items);
      const contactId = optionalString(body.contactId);
      const clientId = requiredString(body.clientId, 'clientId');
      ensureClientBelongsToCompany(clientId, req.params.companyId);
      ensureSalesItemsBelongToCompany(items, req.params.companyId);
      const expectedDate = optionalDateInput(body.expectedDate);
      const order = withActor(req, () =>
        store.createSalesOrder({
          companyId: req.params.companyId,
          clientId,
          contactId: contactId ?? undefined,
          orderDate: new Date(requiredDateInput(body.orderDate, 'orderDate')),
          expectedDate: expectedDate ? new Date(expectedDate) : undefined,
          status: enumValue(body.status ?? 'Draft', 'status', salesOrderStatuses),
          items,
          notes: optionalString(body.notes),
        }),
      );
      autoConvertContactToClient(contactId, req.params.companyId);
      res.status(201).json(order);
    }),
  );

  app.patch(
    '/sales-orders/:id/status',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getSalesOrderById(req.params.id);
      if (!existing) throw new HttpError(404, 'Sales order not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      let order;
      try {
        order = withActor(req, () =>
          store.updateSalesOrderStatus(
            req.params.id,
            enumValue(body.status, 'status', salesOrderStatuses),
          ),
        );
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not update sales order status.');
      }
      if (!order) throw new HttpError(404, 'Sales order not found.');
      res.json(order);
    }),
  );

  app.post(
    '/sales-orders/:id/invoice',
    authMiddleware,
    handler((req, res) => {
      const order = store.getSalesOrderById(req.params.id);
      if (!order) throw new HttpError(404, 'Sales order not found.');
      requireCompanyRoles(req, order.companyId, companyManagementRoles);
      if (order.status !== 'Confirmed') {
        throw new HttpError(400, 'Only confirmed sales orders can be invoiced.');
      }
      if (order.invoiceId) {
        const existingInvoice = store.getInvoiceById(order.invoiceId);
        if (existingInvoice) {
          res.json(existingInvoice);
          return;
        }
      }
      const body = asRecord(req.body ?? {}, 'body');
      const issueDate = optionalDateInput(body.issueDate) || new Date().toISOString();
      const dueDate = optionalDateInput(body.dueDate)
        || new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
      const invoice = withActor(req, () =>
        store.createInvoice({
          companyId: order.companyId,
          clientId: order.clientId,
          salesOrderId: order.id,
          templateId: optionalString(body.templateId),
          issueDate: new Date(issueDate),
          dueDate: new Date(dueDate),
          lineItems: order.items.map((item) => ({
            itemType: 'Manual',
            sku: item.sku,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.lineTotal,
          })),
          total: order.totalAmount,
          status: 'Draft',
          notes: optionalString(body.notes) || `Created from sales order ${order.orderNumber}.`,
          currency: optionalString(body.currency),
          taxRate: optionalNumber(body.taxRate),
        }),
      );
      res.status(201).json(invoice);
    }),
  );

  // ============================================================
  // Deliveries / Fulfillment
  // ============================================================

  app.get(
    '/companies/:companyId/deliveries',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listDeliveries(req.params.companyId));
    }),
  );

  app.get(
    '/sales-orders/:id/deliveries',
    authMiddleware,
    handler((req, res) => {
      const order = store.getSalesOrderById(req.params.id);
      if (!order) throw new HttpError(404, 'Sales order not found.');
      requireCompanyRoles(req, order.companyId, companyManagementRoles);
      res.json(store.listDeliveriesForSalesOrder(order.id));
    }),
  );

  app.post(
    '/sales-orders/:id/deliveries',
    authMiddleware,
    handler((req, res) => {
      const order = store.getSalesOrderById(req.params.id);
      if (!order) throw new HttpError(404, 'Sales order not found.');
      requireCompanyRoles(req, order.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const itemsRaw = Array.isArray(body.items) ? body.items : [];
      const items = itemsRaw.map((row, index) => {
        const record = asRecord(row, `items[${index}]`);
        return {
          salesOrderLineIndex: Number(record.salesOrderLineIndex ?? record.lineIndex ?? 0),
          quantity: Number(record.quantity ?? 0),
          location: optionalString(record.location),
        };
      });
      try {
        const delivery = withActor(req, () =>
          store.createDelivery({
            salesOrderId: order.id,
            items,
            carrier: optionalString(body.carrier),
            trackingNumber: optionalString(body.trackingNumber),
            notes: optionalString(body.notes),
            scheduledFor: body.scheduledFor ? new Date(String(body.scheduledFor)) : undefined,
          }),
        );
        res.status(201).json(delivery);
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not create delivery.');
      }
    }),
  );

  app.patch(
    '/deliveries/:id/status',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getDeliveryById(req.params.id);
      if (!existing) throw new HttpError(404, 'Delivery not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const nextStatus = enumValue(body.status, 'status', deliveryStatuses);
      const occurredAt = body.occurredAt ? new Date(String(body.occurredAt)) : undefined;
      try {
        let updated;
        if (nextStatus === 'Shipped') {
          updated = withActor(req, () => store.markDeliveryShipped(existing.id, occurredAt));
        } else if (nextStatus === 'Delivered') {
          updated = withActor(req, () => store.markDeliveryDelivered(existing.id, occurredAt));
        } else if (nextStatus === 'Cancelled') {
          updated = withActor(req, () =>
            store.cancelDelivery(existing.id, optionalString(body.reason) ?? undefined),
          );
        } else {
          throw new HttpError(400, 'Use a specific status transition (Shipped, Delivered, or Cancelled).');
        }
        res.json(updated);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not update delivery status.');
      }
    }),
  );

  app.post(
    '/deliveries/:id/cancel',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getDeliveryById(req.params.id);
      if (!existing) throw new HttpError(404, 'Delivery not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      const body = asRecord(req.body ?? {}, 'body');
      try {
        const updated = withActor(req, () =>
          store.cancelDelivery(existing.id, optionalString(body.reason) ?? undefined),
        );
        res.json(updated);
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not cancel delivery.');
      }
    }),
  );

  // ============================================================
  // WhatsApp (Green API) integration
  // ============================================================

  const requireWhatsapp = (companyId: string) => {
    const instance = store.getWhatsappInstanceForCompany(companyId);
    if (!instance) throw new HttpError(404, 'WhatsApp instance is not configured for this company.');
    const creds = store.getWhatsappCredentials(companyId);
    if (!creds) throw new HttpError(500, 'WhatsApp credentials missing.');
    return { instance, creds };
  };

  const wrapGreenApi = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof GreenApiError) {
        throw new HttpError(error.status >= 400 && error.status < 600 ? error.status : 502, error.message);
      }
      throw error;
    }
  };

  app.get(
    '/companies/:companyId/whatsapp/instance',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin']);
      const instance = store.getWhatsappInstanceForCompany(req.params.companyId);
      res.json(instance || null);
    }),
  );

  app.put(
    '/companies/:companyId/whatsapp/instance',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin']);
      const body = asRecord(req.body, 'body');
      const idInstance = requiredString(body.idInstance, 'idInstance');
      const apiToken = requiredString(body.apiToken, 'apiToken');
      try {
        const instance = store.upsertWhatsappInstance(req.params.companyId, {
          idInstance,
          apiToken,
          apiHost: optionalString(body.apiHost) || undefined,
          phoneNumber: optionalString(body.phoneNumber) || undefined,
          displayName: optionalString(body.displayName) || undefined,
        });
        res.json(instance);
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not save WhatsApp instance.');
      }
    }),
  );

  app.delete(
    '/companies/:companyId/whatsapp/instance',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin']);
      const removed = store.deleteWhatsappInstance(req.params.companyId);
      res.json({ success: removed });
    }),
  );

  app.get(
    '/companies/:companyId/whatsapp/state',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin']);
      const { creds } = requireWhatsapp(req.params.companyId);
      const state = await wrapGreenApi(() => greenApi.getStateInstance(creds));
      const updated = store.updateWhatsappInstanceState(req.params.companyId, state);
      res.json(updated || { state });
    }),
  );

  app.get(
    '/companies/:companyId/whatsapp/qr',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin']);
      const { creds } = requireWhatsapp(req.params.companyId);
      const qr = await wrapGreenApi(() => greenApi.getQrCode(creds));
      res.json(qr);
    }),
  );

  app.post(
    '/companies/:companyId/whatsapp/configure-webhook',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin']);
      const { instance, creds } = requireWhatsapp(req.params.companyId);
      const body = asRecord(req.body ?? {}, 'body');
      const publicBaseUrl =
        optionalString(body.baseUrl) ||
        process.env.PUBLIC_BASE_URL ||
        `${req.protocol}://${req.get('host')}`;
      const webhookUrl = `${publicBaseUrl.replace(/\/$/, '')}/whatsapp/webhook/${instance.webhookToken}`;
      await wrapGreenApi(() => greenApi.configureWebhook(creds, webhookUrl, instance.webhookToken));
      res.json({ success: true, webhookUrl });
    }),
  );

  app.post(
    '/companies/:companyId/whatsapp/logout',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin']);
      const { creds } = requireWhatsapp(req.params.companyId);
      const result = await wrapGreenApi(() => greenApi.logout(creds));
      const refreshed = store.updateWhatsappInstanceState(req.params.companyId, 'notAuthorized');
      res.json({ ...result, instance: refreshed });
    }),
  );

  app.post(
    '/companies/:companyId/whatsapp/send',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const { instance, creds } = requireWhatsapp(req.params.companyId);
      const body = asRecord(req.body, 'body');
      const phone = requiredString(body.phone, 'phone');
      const message = requiredString(body.message, 'message');
      const contactId = optionalString(body.contactId) || undefined;
      const contextEntityType = optionalString(body.contextEntityType) || undefined;
      const contextEntityId = optionalString(body.contextEntityId) || undefined;
      const chatId = toChatId(phone);
      const actorUserId = req.user?.id;
      const actorName = req.user?.name;
      try {
        const sent = await wrapGreenApi(() => greenApi.sendMessage(creds, chatId, message));
        const stored = store.createWhatsappMessage({
          companyId: req.params.companyId,
          instanceId: instance.id,
          direction: 'outbound',
          externalId: sent.idMessage,
          chatId,
          phone,
          contactId,
          type: 'text',
          body: message,
          status: 'sent',
          contextEntityType,
          contextEntityId,
          actorUserId,
          actorName,
          sentAt: new Date(),
        });
        res.status(201).json(stored);
      } catch (error) {
        store.createWhatsappMessage({
          companyId: req.params.companyId,
          instanceId: instance.id,
          direction: 'outbound',
          chatId,
          phone,
          contactId,
          type: 'text',
          body: message,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          contextEntityType,
          contextEntityId,
          actorUserId,
          actorName,
        });
        throw error;
      }
    }),
  );

  app.get(
    '/companies/:companyId/whatsapp/messages',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const { chatId, contactId, phone, limit } = req.query as Record<string, string | undefined>;
      // Privacy enforcement when filtering by chat
      if (chatId) {
        const settings = store.getWhatsappChatSettings(req.params.companyId, chatId);
        const viewer = req.user ? { userId: req.user.id, role: req.user.role } : undefined;
        if (!store.canViewWhatsappChat(settings, viewer)) {
          throw new HttpError(403, 'You do not have access to this private chat.');
        }
      }
      const messages = store.listWhatsappMessages(req.params.companyId, {
        chatId: chatId || undefined,
        contactId: contactId || undefined,
        phone: phone || undefined,
        limit: limit ? Number(limit) : undefined,
      });
      res.json(messages);
    }),
  );

  app.get(
    '/companies/:companyId/whatsapp/chats',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const viewer = req.user ? { userId: req.user.id, role: req.user.role } : undefined;
      res.json(store.listWhatsappChats(req.params.companyId, viewer));
    }),
  );

  app.get(
    '/companies/:companyId/whatsapp/chats/:chatId/settings',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.getWhatsappChatSettings(req.params.companyId, req.params.chatId));
    }),
  );

  app.patch(
    '/companies/:companyId/whatsapp/chats/:chatId/settings',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const current = store.getWhatsappChatSettings(req.params.companyId, req.params.chatId);
      const viewer = req.user ? { userId: req.user.id, role: req.user.role } : undefined;
      // Only owner or Admin/Manager can change a private chat's settings.
      if (current.visibility === 'private' && !store.canViewWhatsappChat(current, viewer)) {
        throw new HttpError(403, 'Only the chat owner or a manager can change these settings.');
      }
      const visibilityRaw = optionalString(body.visibility);
      const visibility =
        visibilityRaw === 'private' || visibilityRaw === 'shared'
          ? (visibilityRaw as 'private' | 'shared')
          : undefined;
      const ownerProvided = Object.prototype.hasOwnProperty.call(body, 'ownerUserId');
      const ownerValue = ownerProvided ? (body.ownerUserId === null ? null : optionalString(body.ownerUserId) || null) : undefined;

      // Default ownership for a fresh private toggle = current user
      const effectiveOwner =
        visibility === 'private' && !ownerProvided && !current.ownerUserId
          ? req.user?.id ?? null
          : ownerValue;

      const updated = store.setWhatsappChatSettings(req.params.companyId, req.params.chatId, {
        visibility,
        ownerUserId: effectiveOwner as any,
      });
      res.json(updated);
    }),
  );

  app.post(
    '/companies/:companyId/whatsapp/chats/:chatId/read',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const updated = store.markWhatsappChatRead(req.params.companyId, req.params.chatId);
      res.json({ updated });
    }),
  );

  app.post(
    '/companies/:companyId/whatsapp/chats/:chatId/sync-history',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const { instance, creds } = requireWhatsapp(req.params.companyId);
      const count = Math.min(Math.max(Number(req.query.count) || 100, 1), 100);
      const raw = await wrapGreenApi(() =>
        greenApi.getChatHistory(creds, req.params.chatId, count),
      );
      const inserted = store.importWhatsappHistory(
        req.params.companyId,
        instance.id,
        req.params.chatId,
        raw,
      );
      res.json({ inserted, fetched: raw.length });
    }),
  );

  /**
   * Helper for the "new chat" composer: validates a phone number actually
   * has WhatsApp, returns its chatId, and triggers a history backfill.
   */
  app.post(
    '/companies/:companyId/whatsapp/open-chat',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const { instance, creds } = requireWhatsapp(req.params.companyId);
      const body = asRecord(req.body, 'body');
      const phone = requiredString(body.phone, 'phone');
      const chatId = toChatId(phone);
      try {
        const check = await wrapGreenApi(() => greenApi.checkWhatsapp(creds, phone));
        if (!check.existsWhatsapp) {
          throw new HttpError(400, 'This phone number is not on WhatsApp.');
        }
      } catch (error) {
        if (error instanceof HttpError) throw error;
        // If checkWhatsapp fails we still allow opening the chat.
      }
      let imported = 0;
      try {
        const raw = await greenApi.getChatHistory(creds, chatId, 50);
        imported = store.importWhatsappHistory(
          req.params.companyId,
          instance.id,
          chatId,
          raw,
        );
      } catch {
        /* history fetch is best-effort */
      }
      res.json({ chatId, phone: chatId.replace(/@c\.us$/, ''), imported });
    }),
  );

  /**
   * Public webhook receiver — Green API calls this for every event on the
   * configured instance. We identify the company by the webhook token in the
   * URL. Always respond 200 quickly so Green API does not retry.
   */
  app.post(
    '/whatsapp/webhook/:webhookToken',
    handler((req, res) => {
      const token = req.params.webhookToken;
      const instance = store.getWhatsappInstanceByWebhookToken(token);
      if (!instance) {
        res.status(200).json({ ok: true, ignored: true });
        return;
      }
      try {
        const payload = req.body as any;
        const typeWebhook = payload?.typeWebhook;
        if (typeWebhook === 'stateInstanceChanged') {
          const next = String(payload?.stateInstance || 'unknown');
          store.updateWhatsappInstanceState(
            instance.companyId,
            (['notAuthorized','authorized','blocked','sleepMode','starting','yellowCard'].includes(next)
              ? next
              : 'unknown') as any,
          );
        } else if (typeWebhook === 'incomingMessageReceived') {
          const senderData = payload?.senderData || {};
          const messageData = payload?.messageData || {};
          const textBody =
            messageData?.textMessageData?.textMessage ||
            messageData?.extendedTextMessageData?.text ||
            '';
          const fileUrl = messageData?.fileMessageData?.downloadUrl;
          const fileName = messageData?.fileMessageData?.fileName;
          const messageType: import('./types').WhatsAppMessageType =
            fileUrl ? 'file' : 'text';
          const savedMessage = store.createWhatsappMessage({
            companyId: instance.companyId,
            instanceId: instance.id,
            direction: 'inbound',
            externalId: String(payload?.idMessage || ''),
            chatId: String(senderData?.chatId || ''),
            phone: String(senderData?.chatId || '').replace(/@c\.us$/, ''),
            type: messageType,
            body: textBody || '',
            mediaUrl: fileUrl || undefined,
            fileName: fileName || undefined,
            status: 'delivered',
            receivedAt: new Date((Number(payload?.timestamp) || Date.now() / 1000) * 1000),
          });
          // Auto-follow-up: if the inbound message is linked to a known
          // contact, schedule a same-day reply reminder.
          if (savedMessage.contactId) {
            try {
              store.scheduleAutomaticFollowup({
                companyId: instance.companyId,
                contactId: savedMessage.contactId,
                trigger: 'InboundWhatsapp',
                sourceType: 'whatsapp_message',
                sourceId: savedMessage.id,
                summary: 'New WhatsApp message — reply needed.',
                nextAction: 'Reply to the inbound WhatsApp message.',
                offsetDays: 0,
                category: 'WhatsApp',
              });
            } catch (error) {
              logger.error('Failed to schedule InboundWhatsapp follow-up', error);
            }
          }
        } else if (
          typeWebhook === 'outgoingMessageStatus' ||
          typeWebhook === 'outgoingAPIMessageReceived' ||
          typeWebhook === 'outgoingMessageReceived'
        ) {
          const externalId = String(payload?.idMessage || '');
          const status = String(payload?.status || '').toLowerCase();
          if (externalId && status) {
            const mapped: import('./types').WhatsAppMessageStatus =
              status === 'read'
                ? 'read'
                : status === 'delivered'
                  ? 'delivered'
                  : status === 'failed' || status === 'noaccount' || status === 'notinwhitelist'
                    ? 'failed'
                    : 'sent';
            store.updateWhatsappMessageStatus(externalId, mapped);
          }
        }
      } catch (err) {
        logger.error('WhatsApp webhook handler error', err);
      }
      res.status(200).json({ ok: true });
    }),
  );

  app.get(
    '/companies/:companyId/invoices',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listInvoices(req.params.companyId));
    }),
  );

  app.post(
    '/invoices',
    authMiddleware,
    handler((req, res) => {
      const payload = parseInvoicePayload(req.body);
      requireCompanyRoles(req, payload.companyId!, companyManagementRoles);
      ensureClientBelongsToCompany(payload.clientId!, payload.companyId!);
      if (payload.salesOrderId) {
        const salesOrder = store.getSalesOrderById(payload.salesOrderId);
        if (!salesOrder || salesOrder.companyId !== payload.companyId || salesOrder.clientId !== payload.clientId) {
          throw new HttpError(400, 'Sales order does not belong to this company and client.');
        }
      }
      if (payload.templateId) {
        const template = store.getInvoiceTemplateById(payload.templateId);
        if (!template || template.companyId !== payload.companyId) {
          throw new HttpError(400, 'Invoice template does not belong to this company.');
        }
      }
      ensureTaskIdsBelongToCompany(
        (payload.lineItems || []).flatMap((item) => (item.taskId ? [item.taskId] : [])),
        payload.companyId!,
      );
      let invoice;
      try {
        invoice = withActor(req, () =>
          store.createInvoice({
            invoiceNumber: payload.invoiceNumber,
            companyId: payload.companyId!,
            clientId: payload.clientId!,
            contactId: payload.contactId ?? undefined,
            salesOrderId: payload.salesOrderId,
            templateId: payload.templateId,
            issueDate: new Date(payload.issueDate!),
            dueDate: new Date(payload.dueDate!),
            lineItems: payload.lineItems!,
            total: 0,
            status: payload.status || 'Draft',
            notes: payload.notes,
            currency: payload.currency,
            taxRate: payload.taxRate,
            sentAt: payload.sentAt ? new Date(payload.sentAt) : undefined,
            paidAt: payload.paidAt ? new Date(payload.paidAt) : undefined,
          }),
        );
      } catch (error: any) {
        throw new HttpError(400, error?.message || 'Could not create invoice.');
      }
      autoConvertContactToClient(payload.contactId ?? undefined, payload.companyId!);
      res.status(201).json(invoice);
    }),
  );

  app.get(
    '/invoices/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getInvoiceById(req.params.id);
      if (!existing) throw new HttpError(404, 'Invoice not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      res.json(existing);
    }),
  );

  app.patch(
    '/invoices/:id/status',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getInvoiceById(req.params.id);
      if (!existing) throw new HttpError(404, 'Invoice not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      let updated;
      try {
        updated = withActor(req, () =>
          store.updateInvoiceStatus(
            req.params.id,
            enumValue(body.status, 'status', invoiceStatuses),
          ),
        );
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not update invoice status.');
      }
      if (!updated) throw new HttpError(404, 'Invoice not found.');
      res.json(updated);
    }),
  );

  app.put(
    '/invoices/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getInvoiceById(req.params.id);
      if (!existing) throw new HttpError(404, 'Invoice not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      const payload = parseInvoicePayload(req.body, { partial: true });
      const targetCompanyId = payload.companyId || existing.companyId;
      if (targetCompanyId !== existing.companyId) {
        requireCompanyRoles(req, targetCompanyId, companyManagementRoles);
      }
      const targetClientId = payload.clientId !== undefined ? payload.clientId : existing.clientId;
      const targetSalesOrderId = payload.salesOrderId !== undefined ? payload.salesOrderId : existing.salesOrderId;
      const targetTemplateId = payload.templateId !== undefined ? payload.templateId : existing.templateId;
      const targetLineItems = payload.lineItems ?? existing.lineItems;
      ensureClientBelongsToCompany(targetClientId, targetCompanyId);
      if (targetSalesOrderId) {
        const salesOrder = store.getSalesOrderById(targetSalesOrderId);
        if (!salesOrder || salesOrder.companyId !== targetCompanyId || salesOrder.clientId !== targetClientId) {
          throw new HttpError(400, 'Sales order does not belong to this company and client.');
        }
      }
      if (targetTemplateId) {
        const template = store.getInvoiceTemplateById(targetTemplateId);
        if (!template || template.companyId !== targetCompanyId) {
          throw new HttpError(400, 'Invoice template does not belong to this company.');
        }
      }
      ensureTaskIdsBelongToCompany(
        targetLineItems.flatMap((item) => (item.taskId ? [item.taskId] : [])),
        targetCompanyId,
      );
      let updated;
      try {
        updated = withActor(req, () =>
          store.updateInvoice(req.params.id, {
            ...payload,
            issueDate: payload.issueDate ? new Date(payload.issueDate) : undefined,
            dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
            sentAt: payload.sentAt ? new Date(payload.sentAt) : undefined,
            paidAt: payload.paidAt ? new Date(payload.paidAt) : undefined,
          }),
        );
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not update invoice.');
      }
      if (!updated) throw new HttpError(404, 'Invoice not found.');
      res.json(updated);
    }),
  );

  app.get(
    '/invoices/:id/payments',
    authMiddleware,
    handler((req, res) => {
      const invoice = store.getInvoiceById(req.params.id);
      if (!invoice) throw new HttpError(404, 'Invoice not found.');
      requireCompanyRoles(req, invoice.companyId, companyManagementRoles);
      res.json(store.listPayments(req.params.id));
    }),
  );

  app.post(
    '/invoices/:id/payments',
    authMiddleware,
    handler((req, res) => {
      const invoice = store.getInvoiceById(req.params.id);
      if (!invoice) throw new HttpError(404, 'Invoice not found.');
      requireCompanyRoles(req, invoice.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const amount = requiredNumber(body.amount, 'amount');
      if (amount <= 0) {
        throw new HttpError(400, 'amount must be greater than zero.');
      }
      const paidAt = optionalDateInput(body.paidAt);
      let payment;
      try {
        payment = withActor(req, () =>
          store.createPayment({
            invoiceId: req.params.id,
            amount,
            method: optionalString(body.method),
            note: optionalString(body.note),
            paidAt: paidAt ? new Date(paidAt) : new Date(),
          }),
        );
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not create payment.');
      }
      res.status(201).json(payment);
    }),
  );

  app.delete(
    '/invoices/:id/payments/:paymentId',
    authMiddleware,
    handler((req, res) => {
      const invoice = store.getInvoiceById(req.params.id);
      if (!invoice) throw new HttpError(404, 'Invoice not found.');
      requireCompanyRoles(req, invoice.companyId, companyManagementRoles);
      const exists = store.listPayments(req.params.id).some((p) => p.id === req.params.paymentId);
      if (!exists) throw new HttpError(404, 'Payment not found.');
      let updated;
      try {
        updated = withActor(req, () => store.reverseInvoicePayment(req.params.paymentId));
      } catch (error) {
        throw new HttpError(
          400,
          error instanceof Error ? error.message : 'Could not reverse payment.',
        );
      }
      if (!updated) throw new HttpError(404, 'Payment not found.');
      res.json(updated);
    }),
  );

  app.post(
    '/companies/:companyId/invoices/bulk-status',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const targetStatus = enumValue(body.targetStatus, 'targetStatus', invoiceStatuses);
      const invoiceIds = body.invoiceIds ? stringArray(body.invoiceIds, 'invoiceIds') : undefined;
      const currentStatus =
        body.currentStatus !== undefined
          ? enumValue(body.currentStatus, 'currentStatus', invoiceStatuses)
          : undefined;
      let invoices = store.listInvoices(req.params.companyId);
      if (invoiceIds?.length) {
        const allowedIds = new Set(invoiceIds);
        invoices = invoices.filter((invoice) => allowedIds.has(invoice.id));
      } else if (currentStatus) {
        invoices = invoices.filter((invoice) => invoice.status === currentStatus);
      }
      let updated;
      try {
        updated = invoices
          .map((invoice) => withActor(req, () => store.updateInvoiceStatus(invoice.id, targetStatus)))
          .filter(Boolean);
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Could not update invoice statuses.');
      }
      res.json({ updatedCount: updated.length, items: updated });
    }),
  );

  app.get(
    '/companies/:companyId/finance/accounts',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listLedgerAccounts(req.params.companyId));
    }),
  );

  app.post(
    '/companies/:companyId/finance/accounts',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      let account;
      try {
        account = store.createLedgerAccount({
          companyId: req.params.companyId,
          name: requiredString(body.name, 'name', { min: 2 }),
          type: enumValue(body.type, 'type', ledgerAccountTypes),
          detailType: optionalString(body.detailType),
          description: optionalString(body.description),
          isActive: optionalBoolean(body.isActive) ?? true,
          isSystem: Boolean(body.isSystem),
        });
      } catch (error: any) {
        throw new HttpError(400, error?.message || 'Could not create ledger account.');
      }
      res.status(201).json(account);
    }),
  );

  app.put(
    '/finance/accounts/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getLedgerAccountById(req.params.id);
      if (!existing) throw new HttpError(404, 'Ledger account not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      let account;
      try {
        account = store.updateLedgerAccount(req.params.id, {
          name: body.name !== undefined ? requiredString(body.name, 'name', { min: 2 }) : undefined,
          type: body.type !== undefined ? enumValue(body.type, 'type', ledgerAccountTypes) : undefined,
          detailType: body.detailType !== undefined ? optionalString(body.detailType) : undefined,
          description: body.description !== undefined ? optionalString(body.description) : undefined,
          isActive: body.isActive !== undefined ? optionalBoolean(body.isActive) ?? false : undefined,
        });
      } catch (error: any) {
        throw new HttpError(400, error?.message || 'Could not update ledger account.');
      }
      if (!account) throw new HttpError(404, 'Ledger account not found.');
      res.json(account);
    }),
  );

  app.delete(
    '/finance/accounts/:id',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getLedgerAccountById(req.params.id);
      if (!existing) throw new HttpError(404, 'Ledger account not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      try {
        const deleted = store.deleteLedgerAccount(req.params.id);
        if (!deleted) throw new HttpError(404, 'Ledger account not found.');
      } catch (error: any) {
        throw new HttpError(400, error?.message || 'Could not delete ledger account.');
      }
      res.status(204).end();
    }),
  );

  app.get(
    '/companies/:companyId/finance/journal',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      res.json(store.listJournalEntries(req.params.companyId, limit));
    }),
  );

  app.post(
    '/companies/:companyId/finance/journal',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const lines = parseJournalLines(body.lines);
      ensureJournalLinesBelongToCompany(lines, req.params.companyId);
      let entry;
      try {
        entry = withActor(req, () =>
          store.createJournalEntry({
            companyId: req.params.companyId,
            memo: optionalString(body.memo),
            entryDate: new Date(requiredDateInput(body.entryDate, 'entryDate')),
            sourceType: enumValue(
              body.sourceType ?? 'manual',
              'sourceType',
              ['manual', 'invoice', 'invoice_payment', 'vendor_bill', 'vendor_bill_payment'],
            ),
            sourceId: optionalString(body.sourceId),
            lines,
          }),
        );
      } catch (error: any) {
        throw new HttpError(400, error?.message || 'Could not post journal entry.');
      }
      res.status(201).json(entry);
    }),
  );

  app.get(
    '/companies/:companyId/finance/vendor-bills',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listVendorBills(req.params.companyId));
    }),
  );

  app.get(
    '/companies/:companyId/finance/supplier-payables',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.listSupplierPayables(req.params.companyId));
    }),
  );

  app.post(
    '/companies/:companyId/finance/vendor-bills',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const paidAt = optionalDateInput(body.paidAt);
      const expenseAccountId = optionalString(body.expenseAccountId);
      ensureLedgerAccountBelongsToCompany(expenseAccountId, req.params.companyId);
      const supplierId = optionalString(body.supplierId);
      const supplier = ensureSupplierBelongsToCompany(supplierId, req.params.companyId);
      const purchaseOrderId = optionalString(body.purchaseOrderId);
      const purchaseOrder = ensurePurchaseOrderBelongsToCompany(purchaseOrderId, req.params.companyId);
      if (purchaseOrder && supplier && purchaseOrder.supplierId && purchaseOrder.supplierId !== supplier.id) {
        throw new HttpError(400, 'purchaseOrderId does not match the selected supplier.');
      }
      const issueDate = new Date(requiredDateInput(body.issueDate, 'issueDate'));
      const derivedSupplier = supplier || ensureSupplierBelongsToCompany(purchaseOrder?.supplierId, req.params.companyId);
      const dueDateInput = optionalDateInput(body.dueDate);
      const dueDate = dueDateInput
        ? new Date(dueDateInput)
        : new Date(
            issueDate.getTime() +
              ((derivedSupplier?.paymentTermsDays ?? 0) * 24 * 60 * 60 * 1000),
          );
      const amount =
        optionalNumber(body.amount) ??
        (purchaseOrder ? purchaseOrder.totalAmount : undefined);
      if (amount === undefined || amount <= 0) {
        throw new HttpError(400, 'amount must be greater than zero.');
      }
      if (purchaseOrder) {
        const payableSummary = store
          .listPurchaseOrderPayables(req.params.companyId)
          .find((summary) => summary.purchaseOrderId === purchaseOrder.id);
        if (payableSummary && amount > payableSummary.remainingToBill + 0.0001) {
          throw new HttpError(
            400,
            `amount exceeds the remaining purchase order amount (${payableSummary.remainingToBill.toFixed(2)}).`,
          );
        }
      }
      let bill;
      try {
        bill = withActor(req, () =>
          store.createVendorBill({
            companyId: req.params.companyId,
            vendorName:
              derivedSupplier?.name ||
              purchaseOrder?.supplierName ||
              requiredString(body.vendorName, 'vendorName', { min: 2 }),
            supplierId: derivedSupplier?.id,
            purchaseOrderId: purchaseOrder?.id,
            referenceInvoiceNumber: optionalString(body.referenceInvoiceNumber),
            issueDate,
            dueDate,
            amount,
            status: enumValue(body.status ?? 'Draft', 'status', vendorBillStatuses),
            notes: optionalString(body.notes),
            expenseAccountId,
            paidAt: paidAt ? new Date(paidAt) : undefined,
          }),
        );
      } catch (error: any) {
        throw new HttpError(400, error?.message || 'Could not create vendor bill.');
      }
      res.status(201).json(bill);
    }),
  );

  app.patch(
    '/vendor-bills/:id/status',
    authMiddleware,
    handler((req, res) => {
      const existing = store.getVendorBillById(req.params.id);
      if (!existing) throw new HttpError(404, 'Vendor bill not found.');
      requireCompanyRoles(req, existing.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      let updated;
      try {
        updated = withActor(req, () =>
          store.updateVendorBillStatus(
            req.params.id,
            enumValue(body.status, 'status', vendorBillStatuses),
          ),
        );
      } catch (error: any) {
        throw new HttpError(400, error?.message || 'Could not update vendor bill status.');
      }
      if (!updated) throw new HttpError(404, 'Vendor bill not found.');
      res.json(updated);
    }),
  );

  app.get(
    '/vendor-bills/:id/payments',
    authMiddleware,
    handler((req, res) => {
      const bill = store.getVendorBillById(req.params.id);
      if (!bill) throw new HttpError(404, 'Vendor bill not found.');
      requireCompanyRoles(req, bill.companyId, companyManagementRoles);
      res.json(store.listVendorBillPayments(req.params.id));
    }),
  );

  app.post(
    '/vendor-bills/:id/payments',
    authMiddleware,
    handler((req, res) => {
      const bill = store.getVendorBillById(req.params.id);
      if (!bill) throw new HttpError(404, 'Vendor bill not found.');
      requireCompanyRoles(req, bill.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const amount = requiredNumber(body.amount, 'amount');
      if (amount <= 0) {
        throw new HttpError(400, 'amount must be greater than zero.');
      }
      let result;
      try {
        result = withActor(req, () =>
          store.createVendorBillPayment({
            billId: req.params.id,
            amount,
            method: optionalString(body.method),
            note: optionalString(body.note),
            paidAt: optionalDateInput(body.paidAt)
              ? new Date(requiredDateInput(body.paidAt, 'paidAt'))
              : new Date(),
          }),
        );
      } catch (error: any) {
        throw new HttpError(400, error?.message || 'Could not create vendor bill payment.');
      }
      res.status(201).json(result);
    }),
  );

  app.delete(
    '/vendor-bills/:id/payments/:paymentId',
    authMiddleware,
    handler((req, res) => {
      const bill = store.getVendorBillById(req.params.id);
      if (!bill) throw new HttpError(404, 'Vendor bill not found.');
      requireCompanyRoles(req, bill.companyId, companyManagementRoles);
      const exists = store.listVendorBillPayments(req.params.id).some((p) => p.id === req.params.paymentId);
      if (!exists) throw new HttpError(404, 'Payment not found.');
      let updated;
      try {
        updated = withActor(req, () => store.reverseVendorBillPayment(req.params.paymentId));
      } catch (error) {
        throw new HttpError(
          400,
          error instanceof Error ? error.message : 'Could not reverse vendor bill payment.',
        );
      }
      if (!updated) throw new HttpError(404, 'Payment not found.');
      res.json(updated);
    }),
  );

  app.post(
    '/companies/:companyId/finance/vendor-bills/bulk-status',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const targetStatus = enumValue(body.targetStatus, 'targetStatus', vendorBillStatuses);
      const billIds = body.billIds ? stringArray(body.billIds, 'billIds') : undefined;
      const currentStatus =
        body.currentStatus !== undefined
          ? enumValue(body.currentStatus, 'currentStatus', vendorBillStatuses)
          : undefined;
      let bills = store.listVendorBills(req.params.companyId);
      if (billIds?.length) {
        const idSet = new Set(billIds);
        bills = bills.filter((bill) => idSet.has(bill.id));
      } else if (currentStatus) {
        bills = bills.filter((bill) => bill.status === currentStatus);
      }
      let updated;
      try {
        updated = bills
          .map((bill) => withActor(req, () => store.updateVendorBillStatus(bill.id, targetStatus)))
          .filter(Boolean);
      } catch (error: any) {
        throw new HttpError(400, error?.message || 'Could not apply bulk status update.');
      }
      res.json({ updatedCount: updated.length, items: updated });
    }),
  );

  app.get(
    '/companies/:companyId/finance/overview',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.getFinanceOverview(req.params.companyId));
    }),
  );

  app.get(
    '/companies/:companyId/finance/aging',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const asOf = req.query.asOf ? new Date(String(req.query.asOf)) : new Date();
      if (Number.isNaN(asOf.getTime())) {
        throw new HttpError(400, 'asOf must be a valid date.');
      }
      res.json({
        asOf,
        receivables: store.getReceivablesAging(req.params.companyId, asOf),
        payables: store.getPayablesAging(req.params.companyId, asOf),
      });
    }),
  );

  app.get(
    '/companies/:companyId/finance/accounts/:accountId/activity',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const from = req.query.from ? new Date(String(req.query.from)) : undefined;
      const to = req.query.to ? new Date(String(req.query.to)) : undefined;
      if (from && Number.isNaN(from.getTime())) {
        throw new HttpError(400, 'from must be a valid date.');
      }
      if (to && Number.isNaN(to.getTime())) {
        throw new HttpError(400, 'to must be a valid date.');
      }
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      try {
        res.json(
          store.getAccountActivity(req.params.companyId, req.params.accountId, {
            from,
            to,
            limit,
          }),
        );
      } catch (error: any) {
        throw new HttpError(404, error?.message || 'Account activity not found.');
      }
    }),
  );

  app.get(
    '/companies/:companyId/finance/trial-balance',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const asOf = req.query.asOf ? new Date(String(req.query.asOf)) : new Date();
      if (Number.isNaN(asOf.getTime())) {
        throw new HttpError(400, 'asOf must be a valid date.');
      }
      res.json(store.getTrialBalance(req.params.companyId, asOf));
    }),
  );

  app.get(
    '/companies/:companyId/finance/profit-and-loss',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const from = req.query.from ? new Date(String(req.query.from)) : undefined;
      const to = req.query.to ? new Date(String(req.query.to)) : new Date();
      if (from && Number.isNaN(from.getTime())) {
        throw new HttpError(400, 'from must be a valid date.');
      }
      if (Number.isNaN(to.getTime())) {
        throw new HttpError(400, 'to must be a valid date.');
      }
      res.json(store.getProfitAndLoss(req.params.companyId, from, to));
    }),
  );

  app.get(
    '/companies/:companyId/dashboard',
    authMiddleware,
    handler((req, res) => {
      requireCompanyAccess(req, req.params.companyId);
      const role = getEffectiveRole(req.user!, req.params.companyId);
      if (!role) {
        throw new HttpError(403, 'You do not have a role in this company.');
      }
      res.json(
        store.getDashboardPayload(req.params.companyId, {
          userId: req.user!.id,
          role,
        }),
      );
    }),
  );

  app.get(
    '/companies/:companyId/reports/management-summary',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Accountant']);
      res.json(store.getManagementReportSummary(req.params.companyId));
    }),
  );

  app.get(
    '/companies/:companyId/reports/export/:dataset',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Accountant']);
      const { companyId, dataset } = req.params;
      const safeDate = new Date().toISOString().slice(0, 10);
      let filename = `report-${dataset}-${safeDate}.csv`;
      let csv: string | undefined;
      const summary = store.getManagementReportSummary(companyId);

      if (dataset === 'management-kpis') {
        csv = toCsv(
          ['section', 'metric', 'value'],
          [
            ['finance', 'openReceivables', summary.finance.openReceivables],
            ['finance', 'openPayables', summary.finance.openPayables],
            ['finance', 'paidThisMonth', summary.finance.paidThisMonth],
            ['finance', 'paidPayablesThisMonth', summary.finance.paidPayablesThisMonth],
            ['finance', 'billedThisMonth', summary.finance.billedThisMonth],
            ['inventory', 'totalItems', summary.inventory.totalItems],
            ['inventory', 'stockValue', summary.inventory.stockValue],
            ['inventory', 'lowStockCount', summary.inventory.lowStockCount],
            ['inventory', 'outOfStockCount', summary.inventory.outOfStockCount],
            ['purchases', 'openOrders', summary.purchases.openOrders],
            ['purchases', 'orderedSpend', summary.purchases.orderedSpend],
            ['purchases', 'awaitingReceiptUnits', summary.purchases.awaitingReceiptUnits],
            ['purchases', 'unbilledValue', summary.purchases.unbilledValue],
          ],
        );
      } else if (dataset === 'clients') {
        csv = toCsv(
          ['clientName', 'invoiceCount', 'totalBilled', 'paidAmount', 'outstandingAmount'],
          summary.topClients.map((client) => [
            client.clientName,
            client.invoiceCount,
            client.totalBilled,
            client.paidAmount,
            client.outstandingAmount,
          ]),
        );
      } else if (dataset === 'suppliers') {
        csv = toCsv(
          [
            'supplierName',
            'purchaseOrderCount',
            'totalOrderedAmount',
            'totalBilledAmount',
            'openPayables',
            'remainingToBill',
          ],
          summary.topSuppliers.map((supplier) => [
            supplier.supplierName,
            supplier.purchaseOrderCount,
            supplier.totalOrderedAmount,
            supplier.totalBilledAmount,
            supplier.openPayables,
            supplier.remainingToBill,
          ]),
        );
      } else if (dataset === 'inventory-alerts') {
        csv = toCsv(
          ['sku', 'name', 'category', 'onHand', 'reorderPoint', 'unitCost', 'location'],
          summary.lowStockItems.map((item) => [
            item.sku,
            item.name,
            item.category,
            item.onHand,
            item.reorderPoint,
            item.unitCost,
            item.location || '',
          ]),
        );
      } else if (dataset === 'activity-log') {
        const events = store.listActivityEvents(companyId, { limit: 500 });
        csv = toCsv(
          ['createdAt', 'actorName', 'entityType', 'entityId', 'action', 'summary'],
          events.map((event) => [
            event.createdAt.toISOString(),
            event.actorName || '',
            event.entityType,
            event.entityId,
            event.action,
            event.summary,
          ]),
        );
      }

      if (!csv) throw new HttpError(404, `Unsupported dataset "${dataset}"`);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    }),
  );

  app.get(
    '/companies/:companyId/finance/export/:dataset',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const { companyId, dataset } = req.params;
      const safeDate = new Date().toISOString().slice(0, 10);
      let filename = `finance-${dataset}-${safeDate}.csv`;
      let csv: string | undefined;
      const asOf = req.query.asOf ? new Date(String(req.query.asOf)) : new Date();
      const from = req.query.from ? new Date(String(req.query.from)) : undefined;
      const to = req.query.to ? new Date(String(req.query.to)) : new Date();
      if (req.query.asOf && Number.isNaN(asOf.getTime())) {
        throw new HttpError(400, 'asOf must be a valid date.');
      }
      if (from && Number.isNaN(from.getTime())) {
        throw new HttpError(400, 'from must be a valid date.');
      }
      if (req.query.to && Number.isNaN(to.getTime())) {
        throw new HttpError(400, 'to must be a valid date.');
      }

      if (dataset === 'invoices') {
        const invoices = store.listInvoices(companyId);
        csv = toCsv(
          ['invoiceNumber', 'clientId', 'issueDate', 'dueDate', 'total', 'status', 'currency', 'taxRate'],
          invoices.map((invoice) => [
            invoice.invoiceNumber,
            invoice.clientId,
            invoice.issueDate.toISOString(),
            invoice.dueDate.toISOString(),
            invoice.total,
            invoice.status,
            invoice.currency || 'USD',
            invoice.taxRate ?? 0,
          ]),
        );
      } else if (dataset === 'vendor-bills') {
        const bills = store.listVendorBills(companyId);
        csv = toCsv(
          ['billNumber', 'referenceInvoiceNumber', 'vendorName', 'issueDate', 'dueDate', 'amount', 'status', 'paidAt'],
          bills.map((bill) => [
            bill.billNumber,
            bill.referenceInvoiceNumber || '',
            bill.vendorName,
            bill.issueDate.toISOString(),
            bill.dueDate.toISOString(),
            bill.amount,
            bill.status,
            bill.paidAt ? bill.paidAt.toISOString() : '',
          ]),
        );
      } else if (dataset === 'journal') {
        const entries = store.listJournalEntries(companyId, 500);
        csv = toCsv(
          ['entryId', 'entryDate', 'sourceType', 'sourceId', 'memo', 'lineId', 'accountId', 'description', 'debit', 'credit'],
          entries.flatMap((entry) =>
            entry.lines.map((line) => [
              entry.id,
              entry.entryDate.toISOString(),
              entry.sourceType,
              entry.sourceId || '',
              entry.memo || '',
              line.id,
              line.accountId,
              line.description || '',
              line.debit,
              line.credit,
            ]),
          ),
        );
      } else if (dataset === 'accounts') {
        const accounts = store.listLedgerAccounts(companyId);
        csv = toCsv(
          ['code', 'name', 'type', 'detailType', 'description', 'isActive', 'isSystem'],
          accounts.map((account) => [
            account.code,
            account.name,
            account.type,
            account.detailType || '',
            account.description || '',
            account.isActive === false ? 'false' : 'true',
            account.isSystem ? 'true' : 'false',
          ]),
        );
      } else if (dataset === 'aging') {
        filename = `finance-aging-${safeDate}.csv`;
        const receivables = store.getReceivablesAging(companyId, asOf);
        const payables = store.getPayablesAging(companyId, asOf);
        csv = toCsv(
          ['bucket', 'receivables', 'payables'],
          receivables.map((bucket) => [
            bucket.bucket,
            bucket.amount,
            payables.find((payable) => payable.bucket === bucket.bucket)?.amount || 0,
          ]),
        );
      } else if (dataset === 'trial-balance') {
        filename = `finance-trial-balance-${safeDate}.csv`;
        const report = store.getTrialBalance(companyId, asOf);
        csv = toCsv(
          ['asOf', 'code', 'name', 'type', 'debitTotal', 'creditTotal', 'debitBalance', 'creditBalance'],
          report.lines.map((line) => [
            report.asOf.toISOString(),
            line.code,
            line.name,
            line.type,
            line.debitTotal,
            line.creditTotal,
            line.debitBalance,
            line.creditBalance,
          ]),
        );
      } else if (dataset === 'profit-and-loss') {
        filename = `finance-profit-and-loss-${safeDate}.csv`;
        const report = store.getProfitAndLoss(companyId, from, to);
        csv = toCsv(
          ['from', 'to', 'section', 'code', 'name', 'amount'],
          [
            ...report.revenue.map((line) => [
              report.from.toISOString(),
              report.to.toISOString(),
              'Revenue',
              line.code,
              line.name,
              line.amount,
            ]),
            ...report.expenses.map((line) => [
              report.from.toISOString(),
              report.to.toISOString(),
              'Expense',
              line.code,
              line.name,
              line.amount,
            ]),
            [report.from.toISOString(), report.to.toISOString(), 'Total', 'Revenue', 'Total Revenue', report.totalRevenue],
            [report.from.toISOString(), report.to.toISOString(), 'Total', 'Expenses', 'Total Expenses', report.totalExpenses],
            [report.from.toISOString(), report.to.toISOString(), 'Total', 'Net', 'Net Income', report.netIncome],
          ],
        );
      }

      if (!csv) throw new HttpError(404, `Unsupported dataset "${dataset}"`);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    }),
  );

  app.post(
    '/seed',
    authMiddleware,
    handler((req, res) => {
      requireAdmin(req);
      if (!allowSeedReset) {
        throw new HttpError(403, 'Seed reset is disabled in this environment.');
      }
      store.reset();
      res.json({ success: true });
    }),
  );

  app.use((_req, _res, next) => {
    next(new HttpError(404, 'Route not found.'));
  });

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ message: error.message });
    }
    if (
      error
      && typeof error === 'object'
      && 'type' in error
      && error.type === 'entity.too.large'
    ) {
      return res.status(413).json({ message: 'Request is too large. Uploaded images must be 2 MB or smaller.' });
    }
    logger.error(`Unhandled error for ${req.method} ${req.originalUrl}`, error);
    res.status(500).json({ message: 'Internal server error.' });
  });

  return app;
}
