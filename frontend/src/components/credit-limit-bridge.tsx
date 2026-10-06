'use client';

import * as React from 'react';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useI18n } from '@/context/i18n-context';
import { setCreditLimitPrompt, type CreditLimitRefusal } from '@/lib/api-client';

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 });

/**
 * When an invoice or order would take a client past their credit limit and
 * the user may override, ask once and let the API client resend it. Users who
 * may not override just see the refusal from the screen that made the call.
 */
export function CreditLimitBridge() {
  const confirm = useConfirm();
  const { language } = useI18n();
  React.useEffect(() => {
    const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
    setCreditLimitPrompt((r: CreditLimitRefusal) => confirm({
      title: tr('Over the credit limit', 'تجاوز سقف الائتمان'),
      description: tr(
        `This client owes ${money(r.owed)}. Adding ${money(r.adding)} takes them to ${money(r.owed + r.adding)}, over their limit of ${money(r.limit)}. Go ahead anyway?`,
        `يدين هذا العميل بـ ${money(r.owed)}. إضافة ${money(r.adding)} تجعله ${money(r.owed + r.adding)}، فوق سقفه البالغ ${money(r.limit)}. هل تريد المتابعة رغم ذلك؟`,
      ),
      confirmText: tr('Go ahead', 'تابع'),
      cancelText: tr('Cancel', 'إلغاء'),
      destructive: true,
    }));
    return () => setCreditLimitPrompt(null);
  }, [confirm, language]);
  return null;
}
