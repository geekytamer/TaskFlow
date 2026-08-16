'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InvoiceTable } from './invoice-table';
import { ExpenseTable } from './expense-table';
import { StandaloneExpenseTable } from './standalone-expense-table';
import { FinanceOverviewPanel } from './finance-overview';
import { VendorBillTable } from './vendor-bill-table';
import { PendingPayablesPanel } from './pending-payables-panel';
import { JournalTable } from './journal-table';
import { ReportsPanel } from './reports-panel';
import { ActivityLogPanel } from './activity-log-panel';
import { FinancialReportsPanel } from './financial-reports-panel';
import { BudgetPanel } from './budget-panel';
import { VatPanel } from './vat-panel';
import { useI18n } from '@/context/i18n-context';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';

const VALID_TABS = new Set([
  'overview',
  'invoices',
  'payables',
  'ledger',
  'accounting',
  'reports',
  'activity',
  'expenses',
  'budgets',
  'vat',
]);

export function FinancePage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const initialTab =
    tabFromUrl && VALID_TABS.has(tabFromUrl) ? tabFromUrl : 'overview';

  const [billsVersion, setBillsVersion] = React.useState(0);

  // Template design lives in the document builder now. Anyone arriving on an
  // old ?tab=invoice-templates link is sent there rather than dropped on the
  // Overview with no explanation.
  React.useEffect(() => {
    const movedToDocuments: Record<string, string> = {
      'invoice-templates': 'invoice',
      'delivery-templates': 'delivery',
      'bill-templates': 'bill',
    };
    const docType = tabFromUrl ? movedToDocuments[tabFromUrl] : undefined;
    if (docType) router.replace(`/documents?tab=templates&type=${docType}`);
  }, [router, tabFromUrl]);

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set('tab', value);
    router.replace(`/finance?${params.toString()}`);
  };

  return (
    <SectionPageShell title={t('finance.title')} description={t('finance.subtitle')}>
      <Tabs value={initialTab} onValueChange={handleTabChange} className="space-y-4">
        <div className="overflow-x-auto pb-1">
          <TabsList className="flex h-auto min-w-max justify-start gap-1" data-tutorial="finance-tabs">
          <TabsTrigger value="overview" data-tutorial="finance-tab-overview">{t('finance.tabOverview')}</TabsTrigger>
          <TabsTrigger value="invoices" data-tutorial="finance-tab-invoices">{t('finance.tabInvoices')}</TabsTrigger>
          <TabsTrigger value="payables" data-tutorial="finance-tab-payables">{t('finance.tabPayables')}</TabsTrigger>
          <TabsTrigger value="ledger" data-tutorial="finance-tab-ledger">{t('finance.tabLedger')}</TabsTrigger>
          <TabsTrigger value="accounting">{t('finance.tabAccountingReports')}</TabsTrigger>
          <TabsTrigger value="reports" data-tutorial="finance-tab-reports">{t('finance.tabReports')}</TabsTrigger>
          <TabsTrigger value="activity">{t('finance.tabActivity')}</TabsTrigger>
          <TabsTrigger value="expenses" data-tutorial="finance-tab-expenses">{t('finance.tabExpenses')}</TabsTrigger>
          <TabsTrigger value="budgets">{t('finance.tabBudgets', 'Budgets')}</TabsTrigger>
          <TabsTrigger value="vat">{t('finance.tabVat', 'VAT')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview">
          <FinanceOverviewPanel />
        </TabsContent>
        <TabsContent value="invoices">
          <InvoiceTable />
        </TabsContent>
        <TabsContent value="payables" className="space-y-4">
          <PendingPayablesPanel onBilled={() => setBillsVersion((v) => v + 1)} />
          {/* Remount so a freshly raised draft shows up without a manual reload. */}
          <VendorBillTable key={billsVersion} />
        </TabsContent>
        <TabsContent value="ledger">
          <JournalTable />
        </TabsContent>
        <TabsContent value="accounting">
          <FinancialReportsPanel />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsPanel />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityLogPanel />
        </TabsContent>
        <TabsContent value="expenses" className="space-y-4">
          <StandaloneExpenseTable />
          <ExpenseTable />
        </TabsContent>
        <TabsContent value="budgets">
          <BudgetPanel />
        </TabsContent>
        <TabsContent value="vat">
          <VatPanel />
        </TabsContent>
      </Tabs>
    </SectionPageShell>
  );
}
