'use client';

/** A total that may span currencies: one figure per currency, side by side. */
import { CurrencyAmount } from '@/lib/currency';
import type { CurrencyTotal } from '@/lib/money-by-currency';

export function CurrencyTotals({ totals, className }: { totals: CurrencyTotal[]; className?: string }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {totals.map((t) => (
        <CurrencyAmount key={t.currencyCode} value={t.value} currencyCode={t.currencyCode} className={className} />
      ))}
    </span>
  );
}
