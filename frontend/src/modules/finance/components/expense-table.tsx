'use client';

import * as React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompany } from '@/context/company-context';
import { getTasks } from '@/services/projectService';
import { format } from 'date-fns';
import { ExternalLink, Receipt, Image as ImageIcon, Download } from 'lucide-react';
import Link from 'next/link';
import type { Task } from '@/modules/projects/types';
import { Button } from '@/components/ui/button';
import { downloadCsv } from '@/modules/finance/lib/csv';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { useI18n } from '@/context/i18n-context';

export function ExpenseTable() {
  const { selectedCompany, projects, currentUser } = useCompany();
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { toast } = useToast();
  const { t } = useI18n();
  const { money, amount } = useCompanyCurrency();

  React.useEffect(() => {
    async function load() {
      if (!selectedCompany) {
        setTasks([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const allTasks = await getTasks();
        setTasks(allTasks);
      } catch (error: any) {
        setTasks([]);
        toast({
          variant: 'destructive',
          title: t('expenseTable.toastUnavailableTitle'),
          description: error?.message || t('expenseTable.toastUnavailableDesc'),
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [selectedCompany, toast]);

  const expenses = React.useMemo(() => {
    if (!selectedCompany) return [];
    const visibleProjectIds = projects
      .filter((p) => p.companyId === selectedCompany.id && (p.visibility === 'Public' || p.memberIds?.includes(currentUser?.id || '') || currentUser?.role === 'Admin'))
      .map((p) => p.id);
    return tasks
      .filter((t) => t.companyId === selectedCompany.id && visibleProjectIds.includes(t.projectId))
      .filter((t) => t.invoiceAmount || t.invoiceVendor || t.invoiceNumber);
  }, [tasks, selectedCompany, projects, currentUser]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('expenseTable.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('expenseTable.colTask')}</TableHead>
                <TableHead>{t('expenseTable.colProject')}</TableHead>
                <TableHead>{t('expenseTable.colVendor')}</TableHead>
                <TableHead>{t('expenseTable.colAmount')}</TableHead>
                <TableHead>{t('expenseTable.colDate')}</TableHead>
                <TableHead>{t('expenseTable.colAttachments')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  if (!selectedCompany) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          {t('expenseTable.selectCompany')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div>
          <CardTitle>{t('expenseTable.title')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('expenseTable.subtitle')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCsv(
              `expenses-${format(new Date(), 'yyyy-MM-dd')}.csv`,
              ['task', 'project', 'vendor', 'invoiceNumber', 'amount', 'date', 'receiptUrl'],
              expenses.map((task) => {
                const project = projects.find((p) => p.id === task.projectId);
                return [
                  task.title,
                  project?.name || '',
                  task.invoiceVendor || '',
                  task.invoiceNumber || '',
                  task.invoiceAmount || 0,
                  task.invoiceDate ? task.invoiceDate.toISOString() : '',
                  task.invoiceImage || '',
                ];
              }),
            )
          }
        >
          <Download className="me-2 h-4 w-4" />
          {t('expenseTable.exportCsv')}
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('expenseTable.colTask')}</TableHead>
              <TableHead>{t('expenseTable.colProject')}</TableHead>
              <TableHead>{t('expenseTable.colVendor')}</TableHead>
              <TableHead>{t('expenseTable.colAmount')}</TableHead>
              <TableHead>{t('expenseTable.colDate')}</TableHead>
              <TableHead>{t('expenseTable.colAttachments')}</TableHead>
              <TableHead className="text-end">{t('expenseTable.colOpen')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground h-24">
                  {t('expenseTable.empty')}
                </TableCell>
              </TableRow>
            ) : (
              expenses.map((task) => {
                const project = projects.find((p) => p.id === task.projectId);
                return (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell>
                      {project ? (
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: task.color || project.color }} />
                          {project.name}
                        </div>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Receipt className="h-4 w-4 text-muted-foreground" />
                        <span>{task.invoiceVendor || 'N/A'}</span>
                        {task.invoiceNumber && (
                          <Badge variant="outline" className="text-xs">
                            #{task.invoiceNumber}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{amount(task.invoiceAmount || 0)}</TableCell>
                    <TableCell>{task.invoiceDate ? format(task.invoiceDate, 'MMM d, yyyy') : 'N/A'}</TableCell>
                    <TableCell>
                      {task.invoiceImage ? (
                        <a
                          href={task.invoiceImage}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <ImageIcon className="h-4 w-4" />
                          {t('expenseTable.viewBtn')}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">{t('expenseTable.none')}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <Link
                        href={`/projects/${task.projectId}`}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        {t('expenseTable.openTask')} <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
