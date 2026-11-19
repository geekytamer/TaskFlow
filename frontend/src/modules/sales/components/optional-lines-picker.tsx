'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/context/i18n-context';
import { CurrencyAmount } from '@/lib/currency';
import type { Quotation } from '@/modules/finance/types';

/** Indexes (into quote.items) of the quote's optional priced lines. */
export const optionalIndexes = (quote: Quotation): number[] =>
  quote.items.flatMap((item, index) => (item.optional && item.lineType !== 'section' ? [index] : []));

/** Lets the person tick which optional lines the client took, before a quote becomes an order or invoice. */
export function OptionalLinesPicker({ quote, value, onChange }: { quote: Quotation; value: number[]; onChange: (next: number[]) => void }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const indexes = optionalIndexes(quote);
  if (!indexes.length) return null;
  return (
    <div className="space-y-2">
      <Label>{tr('Optional extras the client took', 'الإضافات الاختيارية التي أخذها العميل')}</Label>
      <p className="text-xs text-muted-foreground">{tr('Unticked extras are left out.', 'الإضافات غير المحددة لن تُضاف.')}</p>
      <ul className="space-y-1">
        {indexes.map((index) => {
          const item = quote.items[index];
          const checked = value.includes(index);
          return (
            <li key={index} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={`opt-${index}`}
                checked={checked}
                onCheckedChange={(next) => onChange(next === true ? [...value, index].sort((a, b) => a - b) : value.filter((i) => i !== index))}
              />
              <label htmlFor={`opt-${index}`} className="min-w-0 flex-1 truncate" dir="auto">{item.description}</label>
              <span className="tabular-nums"><CurrencyAmount value={item.lineTotal} currencyCode={quote.currency as any} /></span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
