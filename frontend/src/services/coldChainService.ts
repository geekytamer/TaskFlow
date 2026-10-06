import { apiFetch } from '@/lib/api-client';

export interface StorageConditions { warehouseId: string; tempMin: number; tempMax: number; humidityMax: number | null; readingIntervalHours: number }
export interface StorageReading { id: string; recordedAt: string; temperature: number; humidity: number | null; excursion: boolean; note: string | null; recordedByName: string | null }
export interface StorageView { conditions: StorageConditions | null; readings: StorageReading[] }

export const getStorage = (warehouseId: string) => apiFetch<StorageView>(`/warehouses/${warehouseId}/storage`);
export const setStorage = (warehouseId: string, data: { tempMin: number; tempMax: number; humidityMax: number | null; readingIntervalHours: number } | { monitored: false }) =>
  apiFetch<StorageView>(`/warehouses/${warehouseId}/storage`, { method: 'PUT', body: JSON.stringify(data) });
export const addReading = (warehouseId: string, data: { temperature: number; humidity?: number | null; note?: string }) =>
  apiFetch<StorageReading>(`/warehouses/${warehouseId}/readings`, { method: 'POST', body: JSON.stringify(data) });
