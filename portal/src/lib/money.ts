/** Browser safe. Totals per currency: amounts in different currencies are never added together. */
export function sumByCurrency(rows: Array<{ currency: string; amount: number }>): Array<{ currency: string; amount: number }> {
  const totals = new Map<string, number>();
  rows.forEach((r) => totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.amount));
  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
    .filter((t) => t.amount !== 0)
    .sort((a, b) => a.currency.localeCompare(b.currency));
}
