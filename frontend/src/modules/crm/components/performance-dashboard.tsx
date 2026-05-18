'use client';

import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useCompanyCurrency } from '@/lib/currency';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { getCrmPerformance, getCrmDashboard, type EmployeePerformance, type CrmDashboardSummary } from '@/services/crmService';
import { TrendingUp, TrendingDown, Target, Users, AlertCircle, CheckCircle2, DollarSign, CalendarClock } from 'lucide-react';

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: React.ReactNode; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-0.5">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-500 font-bold text-base">🥇</span>;
  if (rank === 2) return <span className="text-slate-400 font-bold text-base">🥈</span>;
  if (rank === 3) return <span className="text-amber-600 font-bold text-base">🥉</span>;
  return <span className="text-xs text-muted-foreground font-medium ps-1">#{rank}</span>;
}

type SortKey = 'wonRevenue' | 'wonDeals' | 'openLeads' | 'openOpportunityValue' | 'conversionRate' | 'commissionApproved' | 'collectedRevenue';

type PeriodPreset = 'all' | 'mtd' | 'qtd' | 'ytd' | 'last30' | 'last90';

function periodRange(preset: PeriodPreset): { from?: Date; to?: Date } {
  const now = new Date();
  if (preset === 'all') return {};
  if (preset === 'mtd') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1) };
  }
  if (preset === 'qtd') {
    const q = Math.floor(now.getMonth() / 3) * 3;
    return { from: new Date(now.getFullYear(), q, 1) };
  }
  if (preset === 'ytd') {
    return { from: new Date(now.getFullYear(), 0, 1) };
  }
  if (preset === 'last30') {
    return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
  }
  if (preset === 'last90') {
    return { from: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
  }
  return {};
}

