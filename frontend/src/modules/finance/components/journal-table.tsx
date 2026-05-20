'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import {
  createJournalEntry,
  createLedgerAccount,
  deleteLedgerAccount,
  getJournalEntries,
  getLedgerAccounts,
  updateLedgerAccount,
} from '@/services/financeService';
import type { JournalEntry, LedgerAccount, LedgerAccountType } from '@/modules/finance/types';
import { Download, FilePlus2, NotebookPen, Pencil, Trash2 } from 'lucide-react';
import { downloadCsv } from '@/modules/finance/lib/csv';
import { SectionToolbar } from '@/modules/operations/components/section-toolbar';
import { useI18n } from '@/context/i18n-context';

const accountTypeOrder: LedgerAccountType[] = [
  'Asset',
  'Liability',
  'Equity',
  'Revenue',
  'Expense',
];

const accountTypeDescriptionKeys: Record<LedgerAccountType, string> = {
  Asset: 'journal.descAsset',
  Liability: 'journal.descLiability',
  Equity: 'journal.descEquity',
  Revenue: 'journal.descRevenue',
  Expense: 'journal.descExpense',
};

type AccountFormState = {
  id?: string;
  name: string;
  type: LedgerAccountType;
  detailType: string;
  description: string;
  isActive: boolean;
};

const emptyAccountForm = (): AccountFormState => ({
  name: '',
  type: 'Expense',
  detailType: '',
  description: '',
  isActive: true,
});

const accountColumnGroup = (
  <colgroup>
    <col className="w-[7%]" />
    <col className="w-[16%]" />
    <col className="w-[14%]" />
    <col className="w-[32%]" />
    <col className="w-[8%]" />
    <col className="w-[8%]" />
    <col className="w-[15%]" />
  </colgroup>
);

