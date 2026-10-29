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
}

export interface GroupDashboard {
  groupId: string;
  /** The companies these numbers come from, in the order they were rolled up. */
  companies: GroupCompany[];
  /** Companies left out because the viewer may not see that company's dashboard. */
  missing: GroupCompany[];
  metrics: DashboardMetric[];
  charts: DashboardChart[];
  alerts: DashboardAlert[];
  activity: DashboardPayload['activity'];
  quickActions: DashboardQuickAction[];
}

/** A percentage cannot be summed; averaging the companies that reported one is the honest roll-up. */
const isAverage = (metric: DashboardMetric) => metric.format === 'percent';

function mergeMetrics(parts: Array<{ company: GroupCompany; payload: DashboardPayload }>): DashboardMetric[] {
  const order: string[] = [];
  const byId = new Map<string, { metric: DashboardMetric; total: number; count: number }>();
  for (const { payload } of parts) {
    for (const metric of payload.metrics) {
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

export function rollUpDashboard(
  groupId: string,
  parts: Array<{ company: GroupCompany; payload: DashboardPayload }>,
  missing: GroupCompany[],
): GroupDashboard {
  return {
    groupId,
    companies: parts.map((p) => p.company),
    missing,
    metrics: mergeMetrics(parts),
    charts: mergeCharts(parts),
    alerts: mergeAlerts(parts),
    activity: mergeActivity(parts),
    quickActions: mergeQuickActions(parts),
  };
}
