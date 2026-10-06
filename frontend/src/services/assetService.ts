import { apiFetch } from '@/lib/api-client';

export interface FixedAsset {
  id: string;
  name: string;
  category: string | null;
  assetAccountId: string;
  cost: number;
  salvageValue: number;
  acquiredOn: string;
  usefulLifeMonths: number;
  status: 'active' | 'disposed';
  disposedOn: string | null;
  disposalProceeds: number | null;
  acquisitionEntryId: string | null;
  notes: string | null;
  accumulated: number;
  bookValue: number;
  depreciatedThrough: string | null;
  monthly: number;
}

export interface AssetInput {
  name: string;
  category?: string;
  assetAccountId: string;
  paidFromAccountId?: string;
  cost: number;
  salvageValue: number;
  acquiredOn: string;
  usefulLifeMonths: number;
  notes?: string;
}

export interface DepreciationRun { posted: Array<{ period: string; amount: number }>; skipped: Array<{ period: string; reason: string }> }

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });

export const getAssets = (companyId: string) => apiFetch<FixedAsset[]>(`/companies/${companyId}/fixed-assets`);
export const createAsset = (companyId: string, data: AssetInput) => apiFetch<FixedAsset>(`/companies/${companyId}/fixed-assets`, post(data));
export const updateAsset = (id: string, data: Partial<AssetInput>) => apiFetch<FixedAsset>(`/fixed-assets/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAsset = (id: string) => apiFetch<void>(`/fixed-assets/${id}`, { method: 'DELETE' });
export const runDepreciation = (companyId: string, through: string) => apiFetch<DepreciationRun>(`/companies/${companyId}/fixed-assets/depreciation`, post({ through }));
export const disposeAsset = (id: string, data: { disposedOn: string; proceeds: number; depositAccountId?: string }) => apiFetch<FixedAsset>(`/fixed-assets/${id}/disposal`, post(data));
