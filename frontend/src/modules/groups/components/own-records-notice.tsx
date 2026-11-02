'use client';

/**
 * While a group is open whole, a page that can't show a whole group yet shows
 * the group company's own records and says so, so one company's figures are
 * never read as the group's.
 */
import { usePathname } from 'next/navigation';
import { Layers } from 'lucide-react';
import { useCompany } from '@/context/company-context';
import { useCompanyScope } from '@/context/company-scope-context';
import { useI18n } from '@/context/i18n-context';
import { needsOwnRecordsNotice } from '@/modules/groups/lib/group-aware';

export function OwnRecordsNotice() {
  const pathname = usePathname() ?? '/';
  const { selectedCompany } = useCompany();
  const { inTree } = useCompanyScope();
  const { language } = useI18n();
  if (!inTree || !selectedCompany || !needsOwnRecordsNotice(pathname)) return null;
  const name = selectedCompany.name;
  return (
    <div role="note" className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <Layers className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        {language === 'ar'
          ? `تعرض هذه الصفحة سجلات ${name} نفسها فقط. عرض المجموعة كاملة لهذه الصفحة قادم قريبًا.`
          : `This page shows ${name}'s own records. The whole-group view for this page is coming next.`}
      </span>
    </div>
  );
}
