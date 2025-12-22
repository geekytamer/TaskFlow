import { apiFetch } from '@/lib/api-client';
import type { Company, Position } from '@/modules/companies/types';

export async function getCompanies(): Promise<Company[]> {
  return apiFetch<Company[]>('/companies');
}

export async function getCompanyById(id: string): Promise<Company | undefined> {
  if (!id) return undefined;
  try {
    return await apiFetch<Company>(`/companies/${id}`);
  } catch (error) {
    console.error(`Error fetching company ${id}`, error);
    return undefined;
  }
}

export async function createCompany(companyData: Omit<Company, 'id'>): Promise<Company> {
  return apiFetch<Company>('/companies', {
    method: 'POST',
    body: JSON.stringify(companyData),
  });
}

export async function deleteCompany(companyId: string): Promise<void> {
  await apiFetch(`/companies/${companyId}`, { method: 'DELETE' });
}

export async function getPositions(): Promise<Position[]> {
  return apiFetch<Position[]>('/positions');
}

export async function getPositionById(id: string): Promise<Position | undefined> {
  if (!id) return undefined;
  try {
    return await apiFetch<Position>(`/positions/${id}`);
  } catch (error) {
    console.error(`Error fetching position ${id}`, error);
    return undefined;
  }
}

export async function createPosition(positionData: Omit<Position, 'id'>): Promise<Position> {
  return apiFetch<Position>('/positions', {
    method: 'POST',
    body: JSON.stringify(positionData),
  });
}

export async function deletePosition(positionId: string): Promise<void> {
  await apiFetch(`/positions/${positionId}`, { method: 'DELETE' });
}
