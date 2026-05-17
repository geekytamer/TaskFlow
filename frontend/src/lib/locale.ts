export function getCurrentLocale(): string {
  if (typeof document !== 'undefined') {
    const lang = document.documentElement.lang?.toLowerCase();
    if (lang?.startsWith('ar')) return 'ar';
  }
  return 'en-US';
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
