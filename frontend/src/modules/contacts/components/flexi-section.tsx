'use client';

import * as React from 'react';
import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { getContactFlexi, type FlexiBalance, type StaffFlexiApplication } from '@/services/portalAccessService';
import { FlexiStatusBadge, flexiKindLabel, fmtMoney } from '@/modules/portal-access/components/flexi-applications-page';

/** A client's Peak Flexi balance and its application history, for reviewers. */
export function FlexiSection({ contactId }: { contactId: string }) {
  const { language } = useI18n();
  const tr = React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]);
  const { selectedCompany } = useCompany();
  const [data, setData] = React.useState<{ balance: FlexiBalance; currency: string; applications: StaffFlexiApplication[] } | null>(null);

  React.useEffect(() => {
    if (!selectedCompany) return;
    getContactFlexi(selectedCompany.id, contactId).then(setData).catch(() => setData(null));
  }, [selectedCompany, contactId]);

  if (!data || (!data.balance.enabled && data.applications.length === 0)) return null;
  const { balance, applications, currency } = data;
  const open = applications.find((a) => a.status === 'new');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" aria-hidden="true" />{tr('Peak Flexi', 'بيك فلكسي')}</CardTitle>
        <CardDescription>
          {balance.enabled
            ? tr(`${balance.upfrontPct}% down, up to ${balance.maxMonths} months`, `دفعة مقدمة ${balance.upfrontPct}%، لين ${balance.maxMonths} شهر`)
            : tr('No balance yet', 'ما عنده رصيد لسا')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {balance.enabled && (
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div><dt className="text-muted-foreground">{tr('Balance', 'الرصيد')}</dt><dd className="text-lg font-semibold">{fmtMoney(balance.balance, currency, language)}</dd></div>
            <div><dt className="text-muted-foreground">{tr('Used', 'المستخدم')}</dt><dd className="text-lg font-semibold">{fmtMoney(balance.used, currency, language)}</dd></div>
            <div><dt className="text-muted-foreground">{tr('Available', 'المتاح')}</dt><dd className="text-lg font-semibold">{fmtMoney(balance.available, currency, language)}</dd></div>
          </dl>
        )}
        {open && (
          <Link href={`/crm/flexi?id=${open.id}`} className="block rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            {tr('An application is waiting for review. Open it', 'فيه طلب ينتظر المراجعة. افتحه')}
          </Link>
        )}
        <ul className="divide-y rounded-lg border text-sm">
          {applications.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>{flexiKindLabel(a.kind, tr)} · {new Date(a.createdAt).toLocaleDateString(language === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB')}</span>
              <span className="flex items-center gap-2">
                {a.approvedAmount !== null && <span className="font-medium">{fmtMoney(a.approvedAmount, currency, language)}</span>}
                <FlexiStatusBadge status={a.status} tr={tr} />
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
