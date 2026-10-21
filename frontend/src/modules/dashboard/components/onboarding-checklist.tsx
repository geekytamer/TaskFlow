'use client';

import * as React from 'react';
import { isModuleOn } from '@/modules/companies/lib/company-modules';
import Link from 'next/link';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useBrand } from '@/modules/branding/brand-context';
import { usePermissions } from '@/context/permissions-context';
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

/** Each step's module and what the person must hold to see and take it. */
const STEPS: Record<string, { module: string; view: string; create: string }> = {
  contact: { module: 'contacts', view: 'contacts.view', create: 'contacts.create' },
  inventory: { module: 'inventory', view: 'inventory.view', create: 'inventory.create' },
  salesOrder: { module: 'sales', view: 'sales.view', create: 'sales.create' },
  invoice: { module: 'invoices', view: 'invoices.view', create: 'invoices.create' },
};

export function OnboardingChecklist() {
  const { selectedCompany } = useCompany();
  const { t, language } = useI18n();
  const { brandText } = useBrand();
  const { can, loading } = usePermissions();
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
    if (loading) return;
    // Only steps the person may take are asked for, so only their lists are read.
    const on = (step: string) => isModuleOn(selectedCompany, STEPS[step].module) && can(STEPS[step].view) && can(STEPS[step].create);
    Promise.allSettled([
      on('contact') ? getContacts(companyId) : Promise.resolve([] as Awaited<ReturnType<typeof getContacts>>),
      on('inventory') ? getInventoryItems(companyId) : Promise.resolve([] as Awaited<ReturnType<typeof getInventoryItems>>),
      on('invoice') ? getInvoices(companyId) : Promise.resolve([] as Awaited<ReturnType<typeof getInvoices>>),
      on('salesOrder') ? getSalesOrders(companyId) : Promise.resolve([] as Awaited<ReturnType<typeof getSalesOrders>>),
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
  }, [companyId, selectedCompany, can, loading]);

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

  // Steps for a module the company switched off, or that the person may not
  // take (their role lacks the list or the create), are not asked for.
  const offered = items.filter((item) => {
    const step = STEPS[item.id];
    return isModuleOn(selectedCompany, step.module) && can(step.view) && can(step.create);
  });
  if (offered.length === 0) return null;
  const doneCount = offered.filter((i) => i.done).length;
  const allDone = doneCount === offered.length;

  // Only show when there is meaningful onboarding still to do
  if (allDone) return null;

  const percent = Math.round((doneCount / offered.length) * 100);

  return (
    <div className="relative rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-emerald-50 dark:to-emerald-500/10 p-5 shadow-sm">
      <button
        type="button"
        aria-label={language === 'ar' ? 'تجاهل' : 'Dismiss'}
        onClick={handleDismiss}
        className="absolute end-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-card/60"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">{brandText(t('onboarding.title'))}</h2>
          <p className="text-sm text-muted-foreground">{t('onboarding.subtitle')}</p>
        </div>
        <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          {doneCount}/{offered.length} · {percent}%
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-card/70">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {offered.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className={`flex items-start gap-3 rounded-lg border bg-card/80 p-3 transition hover:border-primary/40 hover:bg-card ${
                item.done ? 'opacity-70' : ''
              }`}
            >
              {item.done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 text-muted-foreground/70" />
              )}
              <div className="min-w-0">
                <div className={`text-sm font-medium ${item.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {t(item.labelKey)}
                </div>
                <div className="text-xs text-muted-foreground">{t(item.detailKey)}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
