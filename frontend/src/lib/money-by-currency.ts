/**
 * Totals across companies: one per currency, biggest first. Companies in
 * different currencies are never added together.
 */
export interface CurrencyTotal {
  currencyCode: string;
  value: number;
}

export function sumByCurrency<T>(
  items: readonly T[],
  currencyOf: (item: T) => string,
  valueOf: (item: T) => number,
  emptyCurrency?: string,
): CurrencyTotal[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const code = currencyOf(item);
    totals.set(code, (totals.get(code) ?? 0) + (Number(valueOf(item)) || 0));
  }
  if (!totals.size) return emptyCurrency ? [{ currencyCode: emptyCurrency, value: 0 }] : [];
  return [...totals].map(([currencyCode, value]) => ({ currencyCode, value })).sort((a, b) => b.value - a.value);
}
