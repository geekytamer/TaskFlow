import { apiFetch } from '@/lib/api-client';
import type {
  InventoryItem,
  InventoryLocationBalance,
  InventoryLot,
  PurchaseOrder,
  PurchaseOrderLineItem,
  PurchaseReceipt,
  PurchaseOrderStatus,
  StockMovement,
  Supplier,
  Warehouse,
} from '@/modules/operations/types';

export interface CreateInventoryItemInput {
  name: string;
  category: string;
  unit: string;
  barcode?: string;
  vatApplicable?: boolean;
  tracksInventory?: boolean;
  onHand: number;
  reorderPoint: number;
  unitCost: number;
  salePrice?: number;
  preferredVendor?: string;
  preferredSupplierId?: string;
  location?: string;
  customFields?: Record<string, unknown>;
}

export interface CreateSupplierInput {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  paymentTermsDays?: number;
  notes?: string;
  isActive?: boolean;
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  contactId?: string;
  orderDate: Date;
  expectedDate?: Date;
  status: PurchaseOrderStatus;
  notes?: string;
  items: PurchaseOrderLineItem[];
}

const toDate = (value: any) => (value ? new Date(value) : undefined);

const mapPurchaseLineItem = (item: any): PurchaseOrderLineItem => {
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
};

const mapPurchaseOrder = (order: any): PurchaseOrder => ({
  ...order,
  orderDate: toDate(order.orderDate) || new Date(),
  expectedDate: toDate(order.expectedDate),
  receivedAt: toDate(order.receivedAt),
  approvalStatus: order.approvalStatus || 'not_required',
  approvedAt: toDate(order.approvedAt),
  items: Array.isArray(order.items) ? order.items.map(mapPurchaseLineItem) : [],
  totalAmount: Number(order.totalAmount || 0),
});

const mapPurchaseReceiptLine = (item: any) => ({
  lineIndex: Number(item?.lineIndex ?? 0),
  inventoryItemId: item?.inventoryItemId ? String(item.inventoryItemId) : undefined,
  sku: item?.sku ? String(item.sku) : undefined,
  description: String(item?.description || ''),
  quantity: Number(item?.quantity || 0),
  unitCost: Number(item?.unitCost || 0),
  lotNumber: item?.lotNumber ? String(item.lotNumber) : undefined,
  expiryDate: toDate(item?.expiryDate),
  manufactureDate: toDate(item?.manufactureDate),
});

const mapPurchaseReceipt = (receipt: any): PurchaseReceipt => ({
  ...receipt,
  receivedAt: toDate(receipt.receivedAt) || new Date(),
  items: Array.isArray(receipt.items) ? receipt.items.map(mapPurchaseReceiptLine) : [],
});

const mapStockMovement = (movement: any): StockMovement => ({
  ...movement,
  quantityChange: Number(movement.quantityChange || 0),
  unitCost:
    movement.unitCost === undefined || movement.unitCost === null
      ? undefined
      : Number(movement.unitCost),
  createdAt: toDate(movement.createdAt) || new Date(),
});

const mapInventoryLocationBalance = (balance: any): InventoryLocationBalance => ({
  companyId: String(balance.companyId || ''),
  inventoryItemId: String(balance.inventoryItemId || ''),
  location: String(balance.location || 'Unassigned'),
  quantity: Number(balance.quantity || 0),
});

const mapInventoryLot = (lot: any): InventoryLot => ({
  ...lot,
  quantity: Number(lot.quantity || 0),
  initialQuantity: Number(lot.initialQuantity || 0),
  unitCost: Number(lot.unitCost || 0),
  expiryDate: toDate(lot.expiryDate),
  manufactureDate: toDate(lot.manufactureDate),
  receivedAt: toDate(lot.receivedAt) || new Date(),
  createdAt: toDate(lot.createdAt) || new Date(),
  updatedAt: toDate(lot.updatedAt) || new Date(),
});

export interface CreateInventoryLotInput {
  lotNumber: string;
  quantity: number;
  location?: string;
  unitCost?: number;
  expiryDate?: string;
  manufactureDate?: string;
  supplierId?: string;
  receivedAt?: string;
  note?: string;
}

export async function getInventoryItems(companyId: string): Promise<InventoryItem[]> {
  if (!companyId) return [];
  return apiFetch<InventoryItem[]>(`/companies/${companyId}/inventory-items`);
}

