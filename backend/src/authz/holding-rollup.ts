/**
 * A group seen as one place to work: the companies of a holding group rolled
 * up into a single view.
 *
 * Each company is built by exactly the code that builds it on its own, then
 * merged, so a group view can never show more than the company views it came
 * from. A company the viewer may not see there is left out and named in
 * `missing`, rather than silently dropping its numbers into the totals.
 */
import type {
  DashboardAlert,
  DashboardChart,
  DashboardChartDatum,
  DashboardMetric,
  DashboardPayload,
  DashboardQuickAction,
} from '../types';

export interface GroupCompany {
  id: string;
  name: string;
  /** What this company's money is in. Two companies need not share one. */
  currencyCode?: string;
}

/** One company's figures, for comparing the companies against each other. */
export interface GroupCompanyFigures extends GroupCompany {
  metrics: DashboardMetric[];
}

/**
 * Money a group holds, kept per currency. A group may run companies in
 * different currencies, and adding those together is a made-up number — the
 * view shows one line per currency instead.
 */
export interface GroupMoney {
  metricId: string;
  label: string;
  byCurrency: Array<{ currencyCode: string; value: number; companyIds: string[] }>;
}

/** A short, plain observation about the group — the kind a reader would make. */
export interface GroupObservation {
  id: string;
  text: string;
  /** The company it is about, when it is about one. */
  companyId?: string;
}

export interface GroupDashboard {
  groupId: string;
  /** The companies these numbers come from, in the order they were rolled up. */
  companies: GroupCompany[];
  /** Each company on its own, so they can be compared rather than only summed. */
  perCompany: GroupCompanyFigures[];
  /** Money, per currency; never added across currencies. */
  money: GroupMoney[];
  observations: GroupObservation[];
  /** Companies left out because the viewer may not see that company's dashboard. */
  missing: GroupCompany[];
  metrics: DashboardMetric[];
  charts: DashboardChart[];
  alerts: DashboardAlert[];
  activity: DashboardPayload['activity'];
  quickActions: DashboardQuickAction[];
}

const CURRENCY_METRICS = new Set(['open-receivables', 'open-payables', 'billed-this-month', 'paid-this-month']);

/** A percentage cannot be summed; averaging the companies that reported one is the honest roll-up. */
const isAverage = (metric: DashboardMetric) => metric.format === 'percent';

function mergeMetrics(parts: Array<{ company: GroupCompany; payload: DashboardPayload }>): DashboardMetric[] {
  // Money is only summable within one currency. Where the group runs several,
  // the totals leave money out entirely and `money` carries it per currency —
  // a figure that adds OMR to USD is worse than no figure.
  const oneCurrency = new Set(parts.map((p) => p.company.currencyCode || 'USD')).size <= 1;
  const order: string[] = [];
  const byId = new Map<string, { metric: DashboardMetric; total: number; count: number }>();
  for (const { payload } of parts) {
    for (const metric of payload.metrics) {
      if (!oneCurrency && (metric.format === 'currency' || CURRENCY_METRICS.has(metric.id))) continue;
      const seen = byId.get(metric.id);
      if (!seen) {
        order.push(metric.id);
        byId.set(metric.id, { metric, total: metric.value, count: 1 });
      } else {
        seen.total += metric.value;
        seen.count += 1;
      }
    }
  }
  return order.map((id) => {
    const { metric, total, count } = byId.get(id)!;
    const value = isAverage(metric) ? Math.round(total / Math.max(count, 1)) : total;
    return { ...metric, value };
  });
}

/**
 * Charts merge per label and series key: the same month of the same chart adds
 * up across companies. A chart only some companies have still appears, holding
 * their numbers.
 */
function mergeCharts(parts: Array<{ company: GroupCompany; payload: DashboardPayload }>): DashboardChart[] {
  const order: string[] = [];
  const byId = new Map<string, { chart: DashboardChart; rows: Map<string, DashboardChartDatum> }>();
  for (const { payload } of parts) {
    for (const chart of payload.charts) {
      let seen = byId.get(chart.id);
      if (!seen) {
        order.push(chart.id);
        seen = { chart, rows: new Map() };
        byId.set(chart.id, seen);
      }
      for (const datum of chart.data) {
        const row = seen.rows.get(datum.label);
        if (!row) {
          seen.rows.set(datum.label, { label: datum.label, values: { ...datum.values } });
          continue;
        }
        for (const [key, value] of Object.entries(datum.values)) {
          row.values[key] = (row.values[key] ?? 0) + value;
        }
      }
    }
  }
  return order.map((id) => {
    const { chart, rows } = byId.get(id)!;
    return { ...chart, data: [...rows.values()] };
  });
}

