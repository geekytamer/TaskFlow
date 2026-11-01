'use client';

import * as React from 'react';
import Link from 'next/link';
import { Download, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadAccountsCsv } from './flexi-csv';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { listFlexiAccounts, type FlexiState } from '@/services/flexiService';
import { EmptyState, money, PageTitle, shortDate, StateBadge, UsageBar, useCompanyLoad, useTr } from './flexi-ui';

type Filter = 'all' | FlexiState;

/** Every client with a Peak Flexi account, with how much of it they use. */
export function FlexiAccountsPage() {
  const { tr, language } = useTr();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const { data } = useCompanyLoad(selectedCompany?.id, (id) => listFlexiAccounts(id), (m) => toast({ title: m, variant: 'destructive' }));
  const [filter, setFilter] = React.useState<Filter>('all');
  const [q, setQ] = React.useState('');

  const shown = (data ?? []).filter((a) => (filter === 'all' || a.state === filter) && a.name.toLowerCase().includes(q.trim().toLowerCase()));
  const count = (f: Filter) => (data ?? []).filter((a) => f === 'all' || a.state === f).length;

  return (
    <div className="space-y-6">
      <PageTitle title={tr('Peak Flexi accounts', 'حسابات بيك فلكسي')} subtitle={tr('Every client with a balance, and how much of it they use.', 'كل عميل عنده رصيد، وكم مستخدم منه.')}
        actions={data && data.length > 0 ? <Button variant="outline" size="sm" onClick={() => downloadAccountsCsv(shown, language)}><Download className="me-1 h-4 w-4" />{tr('Export CSV', 'صدّر CSV')}</Button> : undefined} />
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">{tr('All', 'الكل')} ({count('all')})</TabsTrigger>
            <TabsTrigger value="active">{tr('Active', 'نشط')} ({count('active')})</TabsTrigger>
            <TabsTrigger value="frozen">{tr('Frozen', 'موقوف')} ({count('frozen')})</TabsTrigger>
            <TabsTrigger value="closed">{tr('Closed', 'مغلق')} ({count('closed')})</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search by name', 'ابحث بالاسم')} className="w-full sm:w-64" />
      </div>

      {data === null ? (
        <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>
      ) : shown.length === 0 ? (
        <EmptyState icon={Wallet} title={tr('No accounts here', 'ما فيه حسابات هنا')} body={tr('Accounts appear once an application is approved.', 'الحسابات تظهر بعد الموافقة على طلب.')} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {shown.map((a) => (
            <li key={a.contactId}>
              <Link href={`/flexi/accounts/${a.contactId}`} className="grid gap-3 px-4 py-4 transition-colors hover:bg-muted/50 md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)] md:items-center md:gap-6">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2"><span className="truncate font-semibold">{a.name}</span><StateBadge state={a.state} tr={tr} /></span>
                  <span className="block text-sm text-muted-foreground">{a.upfrontPct}% · {a.maxMonths} {tr('months', 'شهر')} · {tr('since', 'من')} {shortDate(a.since, language)}</span>
                </span>
                <Figure label={tr('Balance', 'الرصيد')} value={money(a.balance, a.currency, language)} />
                <Figure label={tr('Used', 'المستخدم')} value={money(a.used, a.currency, language)} />
                <Figure label={tr('Available', 'المتاح')} value={money(a.available, a.currency, language)} />
                <span className="space-y-1"><span className="block text-end text-xs text-muted-foreground tabular-nums">{a.usedPct.toFixed(0)}%</span><UsageBar pct={a.usedPct} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return <span className="text-sm"><span className="block text-muted-foreground">{label}</span><span className="font-medium tabular-nums">{value}</span></span>;
}