export async function createInventoryItem(
  companyId: string,
  data: CreateInventoryItemInput,
): Promise<InventoryItem> {
  return apiFetch<InventoryItem>(`/companies/${companyId}/inventory-items`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function adjustInventoryItem(
  companyId: string,
  itemId: string,
  data: { quantityChange: number; note?: string; location?: string },
): Promise<{ item: InventoryItem; movement: StockMovement }> {
  const response = await apiFetch<{ item: InventoryItem; movement: StockMovement }>(
    `/companies/${companyId}/inventory-items/${itemId}/adjustments`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
  return {
    item: response.item,
    movement: mapStockMovement(response.movement),
  };
}

export async function getInventoryLocationBalances(
  companyId: string,
  inventoryItemId?: string,
): Promise<InventoryLocationBalance[]> {
  if (!companyId) return [];
  const query = inventoryItemId
    ? `?inventoryItemId=${encodeURIComponent(inventoryItemId)}`
    : '';
  const balances = await apiFetch<InventoryLocationBalance[]>(
    `/companies/${companyId}/inventory-location-balances${query}`,
  );
  return balances.map(mapInventoryLocationBalance);
}

export async function getInventoryLots(
  companyId: string,
  inventoryItemId?: string,
): Promise<InventoryLot[]> {
  if (!companyId) return [];
  const query = inventoryItemId
    ? `?inventoryItemId=${encodeURIComponent(inventoryItemId)}`
    : '';
  const lots = await apiFetch<InventoryLot[]>(`/companies/${companyId}/inventory-lots${query}`);
  return lots.map(mapInventoryLot);
}

export async function getExpiringLots(
  companyId: string,
  days = 30,
): Promise<InventoryLot[]> {
  if (!companyId) return [];
  const lots = await apiFetch<InventoryLot[]>(
    `/companies/${companyId}/inventory-lots/expiring?days=${encodeURIComponent(days)}`,
  );
  return lots.map(mapInventoryLot);
}

export async function receiveInventoryLot(
  companyId: string,
  itemId: string,
  data: CreateInventoryLotInput,
): Promise<{ lot: InventoryLot; item: InventoryItem }> {
  const response = await apiFetch<{ lot: InventoryLot; item: InventoryItem }>(
    `/companies/${companyId}/inventory-items/${itemId}/lots`,
    { method: 'POST', body: JSON.stringify(data) },
  );
  return { lot: mapInventoryLot(response.lot), item: response.item };
}

export async function consumeInventoryLotsFefo(
  companyId: string,
  itemId: string,
  data: { quantity: number; location?: string; note?: string },
): Promise<{ allocation: Array<{ lotId: string; lotNumber: string; quantity: number }>; item: InventoryItem }> {
  return apiFetch<{
    allocation: Array<{ lotId: string; lotNumber: string; quantity: number }>;
    item: InventoryItem;
  }>(`/companies/${companyId}/inventory-items/${itemId}/consume-fefo`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function issueInventoryItem(
  companyId: string,
  itemId: string,
  data: {
    quantity: number;
    location?: string;
    issuedTo?: string;
    note?: string;
    projectId?: string;
    taskId?: string;
  },
): Promise<{ item: InventoryItem; balances: InventoryLocationBalance[] }> {
  const response = await apiFetch<{
    item: InventoryItem;
    balances: InventoryLocationBalance[];
  }>(`/companies/${companyId}/inventory-items/${itemId}/issues`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return {
    item: response.item,
    balances: Array.isArray(response.balances)
      ? response.balances.map(mapInventoryLocationBalance)
      : [],
  };
}

export async function transferInventoryItem(
  companyId: string,
  itemId: string,
  data: {
    quantity: number;
    fromLocation?: string;
    toLocation: string;
    note?: string;
  },
): Promise<{ item: InventoryItem; balances: InventoryLocationBalance[] }> {
  const response = await apiFetch<{
    item: InventoryItem;
    balances: InventoryLocationBalance[];
  }>(`/companies/${companyId}/inventory-items/${itemId}/transfers`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return {
    item: response.item,
    balances: Array.isArray(response.balances)
      ? response.balances.map(mapInventoryLocationBalance)
      : [],
  };
}

export async function getSuppliers(companyId: string): Promise<Supplier[]> {
  if (!companyId) return [];
  return apiFetch<Supplier[]>(`/companies/${companyId}/suppliers`);
}

export async function createSupplier(
  companyId: string,
  data: CreateSupplierInput,
): Promise<Supplier> {
  return apiFetch<Supplier>(`/companies/${companyId}/suppliers`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getStockMovements(
  companyId: string,
  inventoryItemId?: string,
): Promise<StockMovement[]> {
  if (!companyId) return [];
  const query = inventoryItemId
    ? `?inventoryItemId=${encodeURIComponent(inventoryItemId)}`
    : '';
  const movements = await apiFetch<StockMovement[]>(
    `/companies/${companyId}/stock-movements${query}`,
  );
  return movements.map(mapStockMovement);
}

export async function getPurchaseOrders(companyId: string): Promise<PurchaseOrder[]> {
  if (!companyId) return [];
  const orders = await apiFetch<PurchaseOrder[]>(`/companies/${companyId}/purchase-orders`);
  return orders.map(mapPurchaseOrder);
}

export async function getPurchaseReceipts(
  companyId: string,
  purchaseOrderId?: string,
): Promise<PurchaseReceipt[]> {
  if (!companyId) return [];
  const query = purchaseOrderId
    ? `?purchaseOrderId=${encodeURIComponent(purchaseOrderId)}`
    : '';
  const receipts = await apiFetch<PurchaseReceipt[]>(
    `/companies/${companyId}/purchase-receipts${query}`,
  );
  return receipts.map(mapPurchaseReceipt);
}

export async function createPurchaseOrder(
  companyId: string,
  data: CreatePurchaseOrderInput,
): Promise<PurchaseOrder> {
  const order = await apiFetch<PurchaseOrder>(`/companies/${companyId}/purchase-orders`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return mapPurchaseOrder(order);
}

export async function updatePurchaseOrderStatus(
  orderId: string,
  status: PurchaseOrderStatus,
): Promise<PurchaseOrder> {
  const order = await apiFetch<PurchaseOrder>(`/purchase-orders/${orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return mapPurchaseOrder(order);
}

export async function approvePurchaseOrder(orderId: string): Promise<PurchaseOrder> {
  const order = await apiFetch<PurchaseOrder>(`/purchase-orders/${orderId}/approve`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return mapPurchaseOrder(order);
}

export async function rejectPurchaseOrder(orderId: string, reason?: string): Promise<PurchaseOrder> {
  const order = await apiFetch<PurchaseOrder>(`/purchase-orders/${orderId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return mapPurchaseOrder(order);
}

export async function receivePurchaseOrder(
  orderId: string,
  data: {
    receivedAt?: Date;
    notes?: string;
    items: Array<{
      lineIndex: number;
      quantity: number;
      lotNumber?: string;
      expiryDate?: string;
      manufactureDate?: string;
    }>;
  },
): Promise<PurchaseOrder> {
  const order = await apiFetch<PurchaseOrder>(`/purchase-orders/${orderId}/receipts`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return mapPurchaseOrder(order);
}

// ── Warehouses ───────────────────────────────────────────────────────────────

const mapWarehouse = (w: any): Warehouse => ({
  id: w.id,
  companyId: w.companyId,
  name: w.name,
  code: w.code ?? undefined,
  address: w.address ?? undefined,
  isDefault: Boolean(w.isDefault),
  isActive: Boolean(w.isActive),
  createdAt: toDate(w.createdAt) || new Date(),
  updatedAt: toDate(w.updatedAt) || new Date(),
});

export async function getWarehouses(companyId: string): Promise<Warehouse[]> {
  if (!companyId) return [];
  const data = await apiFetch<any[]>(`/companies/${companyId}/warehouses`);
  return data.map(mapWarehouse);
}

export async function createWarehouse(
  companyId: string,
  input: { name: string; code?: string; address?: string; isDefault?: boolean; isActive?: boolean },
): Promise<Warehouse> {
  const data = await apiFetch<any>(`/companies/${companyId}/warehouses`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return mapWarehouse(data);
}

export async function updateWarehouse(
  id: string,
  updates: { name?: string; code?: string; address?: string; isDefault?: boolean; isActive?: boolean },
): Promise<Warehouse> {
  const data = await apiFetch<any>(`/warehouses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return mapWarehouse(data);
}

export async function deleteWarehouse(id: string): Promise<void> {
  await apiFetch(`/warehouses/${id}`, { method: 'DELETE' });
}

export async function deleteInventoryItem(id: string): Promise<void> {
  await apiFetch(`/inventory-items/${id}`, { method: 'DELETE' });
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  await apiFetch(`/purchase-orders/${id}`, { method: 'DELETE' });
}
