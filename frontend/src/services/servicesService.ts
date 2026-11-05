import { apiFetch } from '@/lib/api-client';
import type { InventoryItem } from '@/modules/operations/types';

/**
 * Sales → Services & prices (spec 2026-11-06-documents-hub-design, stage 3).
 * A service is an item that does not track stock; these routes live behind the
 * sales module, so they work where inventory is switched off.
 */
export interface ServiceInput {
  name: string;
  salePrice: number;
  unit?: string;
  vatApplicable?: boolean;
}

export async function getServices(companyId: string): Promise<InventoryItem[]> {
  if (!companyId) return [];
  return apiFetch<InventoryItem[]>(`/companies/${companyId}/services`);
}

export async function createService(companyId: string, input: ServiceInput): Promise<InventoryItem> {
  return apiFetch<InventoryItem>(`/companies/${companyId}/services`, { method: 'POST', body: JSON.stringify(input) });
}

export async function updateService(id: string, input: Partial<ServiceInput>): Promise<InventoryItem> {
  return apiFetch<InventoryItem>(`/services/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function deleteService(id: string): Promise<{ outcome: 'deleted' | 'archived' }> {
  return apiFetch<{ outcome: 'deleted' | 'archived' }>(`/services/${id}`, { method: 'DELETE' });
}