export function PerformanceDashboard() {
  const { selectedCompany } = useCompany();
  const { t } = useI18n();
  const { amount } = useCompanyCurrency();

  const [employees, setEmployees] = React.useState<EmployeePerformance[]>([]);
  const [company, setCompany] = React.useState<CrmDashboardSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [sortBy, setSortBy] = React.useState<SortKey>('wonRevenue');
  const [period, setPeriod] = React.useState<PeriodPreset>('all');

  React.useEffect(() => {
    if (!selectedCompany) { setLoading(false); return; }
    setLoading(true);
    const range = periodRange(period);
    Promise.allSettled([
      getCrmPerformance(selectedCompany.id, range),
      getCrmDashboard(selectedCompany.id),
    ]).then((results) => {
      if (results[0].status === 'fulfilled') setEmployees(results[0].value);
      if (results[1].status === 'fulfilled') setCompany(results[1].value);
    }).finally(() => setLoading(false));
  }, [selectedCompany, period]);

  const ranked = React.useMemo(() =>
    [...employees].sort((a, b) => b[sortBy] - a[sortBy]),
    [employees, sortBy]
  );

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'wonRevenue', label: t('perf.sortRevenue') },
    { key: 'collectedRevenue', label: t('perf.sortCollected') },
    { key: 'wonDeals', label: t('perf.sortDeals') },
    { key: 'openLeads', label: t('perf.sortLeads') },
    { key: 'openOpportunityValue', label: t('perf.sortPipeline') },
    { key: 'conversionRate', label: t('perf.sortConversion') },
    { key: 'commissionApproved', label: t('perf.sortCommission') },
  ];

  const PERIOD_OPTIONS: { key: PeriodPreset; label: string }[] = [
    { key: 'all', label: t('perf.periodAll') },
    { key: 'mtd', label: t('perf.periodMtd') },
    { key: 'qtd', label: t('perf.periodQtd') },
    { key: 'ytd', label: t('perf.periodYtd') },
    { key: 'last30', label: t('perf.periodLast30') },
    { key: 'last90', label: t('perf.periodLast90') },
  ];

  return (
    <SectionPageShell title={t('perf.title')} description={t('perf.description')}>

      {/* Company-level stats strip */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : company && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" data-tutorial="perf-stats">
          <StatCard label={t('perf.totalRevenue')} value={amount(company.wonRevenue)}
            sub={`${company.wonDeals} ${t('perf.dealsWon')}`} icon={DollarSign} color="bg-green-100 text-green-700" />
          <StatCard label={t('perf.openPipeline')} value={amount(company.openOpportunityValue)}
            sub={`${company.openOpportunities} ${t('perf.opportunities')}`} icon={TrendingUp} color="bg-blue-100 text-blue-700" />
          <StatCard label={t('perf.openLeads')} value={company.openLeads}
            sub={`${company.activeClients} ${t('perf.clients')}`} icon={Users} color="bg-purple-100 text-purple-700" />
          <StatCard label={t('perf.overdueFollowups')} value={company.overdueFollowups}
            sub={`${company.openFollowups} ${t('perf.totalFollowups')}`} icon={AlertCircle} color="bg-red-100 text-red-700" />
        </div>
      )}

      {/* Period selector */}
      <div className="flex flex-wrap gap-2 mb-3" data-tutorial="perf-period">
        <span className="text-xs text-muted-foreground self-center me-1">{t('perf.period')}</span>
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setPeriod(opt.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              period === opt.key
                ? 'bg-primary text-primary-foreground border-transparent'
                : 'bg-transparent border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Sort tabs */}
      <div className="flex flex-wrap gap-2 mb-4" data-tutorial="perf-sort">
        <span className="text-xs text-muted-foreground self-center me-1">{t('perf.rankBy')}</span>
        {SORT_OPTIONS.map(opt => (
          <button key={opt.key} onClick={() => setSortBy(opt.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              sortBy === opt.key
                ? 'bg-primary text-primary-foreground border-transparent'
                : 'bg-transparent border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground'
            }`}>
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : ranked.length === 0 ? (
        <SectionEmptyState title={t('perf.emptyTitle')} description={t('perf.emptyDescription')} />
      ) : (
        <Table data-tutorial="perf-leaderboard">
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>{t('perf.employee')}</TableHead>
              <TableHead className="text-right">{t('perf.wonRevenue')}</TableHead>
              <TableHead className="text-right">{t('perf.collected')}</TableHead>
              <TableHead className="text-right">{t('perf.deals')}</TableHead>
              <TableHead className="text-right">{t('perf.pipeline')}</TableHead>
              <TableHead className="text-right">{t('perf.leads')}</TableHead>
              <TableHead className="text-right">{t('perf.conversion')}</TableHead>
              <TableHead className="text-right">{t('perf.followups')}</TableHead>
              <TableHead className="text-right">{t('perf.commission')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map((emp, i) => (
              <TableRow key={emp.userId} className={i === 0 ? 'bg-yellow-50/40' : ''}>
                <TableCell><RankBadge rank={i + 1} /></TableCell>
                <TableCell>
                  <div className="font-medium">{emp.userName}</div>
                  <div className="text-xs text-muted-foreground">{emp.role}</div>
                </TableCell>
                <TableCell className="text-right font-semibold text-green-700">{amount(emp.wonRevenue)}</TableCell>
                <TableCell className="text-right font-medium text-emerald-700">{amount(emp.collectedRevenue || 0)}</TableCell>
                <TableCell className="text-right">
                  <span className="text-green-700 font-medium">{emp.wonDeals}W</span>
                  {emp.lostDeals > 0 && <span className="text-red-500 text-xs ms-1">{emp.lostDeals}L</span>}
                </TableCell>
                <TableCell className="text-right text-sm">{amount(emp.openOpportunityValue)}</TableCell>
                <TableCell className="text-right text-sm">{emp.openLeads}</TableCell>
                <TableCell className="text-right">
                  <span className={`text-sm font-medium ${emp.conversionRate >= 50 ? 'text-green-600' : emp.conversionRate >= 25 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                    {emp.conversionRate}%
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm">{emp.openFollowups}</span>
                  {emp.overdueFollowups > 0 && (
                    <Badge variant="destructive" className="ml-1 text-xs px-1 py-0">{emp.overdueFollowups} {t('perf.overdue')}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm">{amount(emp.commissionApproved)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionPageShell>
  );
}
