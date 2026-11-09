/**
 * The display rule for two-language names (spec 2026-11-10-bilingual-names-design):
 * the language's own name, then the other language's, then `name`.
 */
export type NamedRecord = { name?: string; nameAr?: string; nameEn?: string };

export function displayName(record: NamedRecord | null | undefined, language: string | undefined): string {
  if (!record) return '';
  if (language === 'ar') return record.nameAr || record.nameEn || record.name || '';
  if (language === 'en') return record.nameEn || record.nameAr || record.name || '';
  return record.name || record.nameAr || record.nameEn || '';
}

/** Both names joined, for search keywords. */
export function allNames(record: NamedRecord | null | undefined): string {
  if (!record) return '';
  return [record.name, record.nameAr, record.nameEn].filter(Boolean).join(' ');
}
