'use client';

import { IfModule } from '@/modules/groups/components/if-module';
import { useCompanyScope } from '@/context/company-scope-context';
import { useCompany } from '@/context/company-context';
import { PerCompany } from '@/modules/groups/components/per-company';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InvoiceTable } from './invoice-table';
import { CreditNotesPanel } from './credit-notes-panel';
import { ExpenseTable } from './expense-table';
import { StandaloneExpenseTable } from './standalone-expense-table';
import { FinanceOverviewPanel } from './finance-overview';
import { VendorBillTable } from './vendor-bill-table';
import { PendingPayablesPanel } from './pending-payables-panel';
import { JournalTable } from './journal-table';
import { RecurringPanel } from './recurring-panel';
import { FixedAssetsPanel } from './fixed-assets-panel';
import { BankReconciliationPanel } from './bank-reconciliation-panel';
import { ReportsPanel } from './reports-panel';
import { ActivityLogPanel } from './activity-log-panel';
import { FinancialReportsPanel } from './financial-reports-panel';
import { BudgetPanel } from './budget-panel';
import { VatPanel } from './vat-panel';
import { IntercompanyPanel } from './intercompany-panel';
import { useI18n } from '@/context/i18n-context';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { usePermissions } from '@/context/permissions-context';

const VALID_TABS = new Set([
  'overview',
  'recurring',
  'bank',
  'assets',
  'invoices',
  'payables',
  'ledger',
  'accounting',
  'reports',
  'activity',
  'expenses',
  'budgets',
  'vat',
  'intercompany',
]);

const TAB_MODULES: Record<string, string> = { invoices: 'invoices', payables: 'vendor-bills' };

export function FinancePage() {
  const { t } = useI18n();
  const { moduleOn } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  // A tab whose module is switched off is not offered: in a whole group, offered
  // when any company in view has it on (each section says where it is off).
  const { inTree, companyIds } = useCompanyScope();
  const { companies } = useCompany();
  const onSomewhere = (m: string) => inTree
    ? companyIds.some((id) => !companies.find((c) => c.id === id)?.disabledModules?.includes(m))
    : moduleOn(m);
  // Intercompany is offered once any company here sits in a group.
  const inGroup = companies.some((c) => c.parentCompanyId);
  const tabOn = (tab: string) => !TAB_MODULES[tab] || onSomewhere(TAB_MODULES[tab]);
  const initialTab =
    tabFromUrl && VALID_TABS.has(tabFromUrl) && tabOn(tabFromUrl) ? tabFromUrl : 'overview';

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
          {tabOn('invoices') && (
            <TabsTrigger value="invoices" data-tutorial="finance-tab-invoices">{t('finance.tabInvoices')}</TabsTrigger>
          )}
          {tabOn('payables') && (
            <TabsTrigger value="payables" data-tutorial="finance-tab-payables">{t('finance.tabPayables')}</TabsTrigger>
          )}
          <TabsTrigger value="ledger" data-tutorial="finance-tab-ledger">{t('finance.tabLedger')}</TabsTrigger>
          <TabsTrigger value="accounting">{t('finance.tabAccountingReports')}</TabsTrigger>
          <TabsTrigger value="reports" data-tutorial="finance-tab-reports">{t('finance.tabReports')}</TabsTrigger>
          <TabsTrigger value="activity">{t('finance.tabActivity')}</TabsTrigger>
          <TabsTrigger value="expenses" data-tutorial="finance-tab-expenses">{t('finance.tabExpenses')}</TabsTrigger>
          <TabsTrigger value="bank">{t('finance.tabBank', 'Bank')}</TabsTrigger>
          <TabsTrigger value="recurring">{t('finance.tabRecurring', 'Recurring')}</TabsTrigger>
          <TabsTrigger value="assets">{t('finance.tabAssets', 'Fixed assets')}</TabsTrigger>
          <TabsTrigger value="budgets">{t('finance.tabBudgets', 'Budgets')}</TabsTrigger>
          <TabsTrigger value="vat">{t('finance.tabVat', 'VAT')}</TabsTrigger>
          {inGroup && <TabsTrigger value="intercompany">{t('finance.tabIntercompany', 'Intercompany')}</TabsTrigger>}
          </TabsList>
        </div>
        <TabsContent value="overview">
          <PerCompany>
            <FinanceOverviewPanel />
          </PerCompany>
        </TabsContent>
        {tabOn('invoices') && (
          <TabsContent value="invoices" className="space-y-4">
            <PerCompany>
              <IfModule module="invoices">
                <InvoiceTable />
                <CreditNotesPanel />
              </IfModule>
            </PerCompany>
          </TabsContent>
        )}
        {tabOn('payables') && (
          <TabsContent value="payables" className="space-y-4">
            <PerCompany>
              <IfModule module="vendor-bills">
                <PendingPayablesPanel onBilled={() => setBillsVersion((v) => v + 1)} />
                {/* Remount so a freshly raised draft shows up without a manual reload. */}
                <VendorBillTable key={billsVersion} />
              </IfModule>
            </PerCompany>
          </TabsContent>
        )}
        <TabsContent value="ledger">
          <PerCompany>
            <JournalTable />
          </PerCompany>
        </TabsContent>
        <TabsContent value="accounting">
          <PerCompany>
            <FinancialReportsPanel />
          </PerCompany>
        </TabsContent>
        <TabsContent value="reports">
          <PerCompany>
            <ReportsPanel />
          </PerCompany>
        </TabsContent>
        <TabsContent value="activity">
          <PerCompany>
            <ActivityLogPanel />
          </PerCompany>
        </TabsContent>
        <TabsContent value="expenses" className="space-y-4">
          <PerCompany>
            <StandaloneExpenseTable />
            {/* Task expenses come from the tasks module. */}
            <IfModule module="tasks"><ExpenseTable /></IfModule>
          </PerCompany>
        </TabsContent>
        <TabsContent value="bank">
          <PerCompany>
            <BankReconciliationPanel />
          </PerCompany>
        </TabsContent>
        <TabsContent value="assets">
          <PerCompany>
            <FixedAssetsPanel />
          </PerCompany>
        </TabsContent>
        <TabsContent value="recurring">
          <PerCompany>
            <RecurringPanel />
          </PerCompany>
        </TabsContent>
        <TabsContent value="budgets">
          <PerCompany>
            <BudgetPanel />
          </PerCompany>
        </TabsContent>
        <TabsContent value="vat">
          <PerCompany>
            <VatPanel />
          </PerCompany>
        </TabsContent>
        <TabsContent value="intercompany">
          <PerCompany>
            <IntercompanyPanel />
          </PerCompany>
        </TabsContent>
      </Tabs>
    </SectionPageShell>
  );
}
