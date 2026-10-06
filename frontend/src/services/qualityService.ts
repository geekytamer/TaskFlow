import { apiFetch } from '@/lib/api-client';

export type InspectionStage = 'incoming' | 'in_process' | 'final';
export interface InspectionCheck { name: string; expected?: string; actual?: string; pass: boolean }
export interface Inspection {
  id: string; lotId: string; stage: InspectionStage; result: 'pass' | 'fail'; checks: InspectionCheck[];
  notes: string | null; inspectedByName: string | null; inspectedAt: string;
}
export interface LotTrace {
  lot: { id: string; lotNumber: string; status: string; quantity: number; initialQuantity: number; expiryDate?: string; receivedAt: string; note?: string };
  item: { id: string; name: string; sku: string; unit: string } | null;
  supplier: { id: string; name: string } | null;
  inspections: Inspection[];
  shipments: Array<{ deliveryId: string; deliveryNumber: string; status: string; dispatchedAt: string | null; quantity: number; salesOrderNumber: string | null; clientName: string | null }>;
  movements: Array<{ at: string; type: string; quantity: number; note: string | null }>;
}

export const inspectLot = (lotId: string, data: { stage: InspectionStage; checks: InspectionCheck[]; notes?: string }) =>
  apiFetch<{ inspection: Inspection }>(`/inventory-lots/${lotId}/inspections`, { method: 'POST', body: JSON.stringify(data) });

export const traceLot = (lotId: string) => apiFetch<LotTrace>(`/inventory-lots/${lotId}/trace`);
