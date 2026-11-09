import { ApiError } from '@/lib/api-client';

export interface ContactBlocker {
  key: string;
  count: number;
}

/** What still uses a contact, when the server refused to delete it (409 contact_in_use). */
export function contactInUse(error: unknown): ContactBlocker[] | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const details = error.details as { code?: string; blockers?: ContactBlocker[] } | undefined;
  return details?.code === 'contact_in_use' && Array.isArray(details.blockers) ? details.blockers : null;
}

const LABELS: Record<string, [en: string, ar: string]> = {
  invoices: ['invoices', 'فواتير'],
  vendor_bills: ['vendor bills / payouts', 'فواتير موردين / مدفوعات'],
  projects: ['projects', 'مشاريع'],
  opportunities: ['opportunities', 'فرص'],
  proposals: ['proposals', 'مقترحات'],
  campaign_assignments: ['campaign assignments', 'مشاركات في حملات'],
  campaign_deliverables: ['campaign work', 'أعمال في حملات'],
  campaign_expenses: ['campaign expenses', 'مصاريف حملات'],
  quotations: ['quotations', 'عروض أسعار'],
  sales_orders: ['sales orders', 'أوامر بيع'],
  purchase_orders: ['purchase orders', 'أوامر شراء'],
  campaigns: ['campaigns', 'حملات'],
  commissions: ['commissions', 'عمولات'],
  vendor_requests: ['vendor requests', 'طلبات موردين'],
  portal_users: ['portal logins', 'حسابات دخول على البوابة'],
};

/** "It is still linked to: 3 invoices, 1 project. Remove or move them first." in the reader's language. */
export function describeBlockers(blockers: ContactBlocker[], language: string): string {
  const ar = language === 'ar';
  const parts = blockers.map((b) => {
    const label = LABELS[b.key] ?? [b.key.replace(/_/g, ' '), b.key.replace(/_/g, ' ')];
    return `${b.count} ${ar ? label[1] : label[0]}`;
  });
  return ar
    ? `ما زالت مرتبطة بـ: ${parts.join('، ')}. احذفها أو انقلها لجهة أخرى أولاً.`
    : `It is still linked to: ${parts.join(', ')}. Remove or move them first.`;
}
