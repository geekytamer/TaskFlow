'use client';

/** Names the companies a whole-group page could not show, and why: never a silent gap. */
import { EyeOff } from 'lucide-react';
import { useCompanyScope } from '@/context/company-scope-context';
import { useI18n } from '@/context/i18n-context';
import type { MissingCompany } from '@/lib/fan-out';

export function MissingCompanies({ missing }: { missing: MissingCompany[] }) {
  const { companyName } = useCompanyScope();
  const { language } = useI18n();
  if (!missing.length) return null;
  const ar = language === 'ar';
  const why = (m: MissingCompany) =>
    m.reason === 'forbidden'
      ? (ar ? 'لا صلاحية لك' : 'you have no access')
      : m.reason === 'off'
        ? (ar ? 'الوحدة متوقفة' : 'switched off there')
        : (ar ? 'تعذر التحميل' : "couldn't load");
  return (
    <p role="note" className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
      <EyeOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        {ar ? 'غير معروض: ' : 'Not shown: '}
        {missing.map((m) => `${companyName(m.companyId)} (${why(m)})`).join(ar ? '، ' : ', ')}
      </span>
    </p>
  );
}
