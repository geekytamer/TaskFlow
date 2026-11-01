import type { FlexiAccount } from '@/services/flexiService';

const cell = (v: string | number | null) => {
  const s = v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Every Peak Flexi account as a CSV file, for accounting and meetings. */
export function downloadAccountsCsv(accounts: FlexiAccount[], lang: string) {
  const ar = lang === 'ar';
  const head = ar
    ? ['العميل', 'الحالة', 'العملة', 'الرصيد', 'المستخدم', 'المتاح', 'نسبة الاستخدام %', 'الدفعة المقدمة %', 'أقصى مدة (شهر)', 'من تاريخ']
    : ['Client', 'State', 'Currency', 'Balance', 'Used', 'Available', 'Used %', 'Down payment %', 'Max months', 'Since'];
  const rows = accounts.map((a) => [a.name, a.state ?? '', a.currency, a.balance, a.used, a.available, a.usedPct, a.upfrontPct, a.maxMonths, a.since ? a.since.slice(0, 10) : '']);
  // A BOM so Excel opens Arabic names correctly.
  const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `peak-flexi-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
