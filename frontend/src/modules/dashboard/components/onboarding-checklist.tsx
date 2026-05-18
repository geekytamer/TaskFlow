'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { getContacts } from '@/services/contactService';
import { getInventoryItems } from '@/services/operationsService';
import { getInvoices, getSalesOrders } from '@/services/financeService';

interface ChecklistItem {
  id: string;
  done: boolean;
  labelKey: string;
  detailKey: string;
  href: string;
}

const DISMISS_KEY_PREFIX = 'taskflow_onboarding_dismissed_';

export function OnboardingChecklist() {
  const { selectedCompany } = useCompany();
  const { t } = useI18n();
  const [counts, setCounts] = React.useState<{
    contacts: number;
    inventory: number;
    invoices: number;
    salesOrders: number;
  } | null>(null);
  const [dismissed, setDismissed] = React.useState(false);
  const companyId = selectedCompany?.id;

  React.useEffect(() => {
    if (!companyId) return;
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY_PREFIX + companyId) === '1');
    } catch {
      /* no-op */
    }
  }, [companyId]);

  React.useEffect(() => {
    if (!companyId) {
      setCounts(null);
      return;
    }
    Promise.allSettled([
      getContacts(companyId),
      getInventoryItems(companyId),
      getInvoices(companyId),
      getSalesOrders(companyId),
    ]).then((res) => {
      const len = (idx: number) =>
        res[idx].status === 'fulfilled' ? (res[idx] as PromiseFulfilledResult<any[]>).value.length : 0;
      setCounts({
        contacts: len(0),
        inventory: len(1),
        invoices: len(2),
        salesOrders: len(3),
      });
    });
  }, [companyId]);

  const handleDismiss = () => {
    if (!companyId) return;
    try {
      localStorage.setItem(DISMISS_KEY_PREFIX + companyId, '1');
    } catch {
      /* no-op */
    }
    setDismissed(true);
  };

  if (!companyId || !counts || dismissed) return null;

  const items: ChecklistItem[] = [
    {
      id: 'contact',
      done: counts.contacts > 0,
      labelKey: 'onboarding.itemContactLabel',
      detailKey: 'onboarding.itemContactDetail',
      href: '/contacts',
    },
    {
      id: 'inventory',
      done: counts.inventory > 0,
      labelKey: 'onboarding.itemInventoryLabel',
      detailKey: 'onboarding.itemInventoryDetail',
      href: '/inventory',
    },
    {
      id: 'salesOrder',
      done: counts.salesOrders > 0,
      labelKey: 'onboarding.itemSalesOrderLabel',
      detailKey: 'onboarding.itemSalesOrderDetail',
      href: '/sales',
    },
    {
      id: 'invoice',
      done: counts.invoices > 0,
      labelKey: 'onboarding.itemInvoiceLabel',
      detailKey: 'onboarding.itemInvoiceDetail',
      href: '/finance',
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  // Only show when there is meaningful onboarding still to do
  if (allDone) return null;

  const percent = Math.round((doneCount / items.length) * 100);

  return (
    <div className="relative rounded-2xl border bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-5 shadow-sm">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={handleDismiss}
        className="absolute end-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-white/60"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t('onboarding.title')}</h2>
          <p className="text-sm text-slate-500">{t('onboarding.subtitle')}</p>
        </div>
        <div className="text-sm font-semibold text-emerald-700">
          {doneCount}/{items.length} · {percent}%
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/70">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className={`flex items-start gap-3 rounded-lg border bg-white/80 p-3 transition hover:border-primary/40 hover:bg-white ${
                item.done ? 'opacity-70' : ''
              }`}
            >
              {item.done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 text-slate-400" />
              )}
              <div className="min-w-0">
                <div className={`text-sm font-medium ${item.done ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                  {t(item.labelKey)}
                </div>
                <div className="text-xs text-slate-500">{t(item.detailKey)}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
