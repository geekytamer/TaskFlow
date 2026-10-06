import type { DataStore } from '../data/store';
import type { DashboardAlert, UserRole } from '../types';
import { rolesActingAs } from '../approvals/approvals';

/**
 * Things that need someone's attention today, from the newer parts of the
 * system: sign-offs waiting for this person, late shipments, batches waiting
 * for QC, cold-store excursions, recurring documents that failed, bank
 * statements left half reconciled. Each is one alert with a count and a link,
 * shown to the dashboard variant whose work it is.
 */
export function attentionAlerts(store: DataStore, companyId: string, viewer: { userId: string; variant: UserRole; companyRole?: string }): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  const operations = viewer.variant === 'Admin' || viewer.variant === 'Manager';
  const finance = viewer.variant === 'Admin' || viewer.variant === 'Accountant';
  const today = new Date().toISOString().slice(0, 10);

  const waiting = store.approvals.waiting(companyId, rolesActingAs(viewer.companyRole))
    .filter((w) => !store.approvals.steps(w.docType, w.docId).some((s) => s.status === 'approved' && s.decidedByUserId === viewer.userId));
  if (waiting.length) {
    alerts.push({ id: 'attention-approvals', severity: 'warning', route: '/approvals',
      title: `${waiting.length} waiting for your approval`, detail: 'Purchase orders and expenses above an approval level.' });
  }

  if (operations) {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const excursions = store.coldChain.excursionsSince(companyId, since);
    if (excursions.length) {
      const names = [...new Set(excursions.map((e) => e.warehouseName))];
      alerts.push({ id: 'attention-cold', severity: 'critical', route: `/inventory/warehouses/${excursions[0].warehouseId}`,
        title: `${excursions.length} out-of-range reading${excursions.length === 1 ? '' : 's'} in the last 24 hours`, detail: names.join(', ') });
    }
    const late = store.shipments.list(companyId).filter((s) => s.eta && s.eta < today && (s.status === 'planned' || s.status === 'in_transit'));
    if (late.length) {
      alerts.push({ id: 'attention-shipments', severity: 'warning', route: '/shipments',
        title: `${late.length} shipment${late.length === 1 ? '' : 's'} past arrival date`, detail: late.slice(0, 3).map((s) => s.reference).join(', ') });
    }
    const quarantined = store.listInventoryLots(companyId).filter((l) => l.status === 'Quarantine' && l.quantity > 0);
    if (quarantined.length) {
      alerts.push({ id: 'attention-qc', severity: 'info', route: '/inventory',
        title: `${quarantined.length} batch${quarantined.length === 1 ? '' : 'es'} waiting for QC`, detail: quarantined.slice(0, 5).map((l) => l.lotNumber).join(', ') });
    }
  }

  if (finance) {
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const failed = store.recurring.list(companyId).flatMap((r) => store.recurring.runs(r.id, 5).filter((run) => run.status === 'failed' && run.runDate >= weekAgo).map(() => r.name));
    if (failed.length) {
      alerts.push({ id: 'attention-recurring', severity: 'warning', route: '/finance?tab=recurring',
        title: `${failed.length} recurring document${failed.length === 1 ? '' : 's'} could not be created`, detail: [...new Set(failed)].join(', ') });
    }
    const open = store.bank.list(companyId).filter((s) => s.status === 'open');
    if (open.length) {
      const lines = open.reduce((sum, s) => sum + s.openCount, 0);
      alerts.push({ id: 'attention-bank', severity: 'info', route: '/finance?tab=bank',
        title: `${open.length} bank statement${open.length === 1 ? '' : 's'} not reconciled`, detail: lines ? `${lines} line${lines === 1 ? '' : 's'} still to match` : 'Ready to mark reconciled' });
    }
  }
  return alerts;
}
