'use client';

import * as React from 'react';
import { getCurrentLocale } from '@/lib/locale';
import { cn } from '@/lib/utils';
import { useCompany } from '@/context/company-context';
import { getCompanyFinanceSettings } from '@/services/financeService';

export type SupportedCurrencyCode = 'USD' | 'OMR' | 'AED' | 'SAR' | 'EUR' | 'GBP';

export const supportedCurrencies: Array<{
  code: SupportedCurrencyCode;
  label: string;
  decimals: number;
  symbolAsset?: string;
}> = [
  { code: 'USD', label: 'US Dollar', decimals: 2 },
  { code: 'OMR', label: 'Omani Rial', decimals: 3, symbolAsset: '/currency/omr.svg' },
  { code: 'AED', label: 'UAE Dirham', decimals: 2 },
  { code: 'SAR', label: 'Saudi Riyal', decimals: 2 },
  { code: 'EUR', label: 'Euro', decimals: 2 },
  { code: 'GBP', label: 'British Pound', decimals: 2 },
];

export const defaultCurrencyCode: SupportedCurrencyCode = 'USD';

export function normalizeCurrencyCode(value?: string | null): SupportedCurrencyCode {
  const normalized = String(value || '').trim().toUpperCase();
  return supportedCurrencies.some((currency) => currency.code === normalized)
    ? (normalized as SupportedCurrencyCode)
    : defaultCurrencyCode;
}

export function getCurrencyMeta(value?: string | null) {
  const code = normalizeCurrencyCode(value);
  return supportedCurrencies.find((currency) => currency.code === code) || supportedCurrencies[0];
}

export function formatCurrency(
  value: number,
  currencyCode?: string | null,
  locale = getCurrentLocale(),
) {
  const currency = getCurrencyMeta(currencyCode);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.code,
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  }).format(value || 0);
}

export function CurrencyAmount({
  value,
  currencyCode,
  className,
}: {
  value: number;
  currencyCode?: string | null;
  className?: string;
}) {
  const currency = getCurrencyMeta(currencyCode);
  const [assetMissing, setAssetMissing] = React.useState(false);
  const amount = new Intl.NumberFormat(getCurrentLocale(), {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  }).format(value || 0);

  if (!currency.symbolAsset || assetMissing) {
    return <span className={className}>{formatCurrency(value, currency.code)}</span>;
  }

  return (
    <span className={cn('inline-flex items-center justify-end gap-1 align-baseline', className)} dir="ltr">
      <img
        src={currency.symbolAsset}
        alt={currency.code}
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: '1.15em',
          height: '0.7em',
          maxWidth: '1.15em',
          maxHeight: '0.7em',
          objectFit: 'contain',
          flexShrink: 0,
        }}
        onError={() => setAssetMissing(true)}
      />
      <span>{amount}</span>
    </span>
  );
}

export function useCompanyCurrency() {
  const { selectedCompany } = useCompany();
  const [currencyCode, setCurrencyCode] = React.useState<SupportedCurrencyCode>(defaultCurrencyCode);

  React.useEffect(() => {
    let cancelled = false;
    if (!selectedCompany) {
      setCurrencyCode(defaultCurrencyCode);
      return;
    }
    getCompanyFinanceSettings(selectedCompany.id)
      .then((settings) => {
        if (!cancelled) {
          setCurrencyCode(normalizeCurrencyCode(settings?.currencyCode));
        }
      })
      .catch(() => {
        if (!cancelled) setCurrencyCode(defaultCurrencyCode);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCompany]);

  const money = React.useCallback(
    (value: number) => formatCurrency(value, currencyCode),
    [currencyCode],
  );
  const amount = React.useCallback(
    (value: number, className?: string) => (
      <CurrencyAmount value={value} currencyCode={currencyCode} className={className} />
    ),
    [currencyCode],
  );

  return { currencyCode, money, amount };
}
