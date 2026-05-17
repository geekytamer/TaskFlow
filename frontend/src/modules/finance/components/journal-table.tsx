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

const accountTypeOrder: LedgerAccountType[] = [
  'Asset',
  'Liability',
  'Equity',
  'Revenue',
  'Expense',
];

const accountTypeDescriptions: Record<LedgerAccountType, string> = {
  Asset: 'Resources the company owns or controls.',
  Liability: 'Amounts the company owes to others.',
  Equity: 'Owner capital and retained earnings.',
  Revenue: 'Income earned from operations and other activity.',
  Expense: 'Costs incurred to operate the business.',
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
  const { money, amount } = useCompanyCurrency();
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
        title: 'Ledger unavailable',
        description: error?.message || 'Could not load journal entries.',
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
        title: 'Missing account details',
        description: 'Account name is required. Code is generated automatically.',
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
        toast({ title: 'Ledger account updated' });
      } else {
        await createLedgerAccount(selectedCompany.id, {
          name: accountForm.name.trim(),
          type: accountForm.type,
          detailType: accountForm.detailType.trim() || undefined,
          description: accountForm.description.trim() || undefined,
          isActive: accountForm.isActive,
        });
        toast({ title: 'Ledger account created' });
      }
      setOpenAccount(false);
      resetAccountForm();
      await load();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: accountForm.id ? 'Account update failed' : 'Account creation failed',
        description: error?.message || 'Could not save account.',
      });
    }
  };

  const handleDeleteAccount = async (account: LedgerAccount) => {
    try {
      await deleteLedgerAccount(account.id);
      await load();
      toast({ title: 'Ledger account deleted' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error?.message || 'Could not delete account.',
      });
    }
  };

  const handleCreateJournal = async () => {
    if (!selectedCompany) return;
    const amount = Number(journalForm.amount || 0);
    if (!journalForm.debitAccountId || !journalForm.creditAccountId || amount <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid journal',
        description: 'Debit account, credit account, and amount are required.',
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
      toast({ title: 'Journal entry posted' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Journal post failed',
        description: error?.message || 'Could not post journal entry.',
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
          Select a company to view the chart of accounts and journal.
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
            placeholder="Search by code, name, detail type, or description"
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
              <SelectItem value="all">All sections</SelectItem>
              {accountTypeOrder.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        summary={`${filteredAccounts.length} accounts shown • ${accounts.filter((account) => account.isActive !== false).length} active`}
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
              Export Accounts
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
                  Add Account
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{accountForm.id ? 'Edit Ledger Account' : 'Create Ledger Account'}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Code</Label>
                    <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                      {accountForm.id
                        ? 'Code is fixed after creation'
                        : `Auto-generated in ${accountForm.type}`}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input
                      value={accountForm.name}
                      onChange={(event) =>
                        setAccountForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      placeholder="e.g. Supplies Expense"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Section</Label>
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
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Detail Type</Label>
                    <Input
                      value={accountForm.detailType}
                      onChange={(event) =>
                        setAccountForm((prev) => ({ ...prev, detailType: event.target.value }))
                      }
                      placeholder="e.g. Trade receivables"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Description</Label>
                    <Textarea
                      value={accountForm.description}
                      onChange={(event) =>
                        setAccountForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                      placeholder="Explain what should be posted into this account."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Status</Label>
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
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpenAccount(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveAccount}>{accountForm.id ? 'Save Changes' : 'Create Account'}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={openJournal} onOpenChange={setOpenJournal}>
              <DialogTrigger asChild>
                <Button data-tutorial="coa-journal-btn">
                  <NotebookPen className="me-2 h-4 w-4" />
                  Manual Journal
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Post Manual Journal Entry</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Memo</Label>
                    <Input
                      value={journalForm.memo}
                      onChange={(event) =>
                        setJournalForm((prev) => ({ ...prev, memo: event.target.value }))
                      }
                      placeholder="Adjustment / accrual memo"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Entry Date</Label>
                    <Input
                      type="date"
                      value={journalForm.entryDate}
                      onChange={(event) =>
                        setJournalForm((prev) => ({ ...prev, entryDate: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      value={journalForm.amount}
                      onChange={(event) =>
                        setJournalForm((prev) => ({ ...prev, amount: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Debit Account</Label>
                    <Select
                      value={journalForm.debitAccountId}
                      onValueChange={(value) =>
                        setJournalForm((prev) => ({ ...prev, debitAccountId: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
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
                    <Label>Credit Account</Label>
                    <Select
                      value={journalForm.creditAccountId}
                      onValueChange={(value) =>
                        setJournalForm((prev) => ({ ...prev, creditAccountId: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
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
                    <Label>Line Description</Label>
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
                    Cancel
                  </Button>
                  <Button onClick={handleCreateJournal}>Post Entry</Button>
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
              <CardTitle className="text-sm font-medium">{stat.type}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.total}</div>
              <p className="text-xs text-muted-foreground">
                {stat.active} active • {accountTypeDescriptions[stat.type]}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card data-tutorial="coa-table">
        <CardHeader>
          <CardTitle>Chart of Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {accountTypeOrder.map((type) => {
            const typeAccounts = groupedAccounts.get(type) || [];
            return (
              <div key={type} className="space-y-3">
                <div>
                  <h3 className="text-base font-semibold">{type}</h3>
                  <p className="text-sm text-muted-foreground">{accountTypeDescriptions[type]}</p>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <Table className="min-w-[1100px] table-fixed">
                    {accountColumnGroup}
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Detail Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead className="text-end">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {typeAccounts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-16 text-center text-muted-foreground">
                            No {type.toLowerCase()} accounts match the current filters.
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
                                {account.isActive === false ? 'Inactive' : 'Active'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {account.isSystem ? (
                                <Badge>System</Badge>
                              ) : (
                                <Badge variant="outline">Custom</Badge>
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
                                  Edit
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteAccount(account)}
                                  disabled={account.isSystem}
                                >
                                  <Trash2 className="me-2 h-4 w-4" />
                                  Delete
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
          <CardTitle>Journal Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Memo</TableHead>
                  <TableHead>Lines</TableHead>
                  <TableHead className="text-end">Total Debit</TableHead>
                  <TableHead className="text-end">Total Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                      No journal entries yet.
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
