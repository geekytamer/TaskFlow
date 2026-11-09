/**
 * Folds the spelling variants people type differently so search finds them
 * either way: أحمد = احمد, مؤسسة = مؤسسه, ى = ي, diacritics and tatweel dropped,
 * Latin lower-cased. Kept identical to backend/src/search-normalize.ts.
 */
export function normalizeSearch(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .normalize('NFKC')
    .replace(/[ً-ٰٟۖ-ۭـ]/g, '') // harakat, superscript alef, Quranic marks, tatweel
    .replace(/[آأإٱ]/g, 'ا') // آ أ إ ٱ → ا
    .replace(/ى/g, 'ي') // ى → ي
    .replace(/ة/g, 'ه') // ة → ه
    .replace(/ؤ/g, 'و') // ؤ → و
    .replace(/ئ/g, 'ي') // ئ → ي
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when any of the texts contains the query, spelling variants folded. */
export function matchesSearch(query: string, ...texts: Array<string | null | undefined>): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  return texts.some((t) => normalizeSearch(t).includes(q));
}
