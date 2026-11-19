import type { Quotation } from '@/modules/finance/types';

/** Lower-case and drop Arabic diacritics so a typed word matches either way. */
const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[ً-ٰٟ]/g, '');

/** A quote matches when the query is in its number, notes, either name of its client, or either name of any line. */
export function quoteMatches(quote: Quotation, query: string, names: { client: string[] }): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  const haystack = [
    quote.quoteNumber, quote.notes || '', ...names.client,
    ...quote.items.flatMap((i) => [i.description, i.descriptionAr || '', i.descriptionEn || '']),
  ];
  return haystack.some((value) => fold(value).includes(q));
}
