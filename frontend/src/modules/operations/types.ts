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
  customFields?: Record<string, unknown>;
}

export interface Supplier {
  id: string;
  companyId: string;
  reference: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  paymentTermsDays?: number;
  notes?: string;
  isActive: boolean;
}

export type PurchaseOrderStatus =
  | 'Draft'
  | 'Ordered'
  | 'Partially Received'
  | 'Received'
  | 'Cancelled';
export const purchaseOrderStatuses: PurchaseOrderStatus[] = [
  'Draft',
  'Ordered',
  'Partially Received',
  'Received',
  'Cancelled',
];

export interface PurchaseOrderLineItem {
  inventoryItemId?: string;
  sku?: string;
  description: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export type PurchaseOrderApprovalStatus =
  | 'not_required'
  | 'pending'
  | 'approved'
  | 'rejected';

export interface PurchaseOrder {
  id: string;
  companyId: string;
  orderNumber: string;
  supplierName: string;
  supplierId?: string;
  contactId?: string;
  orderDate: Date;
  expectedDate?: Date;
  status: PurchaseOrderStatus;
  items: PurchaseOrderLineItem[];
  totalAmount: number;
  notes?: string;
  receivedAt?: Date;
  approvalStatus: PurchaseOrderApprovalStatus;
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
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

export interface Warehouse {
  id: string;
  companyId: string;
  name: string;
  code?: string;
  address?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
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
