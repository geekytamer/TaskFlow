'use client';

import * as React from 'react';
import { getCurrentLocale } from '@/lib/locale';
import { format } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import type {
  AccountActivityReport,
  LedgerAccount,
  ProfitAndLossReport,
  TrialBalanceReport,
} from '@/modules/finance/types';
import {
  downloadFinanceExport,
  getAccountActivityReport,
  getLedgerAccounts,
  getProfitAndLossReport,
  getTrialBalanceReport,
} from '@/services/financeService';
import { Download, FileText, Info } from 'lucide-react';
import { useCompanyCurrency } from '@/lib/currency';
import { useI18n } from '@/context/i18n-context';

const toInputDate = (date: Date) => format(date, 'yyyy-MM-dd');

const startOfMonthInput = () => {
  const now = new Date();
  return toInputDate(new Date(now.getFullYear(), now.getMonth(), 1));
};

const printableReport = (title: string, body: string) => `
  <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
        h1 { margin: 0 0 4px; font-size: 24px; }
        .muted { color: #6b7280; font-size: 12px; margin-bottom: 18px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #d1d5db; padding: 8px; font-size: 12px; text-align: left; }
        th { background: #f3f4f6; }
        .right { text-align: right; }
        .total { font-weight: 700; background: #f9fafb; }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <div class="muted">Generated ${new Date().toLocaleString(getCurrentLocale())}</div>
      ${body}
    </body>
  </html>
`;

