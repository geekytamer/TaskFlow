import { apiFetch } from '@/lib/api-client';

/**
 * The other-language name for a record, from the in-app assistant's model
 * (spec 2026-11-10-bilingual-names-design). Saves nothing. `kind` "name" is a
 * person or business (transliterated); "term" a service or product (translated).
 */
export async function suggestName(companyId: string, input: { text: string; from: 'ar' | 'en'; kind: 'name' | 'term' }): Promise<string> {
  const { suggestion } = await apiFetch<{ suggestion: string }>(`/companies/${companyId}/name-suggestion`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return suggestion;
}
