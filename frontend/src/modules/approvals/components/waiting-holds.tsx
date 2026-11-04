'use client';

/**
 * Credit notes or payments on this invoice or bill that wait for approval
 * (nothing is posted yet). Whoever asked, or an Admin, can withdraw one.
 * Shows nothing when none waits.
 */
import * as React from 'react';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompany } from '@/context/company-context';
import { useCan } from '@/context/permissions-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/currency';
import { useCurrencyOf } from '@/modules/groups/hooks/use-currency-of';
import { getApprovalHolds, withdrawApprovalHold, type ApprovalHold } from '@/services/approvalService';

export function WaitingHolds({ companyId, docType, targetId, currency, onChanged, onTotal }: {
  companyId: string; docType: ApprovalHold['docType']; targetId: string; currency?: string; onChanged?: () => void;
  /** What waits in all, so the form can offer only what is left. */
  onTotal?: (total: number) => void;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { currentUser } = useCompany();
  const { toast } = useToast();
  const currencyOf = useCurrencyOf();
  // Whoever asked can take it back, and so can whoever runs approvals here.
  const administers = useCan('settings.manage_approvals');
  const [holds, setHolds] = React.useState<ApprovalHold[]>([]);
  const load = React.useCallback(() => {
    getApprovalHolds(companyId, { docType, targetId, status: 'pending' })
      .then((list) => { setHolds(list); onTotal?.(list.reduce((sum, h) => sum + h.amount, 0)); })
      .catch(() => setHolds([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, docType, targetId]);
  React.useEffect(load, [load]);
  if (!holds.length) return null;

  const withdraw = async (h: ApprovalHold) => {
    try {
      await withdrawApprovalHold(h.id);
      toast({ title: tr('Withdrawn', 'تم السحب') });
      load();
      onChanged?.();
    } catch (e) {
      toast({ variant: 'destructive', title: tr('Not withdrawn', 'لم يُسحب'), description: (e as Error).message });
    }
  };
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm" role="status">
      <p className="mb-2 flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
        <Clock className="h-4 w-4" aria-hidden="true" />
        {docType === 'vendor_payment' ? tr('Waiting for approval (not paid yet)', 'بانتظار الموافقة (لم تُدفع بعد)') : tr('Waiting for approval (not recorded yet)', 'بانتظار الموافقة (لم يُسجَّل بعد)')}
      </p>
      <ul className="space-y-1">
        {holds.map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-2">
            <span className="tabular-nums">{formatCurrency(h.amount, (currency || currencyOf(companyId)) as never)}</span>
            {(h.requesterId === currentUser?.id || administers) && (
              <Button size="sm" variant="ghost" className="h-7" onClick={() => withdraw(h)}>{tr('Withdraw', 'سحب')}</Button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">{tr('They count against what is left, so the same money can\'t be asked for twice.', 'تُحتسب من المتبقي حتى لا يُطلب المال نفسه مرتين.')}</p>
    </div>
  );
}
