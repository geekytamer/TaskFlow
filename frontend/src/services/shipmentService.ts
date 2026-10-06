import { apiFetch } from '@/lib/api-client';

export type ShipmentDirection = 'import' | 'export';
export type ShipmentMode = 'sea' | 'air' | 'land';
export type ShipmentStatus = 'planned' | 'in_transit' | 'arrived' | 'cleared' | 'delivered' | 'cancelled';
export interface ShipmentDocument { key: string; name: string; received: boolean; receivedAt: string | null }
export interface Shipment {
  id: string; reference: string; direction: ShipmentDirection; mode: ShipmentMode; carrier: string | null; containers: string[];
  origin: string | null; destination: string | null; etd: string | null; eta: string | null; status: ShipmentStatus;
  purchaseOrderId: string | null; salesOrderId: string | null; documents: ShipmentDocument[]; notes: string | null; statusChangedAt: string;
}
export interface ShipmentInput {
  direction?: ShipmentDirection; mode?: ShipmentMode; carrier?: string; containers?: string; origin?: string; destination?: string;
  etd?: string | null; eta?: string | null; notes?: string; purchaseOrderId?: string | null; salesOrderId?: string | null;
  documents?: Array<{ name: string; received: boolean }>;
}

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });
export const getShipments = (companyId: string) => apiFetch<Shipment[]>(`/companies/${companyId}/shipments`);
export const createShipment = (companyId: string, data: ShipmentInput) => apiFetch<Shipment>(`/companies/${companyId}/shipments`, json('POST', data));
export const updateShipment = (id: string, data: ShipmentInput) => apiFetch<Shipment>(`/shipments/${id}`, json('PUT', data));
export const moveShipment = (id: string, status: ShipmentStatus) => apiFetch<Shipment>(`/shipments/${id}/status`, json('POST', { status }));
export const deleteShipment = (id: string) => apiFetch<void>(`/shipments/${id}`, { method: 'DELETE' });
