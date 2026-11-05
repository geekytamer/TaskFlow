import type { Express } from 'express';
import { RECORD_ENTITY_MODULES } from '../permissions/company-modules';
import { snippetOf } from '../documents/text-extract';
import type { RecordAttachment, UserRole } from '../types';
import type { RouteContext } from './context';
import { type AuthedRequest, handler } from './shared';

/**
 * Documents → Library (spec 2026-11-06-documents-hub-design): every attachment and
 * generated document of a company that the person could open from its own record,
 * in one list. Never more: each row passes its record's own visibility rule.
 */

const MANAGEMENT: UserRole[] = ['Admin', 'Manager', 'Accountant'];
const LIMIT = 500;

/** Where a record opens in the app, by entity type. */
const ROUTES: Readonly<Record<string, (id: string, record: any) => string | null>> = {
  company: () => null,
  task: (_id, r) => (r?.projectId ? `/projects/${r.projectId}` : '/tasks'),
  project: (id) => `/projects/${id}`,
  contact: (id) => `/contacts/${id}`,
  client: (id) => `/contacts/${id}`,
  supplier: (id) => `/contacts/${id}`,
  opportunity: () => '/crm/opportunities',
  campaign: () => '/crm/campaigns',
  commission: () => '/crm/commissions',
  invoice: () => '/finance?tab=invoices',
  credit_note: () => '/finance?tab=invoices',
  payment: () => '/finance?tab=invoices',
  vendor_bill: () => '/finance?tab=payables',
  vendor_payment: () => '/finance?tab=payables',
  sales_order: () => '/sales',
  delivery: () => '/sales',
  quotation: () => '/sales?tab=quotations',
  purchase_order: () => '/purchases',
  purchase_receipt: () => '/purchases',
  inventory_item: () => '/inventory',
  stock_movement: () => '/inventory',
  employee: () => '/hr/employees',
  payroll_run: () => '/hr/payroll',
  document: () => '/documents?tab=documents',
  ledger_account: () => '/finance',
  journal_entry: () => '/finance',
};

const LABEL_FIELDS = ['name', 'title', 'invoiceNumber', 'billNumber', 'orderNumber', 'quoteNumber', 'deliveryNumber', 'creditNoteNumber', 'receiptNumber', 'number', 'reference'];

export interface LibraryItem {
  id: string;
  kind: 'attachment' | 'document';
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  folder?: string;
  hasContent: boolean;
  url?: string;
  entityType: string;
  entityId: string;
  recordLabel?: string;
  route: string | null;
  uploadedByName?: string;
  createdAt: Date;
  /** Where the search words appear in the file's text, when they matched inside it. */
  snippet?: string;
}

