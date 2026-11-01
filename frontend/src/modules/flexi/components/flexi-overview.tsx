'use client';

import Link from 'next/link';
import { AlertTriangle, Clock, Megaphone, Snowflake } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { getFlexiOverview } from '@/services/flexiService';
import { money, PageTitle, shortDate, UsageBar, useCompanyLoad, useTr } from './flexi-ui';

/** Peak Flexi at a glance: what is lent out, what is left, and what needs someone today. */
export function FlexiOverviewPage() {
  const { tr, language } = useTr();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const { data } = useCompanyLoad(selectedCompany?.id, getFlexiOverview, (m) => toast({ title: m, variant: 'destructive' }));

  if (!data) return <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>;
  const { totals, alerts, currency } = data;
  const usedPct = totals.balance > 0 ? (totals.used / totals.balance) * 100 : 0;
  const figures: Array<[string, string, string?]> = [
    [tr('Approved balance', 'الأرصدة المعتمدة'), money(totals.balance, currency, language)],
    [tr('Used', 'المستخدم'), money(totals.used, currency, language)],
    [tr('Available', 'المتاح'), money(totals.available, currency, language), 'text-primary'],
    [tr('Active accounts', 'حسابات نشطة'), String(totals.active)],
    [tr('Frozen', 'موقوفة مؤقتًا'), String(totals.frozen)],
    [tr('Waiting for review', 'طلبات تنتظر'), String(totals.waiting)],
  ];
  const nothing = !alerts.staleApplications.length && !alerts.nearLimit.length && !alerts.frozen.length && !alerts.overBudgetRequests.length;

  return (
    <div className="space-y-6">
      <PageTitle title={tr('Peak Flexi', 'بيك فلكسي')} subtitle={tr('Balances, accounts and what needs attention.', 'الأرصدة والحسابات واللي يحتاج متابعة.')} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {figures.map(([label, value, tone]) => (
          <Card key={label}>
            <CardContent className="space-y-1 p-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className={`text-2xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-sm text-muted-foreground"><span>{tr('Used of all balances', 'المستخدم من كل الأرصدة')}</span><span className="tabular-nums">{usedPct.toFixed(0)}%</span></div>
        <UsageBar pct={usedPct} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{tr('Needs attention', 'يحتاج متابعة')}</h2>
        {nothing && <p className="text-sm text-muted-foreground">{tr('Nothing needs attention right now.', 'ما فيه شي يحتاج متابعة الحين.')}</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          {alerts.staleApplications.length > 0 && (
            <Alert icon={Clock} title={tr('Applications waiting more than 2 days', 'طلبات تنتظر أكثر من يومين')}>
              {alerts.staleApplications.map((a) => (
                <Row key={a.id} href={`/flexi/applications?id=${a.id}`} left={a.contactName} right={shortDate(a.createdAt, language)} />
              ))}
            </Alert>
          )}
          {alerts.nearLimit.length > 0 && (
            <Alert icon={AlertTriangle} title={tr('Used 80% or more of their balance', 'استخدموا 80% أو أكثر من رصيدهم')}>
              {alerts.nearLimit.map((a) => <Row key={a.contactId} href={`/flexi/accounts/${a.contactId}`} left={a.name} right={`${a.usedPct.toFixed(0)}%`} />)}
            </Alert>
          )}
          {alerts.frozen.length > 0 && (
            <Alert icon={Snowflake} title={tr('Frozen accounts', 'حسابات موقوفة مؤقتًا')}>
              {alerts.frozen.map((a) => <Row key={a.contactId} href={`/flexi/accounts/${a.contactId}`} left={a.name} right={money(a.balance, currency, language)} />)}
            </Alert>
          )}
          {alerts.overBudgetRequests.length > 0 && (
            <Alert icon={Megaphone} title={tr('Requests above the available balance', 'طلبات أكبر من الرصيد المتاح')}>
              {alerts.overBudgetRequests.map((r) => (
                <Row key={r.id} href={`/crm/client-requests?open=${r.id}`} left={`${r.clientName} · ${r.title}`} right={`${money(r.budget, currency, language)} / ${money(r.available, currency, language)}`} />
              ))}
            </Alert>
          )}
        </div>
      </section>
    </div>
  );
}

function Alert({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4 text-amber-500" />{title}</CardTitle></CardHeader>
      <CardContent><ul className="divide-y text-sm">{children}</ul></CardContent>
    </Card>
  );
}

function Row({ href, left, right }: { href: string; left: string; right: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-3 py-2 hover:text-primary">
        <span className="min-w-0 truncate">{left}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">{right}</span>
      </Link>
    </li>
  );
}