/** Each alert says which company it is about, and ids stay unique across companies. */
function mergeAlerts(parts: Array<{ company: GroupCompany; payload: DashboardPayload }>): DashboardAlert[] {
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return parts
    .flatMap(({ company, payload }) =>
      payload.alerts.map((alert) => ({
        ...alert,
        id: `${company.id}:${alert.id}`,
        detail: `${company.name} — ${alert.detail}`,
      })),
    )
    .sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function mergeActivity(parts: Array<{ company: GroupCompany; payload: DashboardPayload }>): DashboardPayload['activity'] {
  return parts
    .flatMap(({ company, payload }) =>
      payload.activity.map((item) => ({
        ...item,
        id: `${company.id}:${item.id}`,
        detail: `${company.name} — ${item.detail}`,
      })),
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 40);
}

/** The shortcuts every rolled-up company offers, in first-seen order. */
function mergeQuickActions(parts: Array<{ company: GroupCompany; payload: DashboardPayload }>): DashboardQuickAction[] {
  const byRoute = new Map<string, DashboardQuickAction>();
  for (const { payload } of parts) {
    for (const action of payload.quickActions) {
      if (!byRoute.has(action.route)) byRoute.set(action.route, action);
    }
  }
  return [...byRoute.values()];
}


/** Money per currency: one line per currency, naming the companies behind it. */
function moneyByCurrency(parts: Array<{ company: GroupCompany; payload: DashboardPayload }>): GroupMoney[] {
  const order: string[] = [];
  const byMetric = new Map<string, { label: string; rows: Map<string, { value: number; companyIds: string[] }> }>();
  for (const { company, payload } of parts) {
    const currency = company.currencyCode || 'USD';
    for (const metric of payload.metrics) {
      if (metric.format !== 'currency' && !CURRENCY_METRICS.has(metric.id)) continue;
      let entry = byMetric.get(metric.id);
      if (!entry) {
        order.push(metric.id);
        entry = { label: metric.label, rows: new Map() };
        byMetric.set(metric.id, entry);
      }
      const row = entry.rows.get(currency) ?? { value: 0, companyIds: [] };
      row.value += metric.value;
      row.companyIds.push(company.id);
      entry.rows.set(currency, row);
    }
  }
  return order.map((metricId) => {
    const entry = byMetric.get(metricId)!;
    return {
      metricId,
      label: entry.label,
      byCurrency: [...entry.rows.entries()]
        .map(([currencyCode, row]) => ({ currencyCode, ...row }))
        .sort((a, b) => b.value - a.value),
    };
  });
}

/**
 * What a reader would notice: where the money sits, and which company is
 * carrying the group's trouble. Only said when the group has companies to
 * compare and the figure is worth a sentence.
 */
function observe(parts: Array<{ company: GroupCompany; payload: DashboardPayload }>): GroupObservation[] {
  if (parts.length < 2) return [];
  const value = (p: (typeof parts)[number], id: string) => p.payload.metrics.find((m) => m.id === id)?.value ?? 0;
  const out: GroupObservation[] = [];

  const concentrate = (metricId: string, label: string) => {
    const sameCurrency = new Set(parts.map((p) => p.company.currencyCode || 'USD')).size === 1;
    if (!sameCurrency) return; // shares of a total that cannot be added mean nothing
    const total = parts.reduce((sum, p) => sum + value(p, metricId), 0);
    if (total <= 0) return;
    const top = [...parts].sort((a, b) => value(b, metricId) - value(a, metricId))[0];
    const share = Math.round((value(top, metricId) / total) * 100);
    if (share < 60) return;
    out.push({
      id: `concentration-${metricId}`,
      companyId: top.company.id,
      text: `${top.company.name} holds ${share}% of the group's ${label}.`,
    });
  };
  concentrate('open-receivables', 'unpaid invoices');
  concentrate('open-payables', 'bills to pay');

  const overdue = [...parts].sort((a, b) => value(b, 'overdue-tasks') - value(a, 'overdue-tasks'))[0];
  const overdueCount = value(overdue, 'overdue-tasks');
  const groupOverdue = parts.reduce((sum, p) => sum + value(p, 'overdue-tasks'), 0);
  if (overdueCount > 0 && overdueCount >= groupOverdue - overdueCount) {
    out.push({
      id: 'overdue-leader',
      companyId: overdue.company.id,
      text: `${overdue.company.name} carries ${overdueCount} of the group's ${groupOverdue} overdue task${groupOverdue === 1 ? '' : 's'}.`,
    });
  }

  const quiet = parts.filter((p) => value(p, 'open-tasks') === 0 && value(p, 'active-projects') === 0);
  if (quiet.length && quiet.length < parts.length) {
    out.push({
      id: 'quiet-companies',
      text: `${quiet.map((p) => p.company.name).join(', ')} ${quiet.length === 1 ? 'has' : 'have'} no work in flight.`,
    });
  }
  return out.slice(0, 3);
}

export function rollUpDashboard(
  groupId: string,
  parts: Array<{ company: GroupCompany; payload: DashboardPayload }>,
  missing: GroupCompany[],
): GroupDashboard {
  return {
    groupId,
    companies: parts.map((p) => p.company),
    perCompany: parts.map((p) => ({ ...p.company, metrics: p.payload.metrics })),
    money: moneyByCurrency(parts),
    observations: observe(parts),
    missing,
    metrics: mergeMetrics(parts),
    charts: mergeCharts(parts),
    alerts: mergeAlerts(parts),
    activity: mergeActivity(parts),
    quickActions: mergeQuickActions(parts),
  };
}