export function registerLibraryRoutes(app: Express, ctx: RouteContext): void {
  const { store, documentText, authMiddleware, requireCompanyRoles, allowsKey, canSee, canViewProject, canViewTask } = ctx;

  /** The record behind an attachment, by entity type (undefined when gone or unknown). */
  const recordOf = (entityType: string, id: string): any => {
    switch (entityType) {
      case 'task': return store.getTaskById(id);
      case 'project': return store.getProjectById(id);
      case 'contact': case 'client': case 'supplier':
        return store.getContactById(id) ?? (entityType === 'supplier' ? store.getSupplierById(id) : store.getClientById(id));
      case 'opportunity': return store.getOpportunityById(id);
      case 'invoice': return store.getInvoiceById(id);
      case 'credit_note': return store.getCreditNoteById(id);
      case 'vendor_bill': return store.getVendorBillById(id);
      case 'sales_order': return store.getSalesOrderById(id);
      case 'quotation': return store.getQuotationById(id);
      case 'delivery': return store.getDeliveryById(id);
      case 'purchase_order': return store.getPurchaseOrderById(id);
      case 'inventory_item': return store.getInventoryItemById(id);
      case 'employee': return store.getEmployeeById(id);
      case 'document': return store.getDocumentById(id);
      default: return undefined;
    }
  };

  const labelOf = (record: any): string | undefined => {
    if (!record) return undefined;
    for (const field of LABEL_FIELDS) if (typeof record[field] === 'string' && record[field].trim()) return record[field];
    return undefined;
  };

  /** Whether the person could open this record's attachments from the record itself. */
  const mayOpen = (req: AuthedRequest, companyId: string, a: RecordAttachment, record: any): boolean => {
    if (a.entityType === 'company') return a.entityId === companyId;
    const module = RECORD_ENTITY_MODULES[a.entityType];
    if (module && !store.isModuleEnabled(companyId, module)) return false;
    switch (a.entityType) {
      case 'task': return Boolean(record) && record.companyId === companyId && canViewTask(req, record);
      case 'project': return Boolean(record) && record.companyId === companyId && canViewProject(req, record);
      case 'contact': case 'client': case 'supplier':
        if (store.getContactById(a.entityId)) return canSee(req, 'contacts', companyId, a.entityId);
        return allowsKey(req, companyId, 'contacts.view', MANAGEMENT);
      case 'opportunity': return canSee(req, 'opportunities', companyId, a.entityId);
      case 'campaign': return canSee(req, 'campaigns', companyId, a.entityId);
      case 'commission': return canSee(req, 'commissions', companyId, a.entityId);
      default:
        return module ? allowsKey(req, companyId, `${module}.view`, MANAGEMENT) : false;
    }
  };

  app.get(
    '/companies/:companyId/library',
    authMiddleware,
    handler((req, res) => {
      const companyId = req.params.companyId;
      requireCompanyRoles(req, companyId, MANAGEMENT);
      const q = String(req.query.q ?? '').trim().toLowerCase();
      const source = String(req.query.source ?? '').trim();
      const folder = String(req.query.folder ?? '').trim();

      const items: LibraryItem[] = [];
      for (const a of store.listCompanyAttachments(companyId)) {
        const record = a.entityType === 'company' ? undefined : recordOf(a.entityType, a.entityId);
        if (!mayOpen(req, companyId, a, record)) continue;
        items.push({
          id: a.id,
          kind: 'attachment',
          name: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          folder: a.folder,
          hasContent: Boolean(a.hasContent),
          url: a.url,
          entityType: a.entityType,
          entityId: a.entityId,
          recordLabel: labelOf(record),
          route: (ROUTES[a.entityType] ?? (() => null))(a.entityId, record),
          uploadedByName: a.uploadedByName,
          createdAt: a.createdAt,
        });
      }
      for (const d of store.listDocuments(companyId)) {
        items.push({
          id: d.id,
          kind: 'document',
          name: d.title,
          mimeType: 'application/pdf',
          hasContent: true,
          entityType: 'document',
          entityId: d.id,
          recordLabel: d.templateName,
          route: '/documents?tab=documents',
          createdAt: d.createdAt,
        });
      }

      const folders = [...new Set(items.map((i) => i.folder).filter((f): f is string => Boolean(f)))].sort((a, b) => a.localeCompare(b));
      // Words inside a file's text count too (stage 4); only rows already allowed above can match.
      const rawQ = String(req.query.q ?? '').trim();
      const textRank = new Map<string, number>();
      if (rawQ) documentText.search(companyId, rawQ).forEach((hit, i) => textRank.set(`${hit.sourceKind}:${hit.sourceId}`, i));
      const nameMatch = (i: LibraryItem) => [i.name, i.recordLabel, i.folder, i.uploadedByName].some((f) => f && f.toLowerCase().includes(q));
      const matches = items.filter((i) =>
        (!source || i.entityType === source)
        && (!folder || i.folder === folder)
        && (!q || nameMatch(i) || textRank.has(`${i.kind}:${i.id}`)));
      if (q) {
        // Best first: a name match, then the strongest text match, then the newest.
        const score = (i: LibraryItem) => (nameMatch(i) ? -1 : textRank.get(`${i.kind}:${i.id}`) ?? 1e9);
        matches.sort((a, b) => score(a) - score(b) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        for (const item of matches.slice(0, 50)) {
          if (!textRank.has(`${item.kind}:${item.id}`)) continue;
          const text = documentText.get(item.kind, item.id)?.text;
          if (text) item.snippet = snippetOf(text, rawQ);
        }
      } else {
        matches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      res.json({ items: matches.slice(0, LIMIT), truncated: matches.length > LIMIT, folders });
    }),
  );
}
