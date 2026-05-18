'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/context/i18n-context';
import { useCompanyCurrency } from '@/lib/currency';
import { getCommissions, type Commission } from '@/services/crmService';
import { BadgeDollarSign } from 'lucide-react';

/**
 * Read-only "who earned commission on this invoice" widget. Filters the
 * company's commissions to those linked to a specific invoice and surfaces
 * payee, role, basis, weight, amount, status. Intended for the invoice
 * detail/preview view.
 */
export function InvoiceCommissionsPanel({
  companyId,
  invoiceId,
}: {
  companyId: string;
  invoiceId: string;
}) {
  const { t } = useI18n();
  const { amount } = useCompanyCurrency();
  const [rows, setRows] = React.useState<Commission[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!companyId || !invoiceId) return;
    setLoading(true);
    getCommissions(companyId)
      .then((all) => setRows(all.filter((c) => c.invoiceId === invoiceId)))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [companyId, invoiceId]);

  if (!loading && rows.length === 0) {
    return null;
  }

  const total = rows.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <BadgeDollarSign className="h-4 w-4 text-emerald-600" />
          <h4 className="text-sm font-semibold">{t('invoiceCommissions.title')}</h4>
        </div>
        <Badge variant="outline">{amount(total)}</Badge>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <div className="flex-1 min-w-0">
                <span className="font-medium">{row.userName || '—'}</span>
                {row.role && (
                  <span className="ms-1 text-xs text-muted-foreground">· {row.role}</span>
                )}
                {row.weightPercent != null && row.weightPercent !== 100 && (
                  <span className="ms-1 text-xs text-muted-foreground">
                    ({row.weightPercent}%)
                  </span>
                )}
                <div className="text-[11px] text-muted-foreground">
                  {row.basis} · {amount(row.basisAmount)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{amount(row.amount)}</span>
                <Badge variant="outline" className="text-[10px]">
                  {row.status}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
