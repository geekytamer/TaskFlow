'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InvoiceTable } from './invoice-table';
import { ExpenseTable } from './expense-table';
import { FinanceOverviewPanel } from './finance-overview';
import { VendorBillTable } from './vendor-bill-table';
import { JournalTable } from './journal-table';
import { ReportsPanel } from './reports-panel';
import { ActivityLogPanel } from './activity-log-panel';
import { FinancialReportsPanel } from './financial-reports-panel';
import { InvoiceTemplatePanel } from './invoice-template-panel';
import { useI18n } from '@/context/i18n-context';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';

const VALID_TABS = new Set([
  'overview',
  'invoices',
  'invoice-templates',
  'delivery-templates',
  'payables',
  'ledger',
  'accounting',
  'reports',
  'activity',
  'expenses',
]);

export function FinancePage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const initialTab =
    tabFromUrl && VALID_TABS.has(tabFromUrl) ? tabFromUrl : 'overview';

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
          <TabsTrigger value="invoice-templates">{t('finance.tabInvoiceTemplates')}</TabsTrigger>
          <TabsTrigger value="delivery-templates">{t('finance.tabDeliveryTemplates', 'Delivery Notes')}</TabsTrigger>
          <TabsTrigger value="payables" data-tutorial="finance-tab-payables">{t('finance.tabPayables')}</TabsTrigger>
          <TabsTrigger value="ledger" data-tutorial="finance-tab-ledger">{t('finance.tabLedger')}</TabsTrigger>
          <TabsTrigger value="accounting">{t('finance.tabAccountingReports')}</TabsTrigger>
          <TabsTrigger value="reports" data-tutorial="finance-tab-reports">{t('finance.tabReports')}</TabsTrigger>
          <TabsTrigger value="activity">{t('finance.tabActivity')}</TabsTrigger>
          <TabsTrigger value="expenses" data-tutorial="finance-tab-expenses">{t('finance.tabExpenses')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview">
          <FinanceOverviewPanel />
        </TabsContent>
        <TabsContent value="invoices">
          <InvoiceTable />
        </TabsContent>
        <TabsContent value="invoice-templates">
          <InvoiceTemplatePanel />
        </TabsContent>
        <TabsContent value="delivery-templates">
          <InvoiceTemplatePanel docType="delivery" />
        </TabsContent>
        <TabsContent value="payables">
          <VendorBillTable />
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
        <TabsContent value="expenses">
          <ExpenseTable />
        </TabsContent>
      </Tabs>
    </SectionPageShell>
  );
}
