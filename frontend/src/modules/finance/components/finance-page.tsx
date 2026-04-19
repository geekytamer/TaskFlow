'use client';

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

export function FinancePage() {
  const { t } = useI18n();

  return (
    <SectionPageShell title={t('finance.title')} description={t('finance.subtitle')}>
      <Tabs defaultValue="overview" className="space-y-4">
        <div className="overflow-x-auto pb-1">
          <TabsList className="flex h-auto min-w-max justify-start gap-1">
          <TabsTrigger value="overview">{t('finance.tabOverview')}</TabsTrigger>
          <TabsTrigger value="invoices">{t('finance.tabInvoices')}</TabsTrigger>
          <TabsTrigger value="invoice-templates">Invoice Templates</TabsTrigger>
          <TabsTrigger value="payables">{t('finance.tabPayables')}</TabsTrigger>
          <TabsTrigger value="ledger">{t('finance.tabLedger')}</TabsTrigger>
          <TabsTrigger value="accounting">Accounting Reports</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
          <TabsTrigger value="expenses">{t('finance.tabExpenses')}</TabsTrigger>
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
