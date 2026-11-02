'use client';

/**
 * Each company's currency, for pages that list several companies' money:
 * a row is shown in its own company's currency, never the group's.
 */
import * as React from 'react';
import { useCompanyScope } from '@/context/company-scope-context';
import { defaultCurrencyCode, normalizeCurrencyCode, type SupportedCurrencyCode } from '@/lib/currency';
import { getCompanyFinanceSettings } from '@/services/financeService';

export function useCurrencyOf(): (companyId: string) => SupportedCurrencyCode {
  const { companyIds } = useCompanyScope();
  const [codes, setCodes] = React.useState<Record<string, SupportedCurrencyCode>>({});
  const key = companyIds.join(',');
  React.useEffect(() => {
    let active = true;
    Promise.all(key.split(',').filter(Boolean).map(async (id) => {
      try {
        const settings = await getCompanyFinanceSettings(id);
        return [id, normalizeCurrencyCode(settings?.currencyCode)] as const;
      } catch {
        return [id, defaultCurrencyCode] as const;
      }
    })).then((pairs) => { if (active) setCodes(Object.fromEntries(pairs)); });
    return () => { active = false; };
  }, [key]);
  return React.useCallback((companyId: string) => codes[companyId] ?? defaultCurrencyCode, [codes]);
}