export function FinancialReportsPanel() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const { t } = useI18n();
  const { money, amount } = useCompanyCurrency();
  const [accounts, setAccounts] = React.useState<LedgerAccount[]>([]);
  const [trialBalance, setTrialBalance] = React.useState<TrialBalanceReport | null>(null);
  const [profitAndLoss, setProfitAndLoss] = React.useState<ProfitAndLossReport | null>(null);
  const [accountActivity, setAccountActivity] = React.useState<AccountActivityReport | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [asOf, setAsOf] = React.useState(toInputDate(new Date()));
  const [from, setFrom] = React.useState(startOfMonthInput());
  const [to, setTo] = React.useState(toInputDate(new Date()));
  const [selectedAccountId, setSelectedAccountId] = React.useState('');

  const load = React.useCallback(async () => {
    if (!selectedCompany) {
      setAccounts([]);
      setTrialBalance(null);
      setProfitAndLoss(null);
      setAccountActivity(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const accountData = await getLedgerAccounts(selectedCompany.id);
      const firstAccountId = selectedAccountId || accountData[0]?.id || '';
      setAccounts(accountData);
      if (!selectedAccountId && firstAccountId) {
        setSelectedAccountId(firstAccountId);
      }
      const [trial, pnl, activity] = await Promise.all([
        getTrialBalanceReport(selectedCompany.id, { asOf: new Date(asOf) }),
        getProfitAndLossReport(selectedCompany.id, { from: new Date(from), to: new Date(to) }),
        firstAccountId
          ? getAccountActivityReport(selectedCompany.id, firstAccountId, {
              from: new Date(from),
              to: new Date(to),
              limit: 250,
            })
          : Promise.resolve(null),
      ]);
      setTrialBalance(trial);
      setProfitAndLoss(pnl);
      setAccountActivity(activity);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('financialReports.toastUnavailableTitle'),
        description: error?.message || t('financialReports.toastUnavailableDesc'),
      });
    } finally {
      setLoading(false);
    }
  }, [asOf, from, selectedAccountId, selectedCompany, to, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handlePrint = (title: string, body: string) => {
    const reportWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!reportWindow) return;
    reportWindow.document.write(printableReport(title, body));
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  };

  const exportFinance = async (dataset: 'trial-balance' | 'profit-and-loss') => {
    if (!selectedCompany) return;
    try {
      await downloadFinanceExport(selectedCompany.id, dataset, {
        asOf: new Date(asOf),
        from: new Date(from),
        to: new Date(to),
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('financialReports.toastExportFailedTitle'),
        description: error?.message || t('financialReports.toastExportFailedDesc'),
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!selectedCompany) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          {t('financialReports.selectCompany')}
        </CardContent>
      </Card>
    );
  }

  const trialRows = trialBalance?.lines.filter((line) => line.debitBalance || line.creditBalance) || [];
  const pnlRows = [
    ...(profitAndLoss?.revenue || []).map((line) => ({ ...line, section: 'Revenue' })),
    ...(profitAndLoss?.expenses || []).map((line) => ({ ...line, section: 'Expense' })),
  ];

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>{t('financialReports.guideTitle')}</AlertTitle>
        <AlertDescription>
          {t('financialReports.guideDesc')}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>{t('financialReports.reportDatesTitle')}</CardTitle>
          <CardDescription>{t('financialReports.reportDatesDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label>{t('financialReports.asOfLabel')}</Label>
            <Input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('financialReports.fromLabel')}</Label>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('financialReports.toLabel')}</Label>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={load} className="w-full">{t('financialReports.refreshBtn')}</Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="trial-balance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trial-balance">{t('financialReports.tabTrialBalance')}</TabsTrigger>
          <TabsTrigger value="profit-loss">{t('financialReports.tabProfitLoss')}</TabsTrigger>
          <TabsTrigger value="activity">{t('financialReports.tabActivity')}</TabsTrigger>
        </TabsList>

        <TabsContent value="trial-balance">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>{t('financialReports.trialBalanceTitle')}</CardTitle>
                <CardDescription>
                  {t('financialReports.balanceStatusDesc')
                    .replace('{status}', trialBalance?.isBalanced ? t('financialReports.balanced') : t('financialReports.needsReview'))
                    .replace('{date}', trialBalance ? format(trialBalance.asOf, 'MMM d, yyyy') : t('financialReports.selectedDate'))}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportFinance('trial-balance')}>
                  <Download className="me-2 h-4 w-4" /> {t('financialReports.exportCsv')}
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    handlePrint(
                      `${selectedCompany.name} Trial Balance`,
                      `<table><thead><tr><th>Code</th><th>Name</th><th>Debit</th><th>Credit</th></tr></thead><tbody>${trialRows.map((line) => `<tr><td>${line.code}</td><td>${line.name}</td><td class="right">${amount(line.debitBalance)}</td><td class="right">${amount(line.creditBalance)}</td></tr>`).join('')}<tr class="total"><td colspan="2">Totals</td><td class="right">${amount(trialBalance?.totalDebit || 0)}</td><td class="right">${amount(trialBalance?.totalCredit || 0)}</td></tr></tbody></table>`,
                    )
                  }
                >
                  <FileText className="me-2 h-4 w-4" /> {t('financialReports.printPdf')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('financialReports.colCode')}</TableHead>
                      <TableHead>{t('financialReports.colName')}</TableHead>
                      <TableHead>{t('financialReports.colType')}</TableHead>
                      <TableHead className="text-end">{t('financialReports.colDebitBalance')}</TableHead>
                      <TableHead className="text-end">{t('financialReports.colCreditBalance')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trialRows.map((line) => (
                      <TableRow key={line.accountId}>
                        <TableCell className="font-mono">{line.code}</TableCell>
                        <TableCell className="font-medium">{line.name}</TableCell>
                        <TableCell><Badge variant="outline">{line.type}</Badge></TableCell>
                        <TableCell className="text-end">{amount(line.debitBalance)}</TableCell>
                        <TableCell className="text-end">{amount(line.creditBalance)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={3} className="font-semibold">{t('financialReports.totals')}</TableCell>
                      <TableCell className="text-end font-semibold">{amount(trialBalance?.totalDebit || 0)}</TableCell>
                      <TableCell className="text-end font-semibold">{amount(trialBalance?.totalCredit || 0)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profit-loss">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>{t('financialReports.pnlTitle')}</CardTitle>
                <CardDescription>
                  {t('financialReports.pnlDesc')
                    .replace('{from}', profitAndLoss ? format(profitAndLoss.from, 'MMM d, yyyy') : t('financialReports.start'))
                    .replace('{to}', profitAndLoss ? format(profitAndLoss.to, 'MMM d, yyyy') : t('financialReports.end'))}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportFinance('profit-and-loss')}>
                  <Download className="me-2 h-4 w-4" /> {t('financialReports.exportCsv')}
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    handlePrint(
                      `${selectedCompany.name} Profit & Loss`,
                      `<table><thead><tr><th>Section</th><th>Code</th><th>Name</th><th>Amount</th></tr></thead><tbody>${pnlRows.map((line) => `<tr><td>${line.section}</td><td>${line.code}</td><td>${line.name}</td><td class="right">${amount(line.amount)}</td></tr>`).join('')}<tr class="total"><td colspan="3">Net Income</td><td class="right">${amount(profitAndLoss?.netIncome || 0)}</td></tr></tbody></table>`,
                    )
                  }
                >
                  <FileText className="me-2 h-4 w-4" /> {t('financialReports.printPdf')}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t('financialReports.revenue')}</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{amount(profitAndLoss?.totalRevenue || 0)}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t('financialReports.expenses')}</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{amount(profitAndLoss?.totalExpenses || 0)}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t('financialReports.netIncome')}</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{amount(profitAndLoss?.netIncome || 0)}</div></CardContent>
                </Card>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('financialReports.colSection')}</TableHead>
                      <TableHead>{t('financialReports.colCode')}</TableHead>
                      <TableHead>{t('financialReports.colName')}</TableHead>
                      <TableHead className="text-end">{t('financialReports.colAmount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pnlRows.map((line) => (
                      <TableRow key={`${line.section}-${line.accountId}`}>
                        <TableCell><Badge variant="outline">{line.section}</Badge></TableCell>
                        <TableCell className="font-mono">{line.code}</TableCell>
                        <TableCell className="font-medium">{line.name}</TableCell>
                        <TableCell className="text-end">{amount(line.amount)}</TableCell>
                      </TableRow>
                    ))}
                    {pnlRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                          {t('financialReports.noPnlData')}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>{t('financialReports.activityTitle')}</CardTitle>
              <CardDescription>{t('financialReports.activityDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-lg space-y-1">
                <Label>{t('financialReports.accountLabel')}</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('financialReports.selectAccount')} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t('financialReports.opening')}</CardTitle></CardHeader>
                  <CardContent><div className="text-xl font-bold">{amount(accountActivity?.openingBalance || 0)}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t('financialReports.debitsCredits')}</CardTitle></CardHeader>
                  <CardContent><div className="text-sm">{amount(accountActivity?.debitTotal || 0)} / {amount(accountActivity?.creditTotal || 0)}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{t('financialReports.closing')}</CardTitle></CardHeader>
                  <CardContent><div className="text-xl font-bold">{amount(accountActivity?.closingBalance || 0)}</div></CardContent>
                </Card>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('financialReports.colDate')}</TableHead>
                      <TableHead>{t('financialReports.colSource')}</TableHead>
                      <TableHead>{t('financialReports.colDescription')}</TableHead>
                      <TableHead className="text-end">{t('financialReports.colDebit')}</TableHead>
                      <TableHead className="text-end">{t('financialReports.colCredit')}</TableHead>
                      <TableHead className="text-end">{t('financialReports.colRunningBalance')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(accountActivity?.lines || []).map((line) => (
                      <TableRow key={line.lineId}>
                        <TableCell>{format(line.entryDate, 'MMM d, yyyy')}</TableCell>
                        <TableCell><Badge variant="outline">{line.sourceType}</Badge></TableCell>
                        <TableCell>{line.description || line.memo || '—'}</TableCell>
                        <TableCell className="text-end">{amount(line.debit)}</TableCell>
                        <TableCell className="text-end">{amount(line.credit)}</TableCell>
                        <TableCell className="text-end">{amount(line.runningBalance)}</TableCell>
                      </TableRow>
                    ))}
                    {!accountActivity?.lines.length && (
                      <TableRow>
                        <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                          {t('financialReports.noActivity')}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
