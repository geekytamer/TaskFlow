import { apiFetch } from '@/lib/api-client';

export type CustomFieldEntityType = 'contact' | 'inventory_item';
export type CustomFieldType = 'text' | 'number' | 'date' | 'boolean' | 'select';

export interface CustomFieldDefinition {
  id: string;
  companyId: string;
  entityType: CustomFieldEntityType;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  options?: string[];
  required: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const decode = (raw: any): CustomFieldDefinition => ({
  ...raw,
  options: Array.isArray(raw.options) ? raw.options : undefined,
  required: Boolean(raw.required),
  sortOrder: Number(raw.sortOrder) || 0,
  createdAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
  updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : new Date(),
});

export async function getCustomFieldDefinitions(
  companyId: string,
  entityType?: CustomFieldEntityType,
): Promise<CustomFieldDefinition[]> {
  const query = entityType ? `?entityType=${entityType}` : '';
  const data = await apiFetch<any[]>(`/companies/${companyId}/custom-fields${query}`);
  return data.map(decode);
}

export async function createCustomFieldDefinition(
  companyId: string,
  input: {
    entityType: CustomFieldEntityType;
    label: string;
    fieldType: CustomFieldType;
    options?: string[];
    required?: boolean;
    sortOrder?: number;
  },
): Promise<CustomFieldDefinition> {
  const data = await apiFetch<any>(`/companies/${companyId}/custom-fields`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return decode(data);
}

export async function updateCustomFieldDefinition(
  id: string,
  updates: { label?: string; options?: string[]; required?: boolean; sortOrder?: number },
): Promise<CustomFieldDefinition> {
  const data = await apiFetch<any>(`/custom-fields/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return decode(data);
}

export async function deleteCustomFieldDefinition(id: string): Promise<void> {
  await apiFetch<void>(`/custom-fields/${id}`, { method: 'DELETE' });
}
