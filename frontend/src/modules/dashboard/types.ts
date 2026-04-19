import type { UserRole } from '@/modules/users/types';

export type DashboardScope = 'personal' | 'company';
export type DashboardMetricFormat = 'number' | 'currency' | 'percent';
export type DashboardTone = 'default' | 'info' | 'success' | 'warning' | 'danger';
export type DashboardChartType = 'donut' | 'line' | 'bar' | 'stacked-bar';

export interface DashboardMetric {
  id: string;
  label: string;
  value: number;
  format: DashboardMetricFormat;
  tone?: DashboardTone;
  detail?: string;
}

export interface DashboardChartSeries {
  key: string;
  label: string;
  color: string;
}

export interface DashboardChartDatum {
  label: string;
  values: Record<string, number>;
}

export interface DashboardChart {
  id: string;
  title: string;
  description?: string;
  type: DashboardChartType;
  series: DashboardChartSeries[];
  data: DashboardChartDatum[];
}

export interface DashboardAlert {
  id: string;
  title: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
  entityType?: string;
  entityId?: string;
  route?: string;
}

export interface DashboardActivityItem {
  id: string;
  title: string;
  detail: string;
  createdAt: Date;
  actorName?: string;
  entityType: string;
  entityId: string;
}

export interface DashboardQuickAction {
  id: string;
  label: string;
  route: string;
}

export interface DashboardPayload {
  companyId: string;
  role: UserRole;
  scope: DashboardScope;
  metrics: DashboardMetric[];
  charts: DashboardChart[];
  alerts: DashboardAlert[];
  activity: DashboardActivityItem[];
  quickActions: DashboardQuickAction[];
}
