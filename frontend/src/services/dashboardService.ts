import { apiFetch } from '@/lib/api-client';
import type { DashboardPayload } from '@/modules/dashboard/types';

const toDate = (value: unknown) => (value ? new Date(String(value)) : undefined);

const mapDashboardPayload = (payload: any): DashboardPayload => ({
  companyId: String(payload.companyId || ''),
  role: payload.role,
  scope: payload.scope === 'personal' ? 'personal' : 'company',
  metrics: Array.isArray(payload.metrics)
    ? payload.metrics.map((metric: any) => ({
        id: String(metric.id || ''),
        label: String(metric.label || ''),
        value: Number(metric.value || 0),
        format: metric.format,
        tone: metric.tone,
        detail: metric.detail ? String(metric.detail) : undefined,
      }))
    : [],
  charts: Array.isArray(payload.charts)
    ? payload.charts.map((chart: any) => ({
        id: String(chart.id || ''),
        title: String(chart.title || ''),
        description: chart.description ? String(chart.description) : undefined,
        type: chart.type,
        series: Array.isArray(chart.series)
          ? chart.series.map((series: any) => ({
              key: String(series.key || ''),
              label: String(series.label || ''),
              color: String(series.color || ''),
            }))
          : [],
        data: Array.isArray(chart.data)
          ? chart.data.map((datum: any) => ({
              label: String(datum.label || ''),
              values:
                datum && typeof datum.values === 'object' && datum.values
                  ? Object.fromEntries(
                      Object.entries(datum.values).map(([key, value]) => [
                        key,
                        Number(value || 0),
                      ]),
                    )
                  : {},
            }))
          : [],
      }))
    : [],
  alerts: Array.isArray(payload.alerts)
    ? payload.alerts.map((alert: any) => ({
        id: String(alert.id || ''),
        title: String(alert.title || ''),
        detail: String(alert.detail || ''),
        severity: alert.severity,
        entityType: alert.entityType ? String(alert.entityType) : undefined,
        entityId: alert.entityId ? String(alert.entityId) : undefined,
        route: alert.route ? String(alert.route) : undefined,
      }))
    : [],
  activity: Array.isArray(payload.activity)
    ? payload.activity.map((item: any) => ({
        id: String(item.id || ''),
        title: String(item.title || ''),
        detail: String(item.detail || ''),
        createdAt: toDate(item.createdAt) || new Date(),
        actorName: item.actorName ? String(item.actorName) : undefined,
        entityType: String(item.entityType || ''),
        entityId: String(item.entityId || ''),
      }))
    : [],
  quickActions: Array.isArray(payload.quickActions)
    ? payload.quickActions.map((action: any) => ({
        id: String(action.id || ''),
        label: String(action.label || ''),
        route: String(action.route || ''),
      }))
    : [],
});

export async function getDashboardPayload(
  companyId: string,
): Promise<DashboardPayload | null> {
  if (!companyId) return null;
  const payload = await apiFetch<DashboardPayload>(`/companies/${companyId}/dashboard`);
  return mapDashboardPayload(payload);
}