export function JournalTable() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const { t } = useI18n();
  const { money, amount } = useCompanyCurrency();
  const typeLabel = (type: LedgerAccountType) => t(`journal.type${type}`);
  const typeDescription = (type: LedgerAccountType) => t(accountTypeDescriptionKeys[type]);
  const [entries, setEntries] = React.useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = React.useState<LedgerAccount[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [accountSearch, setAccountSearch] = React.useState('');
  const [accountTypeFilter, setAccountTypeFilter] = React.useState<'all' | LedgerAccountType>('all');

  const [openAccount, setOpenAccount] = React.useState(false);
  const [accountForm, setAccountForm] = React.useState<AccountFormState>(emptyAccountForm);

  const [openJournal, setOpenJournal] = React.useState(false);
  const [journalForm, setJournalForm] = React.useState({
    memo: '',
    entryDate: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    debitAccountId: '',
    creditAccountId: '',
    description: '',
  });

  const load = React.useCallback(async () => {
    if (!selectedCompany) {
      setEntries([]);
      setAccounts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [entryData, accountData] = await Promise.all([
        getJournalEntries(selectedCompany.id, 150),
        getLedgerAccounts(selectedCompany.id),
      ]);
      setEntries(entryData);
      setAccounts(accountData);
    } catch (error: any) {
      setEntries([]);
      setAccounts([]);
      toast({
        variant: 'destructive',
        title: t('journal.toastUnavailableTitle'),
        description: error?.message || t('journal.toastUnavailableDesc'),
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const accountMap = React.useMemo(() => {
    const map = new Map<string, LedgerAccount>();
    accounts.forEach((account) => map.set(account.id, account));
    return map;
  }, [accounts]);

  const filteredAccounts = React.useMemo(() => {
    const query = accountSearch.trim().toLowerCase();
    return accounts.filter((account) => {
      const matchesType = accountTypeFilter === 'all' || account.type === accountTypeFilter;
      const matchesQuery =
        !query ||
        [account.code, account.name, account.detailType || '', account.description || '']
          .some((value) => value.toLowerCase().includes(query));
      return matchesType && matchesQuery;
    });
  }, [accountSearch, accountTypeFilter, accounts]);

  const groupedAccounts = React.useMemo(() => {
    const map = new Map<LedgerAccountType, LedgerAccount[]>();
    accountTypeOrder.forEach((type) => map.set(type, []));
    filteredAccounts.forEach((account) => {
      const bucket = map.get(account.type) || [];
      bucket.push(account);
      map.set(account.type, bucket);
    });
    map.forEach((bucket) => bucket.sort((left, right) => left.code.localeCompare(right.code)));
    return map;
  }, [filteredAccounts]);

  const accountStats = React.useMemo(
    () =>
      accountTypeOrder.map((type) => ({
        type,
        total: accounts.filter((account) => account.type === type).length,
        active: accounts.filter((account) => account.type === type && account.isActive !== false).length,
      })),
    [accounts],
  );

  const resetAccountForm = () => setAccountForm(emptyAccountForm());

  const openCreateAccount = () => {
    resetAccountForm();
    setOpenAccount(true);
  };

  const openEditAccount = (account: LedgerAccount) => {
    setAccountForm({
      id: account.id,
      name: account.name,
      type: account.type,
      detailType: account.detailType || '',
      description: account.description || '',
      isActive: account.isActive !== false,
    });
    setOpenAccount(true);
  };

  const handleSaveAccount = async () => {
    if (!selectedCompany) return;
    if (!accountForm.name.trim()) {
      toast({
        variant: 'destructive',
        title: t('journal.toastMissingTitle'),
        description: t('journal.toastMissingDesc'),
      });
      return;
    }
    try {
      if (accountForm.id) {
        await updateLedgerAccount(accountForm.id, {
          name: accountForm.name.trim(),
          type: accountForm.type,
          detailType: accountForm.detailType.trim() || undefined,
          description: accountForm.description.trim() || undefined,
          isActive: accountForm.isActive,
        });
        toast({ title: t('journal.toastAccountUpdated') });
      } else {
        await createLedgerAccount(selectedCompany.id, {
          name: accountForm.name.trim(),
          type: accountForm.type,
          detailType: accountForm.detailType.trim() || undefined,
          description: accountForm.description.trim() || undefined,
          isActive: accountForm.isActive,
        });
        toast({ title: t('journal.toastAccountCreated') });
      }
      setOpenAccount(false);
      resetAccountForm();
      await load();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: accountForm.id ? t('journal.toastAccountUpdateFailedTitle') : t('journal.toastAccountCreateFailedTitle'),
        description: error?.message || t('journal.toastAccountSaveFailedDesc'),
      });
    }
  };

  const handleDeleteAccount = async (account: LedgerAccount) => {
    try {
      await deleteLedgerAccount(account.id);
      await load();
      toast({ title: t('journal.toastAccountDeleted') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('journal.toastDeleteFailedTitle'),
        description: error?.message || t('journal.toastDeleteFailedDesc'),
      });
    }
  };

  const handleCreateJournal = async () => {
    if (!selectedCompany) return;
    const amount = Number(journalForm.amount || 0);
    if (!journalForm.debitAccountId || !journalForm.creditAccountId || amount <= 0) {
      toast({
        variant: 'destructive',
        title: t('journal.toastInvalidTitle'),
        description: t('journal.toastInvalidDesc'),
      });
      return;
    }

    try {
      await createJournalEntry(selectedCompany.id, {
        memo: journalForm.memo || undefined,
        entryDate: new Date(journalForm.entryDate),
        sourceType: 'manual',
        lines: [
          {
            accountId: journalForm.debitAccountId,
            description: journalForm.description || undefined,
            debit: amount,
            credit: 0,
          },
          {
            accountId: journalForm.creditAccountId,
            description: journalForm.description || undefined,
            debit: 0,
            credit: amount,
          },
        ],
      });
      setOpenJournal(false);
      setJournalForm({
        memo: '',
        entryDate: format(new Date(), 'yyyy-MM-dd'),
        amount: '',
        debitAccountId: '',
        creditAccountId: '',
        description: '',
      });
      await load();
      toast({ title: t('journal.toastPosted') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('journal.toastPostFailedTitle'),
        description: error?.message || t('journal.toastPostFailedDesc'),
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-44" />
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!selectedCompany) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          {t('journal.selectCompany')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <SectionToolbar
        search={(
          <Input
            value={accountSearch}
            onChange={(event) => setAccountSearch(event.target.value)}
            placeholder={t('journal.searchPlaceholder')}
            className="max-w-md"
          />
        )}
        filters={(
          <Select
            value={accountTypeFilter}
            onValueChange={(value) => setAccountTypeFilter(value as 'all' | LedgerAccountType)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('journal.allSections')}</SelectItem>
              {accountTypeOrder.map((type) => (
                <SelectItem key={type} value={type}>
                  {typeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        summary={t('journal.summaryActive')
          .replace('{count}', String(filteredAccounts.length))
          .replace('{active}', String(accounts.filter((account) => account.isActive !== false).length))}
        actions={(
          <>
            <Button
              data-tutorial="coa-export-btn"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  `chart-of-accounts-${format(new Date(), 'yyyy-MM-dd')}.csv`,
                  ['code', 'name', 'type', 'detailType', 'description', 'isActive', 'isSystem'],
                  accounts.map((account) => [
                    account.code,
                    account.name,
                    account.type,
                    account.detailType || '',
                    account.description || '',
                    account.isActive === false ? 'false' : 'true',
                    account.isSystem ? 'true' : 'false',
                  ]),
                )
              }
            >
              <Download className="me-2 h-4 w-4" />
              {t('journal.exportAccounts')}
            </Button>

            <Dialog
              open={openAccount}
              onOpenChange={(open) => {
                setOpenAccount(open);
                if (!open) resetAccountForm();
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline" onClick={openCreateAccount} data-tutorial="coa-add-account-btn">
                  <FilePlus2 className="me-2 h-4 w-4" />
                  {t('journal.addAccount')}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{accountForm.id ? t('journal.editTitle') : t('journal.createTitle')}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>{t('journal.codeLabel')}</Label>
                    <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                      {accountForm.id
                        ? t('journal.codeFixed')
                        : t('journal.codeAuto').replace('{type}', typeLabel(accountForm.type))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>{t('journal.nameLabel')}</Label>
                    <Input
                      value={accountForm.name}
                      onChange={(event) =>
                        setAccountForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      placeholder={t('journal.namePlaceholder')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('journal.sectionLabel')}</Label>
                    <Select
                      value={accountForm.type}
                      onValueChange={(value) =>
                        setAccountForm((prev) => ({ ...prev, type: value as LedgerAccountType }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {accountTypeOrder.map((type) => (
                          <SelectItem key={type} value={type}>
                            {typeLabel(type)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>{t('journal.detailTypeLabel')}</Label>
                    <Input
                      value={accountForm.detailType}
                      onChange={(event) =>
                        setAccountForm((prev) => ({ ...prev, detailType: event.target.value }))
                      }
                      placeholder={t('journal.detailTypePlaceholder')}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>{t('journal.descriptionLabel')}</Label>
                    <Textarea
                      value={accountForm.description}
                      onChange={(event) =>
                        setAccountForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                      placeholder={t('journal.descriptionPlaceholder')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('journal.statusLabel')}</Label>
                    <Select
                      value={accountForm.isActive ? 'active' : 'inactive'}
                      onValueChange={(value) =>
                        setAccountForm((prev) => ({ ...prev, isActive: value === 'active' }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">{t('journal.statusActive')}</SelectItem>
                        <SelectItem value="inactive">{t('journal.statusInactive')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpenAccount(false)}>
                    {t('journal.cancel')}
                  </Button>
                  <Button onClick={handleSaveAccount}>{accountForm.id ? t('journal.saveChanges') : t('journal.createAccount')}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={openJournal} onOpenChange={setOpenJournal}>
              <DialogTrigger asChild>
                <Button data-tutorial="coa-journal-btn">
                  <NotebookPen className="me-2 h-4 w-4" />
                  {t('journal.manualJournal')}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{t('journal.postManualTitle')}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label>{t('journal.memoLabel')}</Label>
                    <Input
                      value={journalForm.memo}
                      onChange={(event) =>
                        setJournalForm((prev) => ({ ...prev, memo: event.target.value }))
                      }
                      placeholder={t('journal.memoPlaceholder')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('journal.entryDateLabel')}</Label>
                    <Input
                      type="date"
                      value={journalForm.entryDate}
                      onChange={(event) =>
                        setJournalForm((prev) => ({ ...prev, entryDate: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('journal.amountLabel')}</Label>
                    <Input
                      type="number"
                      value={journalForm.amount}
                      onChange={(event) =>
                        setJournalForm((prev) => ({ ...prev, amount: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('journal.debitAccountLabel')}</Label>
                    <Select
                      value={journalForm.debitAccountId}
                      onValueChange={(value) =>
                        setJournalForm((prev) => ({ ...prev, debitAccountId: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('journal.selectAccount')} />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts
                          .filter((account) => account.isActive !== false)
                          .map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.code} - {account.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>{t('journal.creditAccountLabel')}</Label>
                    <Select
                      value={journalForm.creditAccountId}
                      onValueChange={(value) =>
                        setJournalForm((prev) => ({ ...prev, creditAccountId: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('journal.selectAccount')} />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts
                          .filter((account) => account.isActive !== false)
                          .map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.code} - {account.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>{t('journal.lineDescriptionLabel')}</Label>
                    <Textarea
                      value={journalForm.description}
                      onChange={(event) =>
                        setJournalForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpenJournal(false)}>
                    {t('journal.cancel')}
                  </Button>
                  <Button onClick={handleCreateJournal}>{t('journal.postEntry')}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5" data-tutorial="coa-stats">
        {accountStats.map((stat) => (
          <Card key={stat.type}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{typeLabel(stat.type)}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.total}</div>
              <p className="text-xs text-muted-foreground">
                {t('journal.activeDescriptionTail')
                  .replace('{count}', String(stat.active))
                  .replace('{description}', typeDescription(stat.type))}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card data-tutorial="coa-table">
        <CardHeader>
          <CardTitle>{t('journal.chartOfAccountsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {accountTypeOrder.map((type) => {
            const typeAccounts = groupedAccounts.get(type) || [];
            return (
              <div key={type} className="space-y-3">
                <div>
                  <h3 className="text-base font-semibold">{typeLabel(type)}</h3>
                  <p className="text-sm text-muted-foreground">{typeDescription(type)}</p>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <Table className="min-w-[1100px] table-fixed">
                    {accountColumnGroup}
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('journal.colCode')}</TableHead>
                        <TableHead>{t('journal.colName')}</TableHead>
                        <TableHead>{t('journal.colDetailType')}</TableHead>
                        <TableHead>{t('journal.colDescription')}</TableHead>
                        <TableHead>{t('journal.colStatus')}</TableHead>
                        <TableHead>{t('journal.colClass')}</TableHead>
                        <TableHead className="text-end">{t('journal.colActions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {typeAccounts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-16 text-center text-muted-foreground">
                            {t('journal.noAccountsMatch').replace('{type}', typeLabel(type))}
                          </TableCell>
                        </TableRow>
                      ) : (
                        typeAccounts.map((account) => (
                          <TableRow key={account.id}>
                            <TableCell className="font-mono">{account.code}</TableCell>
                            <TableCell className="font-medium">{account.name}</TableCell>
                            <TableCell className="truncate">{account.detailType || '—'}</TableCell>
                            <TableCell className="truncate">{account.description || '—'}</TableCell>
                            <TableCell>
                              <Badge variant={account.isActive === false ? 'outline' : 'default'}>
                                {account.isActive === false ? t('journal.inactiveBadge') : t('journal.activeBadge')}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {account.isSystem ? (
                                <Badge>{t('journal.systemBadge')}</Badge>
                              ) : (
                                <Badge variant="outline">{t('journal.customBadge')}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-end">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openEditAccount(account)}
                                  disabled={account.isSystem}
                                >
                                  <Pencil className="me-2 h-4 w-4" />
                                  {t('journal.edit')}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteAccount(account)}
                                  disabled={account.isSystem}
                                >
                                  <Trash2 className="me-2 h-4 w-4" />
                                  {t('journal.delete')}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card data-tutorial="coa-journal-table">
        <CardHeader>
          <CardTitle>{t('journal.journalEntriesTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('journal.colDate')}</TableHead>
                  <TableHead>{t('journal.colSource')}</TableHead>
                  <TableHead>{t('journal.colMemo')}</TableHead>
                  <TableHead>{t('journal.colLines')}</TableHead>
                  <TableHead className="text-end">{t('journal.colTotalDebit')}</TableHead>
                  <TableHead className="text-end">{t('journal.colTotalCredit')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                      {t('journal.noEntries')}
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry) => {
                    const totalDebit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
                    const totalCredit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
                    return (
                      <TableRow key={entry.id}>
                        <TableCell>{format(entry.entryDate, 'MMM d, yyyy')}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{entry.sourceType}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate">{entry.memo || '—'}</TableCell>
                        <TableCell>
                          {entry.lines.map((line) => {
                            const account = accountMap.get(line.accountId);
                            return (
                              <div key={line.id} className="text-xs text-muted-foreground">
                                {account?.code || line.accountId} {account?.name ? `- ${account.name}` : ''}
                              </div>
                            );
                          })}
                        </TableCell>
                        <TableCell className="text-end">{amount(totalDebit)}</TableCell>
                        <TableCell className="text-end">{amount(totalCredit)}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
