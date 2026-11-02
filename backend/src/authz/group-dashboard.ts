import type { AuthedRequest } from '../routes/shared';
import type { RouteContext } from '../routes/context';
import { rollUpDashboard, type GroupCompany } from './holding-rollup';

/**
 * The dashboard of several companies at once, for a group. Each company is
 * built by the code that builds it alone, and only where this person may see
 * a company dashboard; every other company is named in `missing`, never
 * quietly left out of the totals. The caller decides which companies are in
 * play (a holding group, or a group company's tree, narrowed by a filter).
 */
export function groupDashboard(
  ctx: Pick<RouteContext, 'store' | 'allowsRule' | 'viewerOf' | 'accessibleCompanyIds'>,
  req: AuthedRequest,
  groupId: string,
  companyIds: readonly string[],
) {
  const { store, allowsRule, viewerOf } = ctx;
  const reachable = new Set(ctx.accessibleCompanyIds(req.user!));
  const parts: Array<{ company: GroupCompany; payload: ReturnType<typeof store.getDashboardPayload> }> = [];
  const missing: GroupCompany[] = [];
  for (const companyId of companyIds) {
    const company: GroupCompany = {
      id: companyId,
      name: store.getCompanyById(companyId)?.name ?? companyId,
      currencyCode: store.getCompanyFinanceSettings(companyId).currencyCode,
    };
    const open = reachable.has(companyId);
    const operations = open && allowsRule(req, companyId, 'DASHBOARD_OPERATIONS_READ');
    const finance = open && allowsRule(req, companyId, 'DASHBOARD_FINANCE_READ');
    // The personal variant is one person's own tasks; it says nothing about
    // a company, so a group roll-up leaves that company out.
    if (!operations && !finance) {
      missing.push(company);
      continue;
    }
    parts.push({
      company,
      payload: store.getDashboardPayload(companyId, {
        userId: req.user!.id,
        role: operations && finance ? 'Admin' : operations ? 'Manager' : 'Accountant',
        companyRole: store.authz.mainLegacyRole(req.user!.id, companyId),
        visibleTo: viewerOf(req),
      }),
    });
  }
  return rollUpDashboard(groupId, parts, missing);
}

/** `?companyIds=a,b` as a set, or null when absent: the filter only ever narrows. */
export const askedCompanyIds = (value: unknown): Set<string> | null =>
  typeof value === 'string' && value.trim()
    ? new Set(value.split(',').map((id) => id.trim()).filter(Boolean))
    : null;
