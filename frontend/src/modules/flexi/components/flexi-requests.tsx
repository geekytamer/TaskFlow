'use client';

import { Megaphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { listFlexiRequests } from '@/services/flexiService';
import { EmptyState, money, PageTitle, RequestLink, shortDate, StateBadge, useCompanyLoad, useTr } from './flexi-ui';

/** Open campaign requests from Flexi clients, each against what the client has left to spend. */
export function FlexiRequestsPage() {
  const { tr, language } = useTr();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const { data } = useCompanyLoad(selectedCompany?.id, listFlexiRequests, (m) => toast({ title: m, variant: 'destructive' }));

  return (
    <div className="space-y-6">
      <PageTitle title={tr('Campaign requests', 'طلبات الحملات')} subtitle={tr('Open requests from Peak Flexi clients, against their available balance.', 'الطلبات المفتوحة من عملاء بيك فلكسي، مقابل رصيدهم المتاح.')} />
      {data === null ? (
        <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>
      ) : data.length === 0 ? (
        <EmptyState icon={Megaphone} title={tr('No requests', 'ما فيه طلبات')} body={tr('Requests from clients with a balance, or asking to pay from one, appear here.', 'هنا تظهر طلبات العملاء اللي عندهم رصيد، أو اللي يبون يدفعون منه.')} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {data.map((r) => (
            <li key={r.id}>
              <RequestLink id={r.id} className="grid gap-2 px-4 py-4 transition-colors hover:bg-muted/50 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-6">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{r.title}</span>
                    {r.flag === 'over_budget' && <Badge variant="outline" className="border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">{tr('Above available', 'أكبر من المتاح')}</Badge>}
                    {r.flag === 'no_account' && <Badge variant="outline" className="border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">{tr('No active balance', 'ما عنده رصيد نشط')}</Badge>}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">{r.clientName} · {shortDate(r.createdAt, language)}</span>
                </span>
                <span className="text-sm"><span className="block text-muted-foreground">{tr('Budget', 'الميزانية')}</span><span className="font-medium tabular-nums">{r.budget === null ? tr('Not given', 'غير محددة') : money(r.budget, r.currency, language)}</span></span>
                <span className="text-sm"><span className="block text-muted-foreground">{tr('Available', 'المتاح')}</span><span className="font-medium tabular-nums">{money(r.available, r.currency, language)}</span></span>
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="secondary">{r.payWith === 'flexi' ? tr('From balance', 'من الرصيد') : tr('In full', 'دفع كامل')}</Badge>
                  <StateBadge state={r.accountState} tr={tr} />
                </span>
              </RequestLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
