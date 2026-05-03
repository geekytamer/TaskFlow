export function getCurrentLocale(): string {
  if (typeof document !== 'undefined') {
    const lang = document.documentElement.lang?.toLowerCase();
    if (lang?.startsWith('ar')) return 'ar';
  }
  return 'en-US';
}

export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat(getCurrentLocale(), {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(getCurrentLocale()).format(value || 0);
}

export function formatDate(value: Date): string {
  return value.toLocaleDateString(getCurrentLocale());
}

export function formatDateTime(value: Date): string {
  return value.toLocaleString(getCurrentLocale());
}
