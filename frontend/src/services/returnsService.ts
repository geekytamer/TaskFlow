import { apiFetch } from '@/lib/api-client';

export type ReturnCondition = 'Restock' | 'Scrap';
export type CustomerReturnStatus = 'Draft' | 'Received' | 'Cancelled';

export interface CustomerReturnLine {
  deliveryLineIndex: number;
  inventoryItemId?: string;
  description: string;
  quantity: number;
  condition: ReturnCondition;
  unitCost?: number;
}

export interface CustomerReturn {
  id: string;
  companyId: string;
  returnNumber: string;
  deliveryId: string;
  salesOrderId: string;
  clientId: string;
  status: CustomerReturnStatus;
  reason?: string;
  items: CustomerReturnLine[];
  creditNoteId?: string;
  receivedAt?: Date;
  createdAt: Date;
}

const toDate = (value: any) => (value ? new Date(value) : undefined);
const mapReturn = (row: any): CustomerReturn => ({ ...row, receivedAt: toDate(row.receivedAt), createdAt: toDate(row.createdAt) || new Date() });

export async function getCustomerReturns(companyId: string): Promise<CustomerReturn[]> {
  if (!companyId) return [];
  return (await apiFetch<any[]>(`/companies/${companyId}/customer-returns`)).map(mapReturn);
}

export async function createCustomerReturn(companyId: string, data: {
  deliveryId: string;
  reason?: string;
  items: Array<{ deliveryLineIndex: number; quantity: number; condition: ReturnCondition }>;
}): Promise<CustomerReturn> {
  return mapReturn(await apiFetch<any>(`/companies/${companyId}/customer-returns`, { method: 'POST', body: JSON.stringify(data) }));
}

export async function receiveCustomerReturn(id: string, data: { issueCredit: boolean }): Promise<CustomerReturn> {
  return mapReturn(await apiFetch<any>(`/customer-returns/${id}/receipt`, { method: 'POST', body: JSON.stringify(data) }));
}

export async function cancelCustomerReturn(id: string): Promise<CustomerReturn> {
  return mapReturn(await apiFetch<any>(`/customer-returns/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) }));
}
