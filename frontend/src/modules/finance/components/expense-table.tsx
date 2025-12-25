'use client';

import * as React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompany } from '@/context/company-context';
import { getTasks } from '@/services/projectService';
import { format } from 'date-fns';
import { ExternalLink, Receipt, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';
import type { Task } from '@/modules/projects/types';

export function ExpenseTable() {
  const { selectedCompany, projects, currentUser } = useCompany();
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function load() {
      if (!selectedCompany) return;
      setLoading(true);
      const allTasks = await getTasks();
      setTasks(allTasks);
      setLoading(false);
    }
    load();
  }, [selectedCompany]);

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
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Attachments</TableHead>
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

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div>
          <CardTitle>Expenses</CardTitle>
          <p className="text-sm text-muted-foreground">Employee-uploaded receipts linked to tasks.</p>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Attachments</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground h-24">
                  No expense receipts found. Add vendor/amount/receipt on a task.
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
                    <TableCell>${(task.invoiceAmount || 0).toFixed(2)}</TableCell>
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
                          View
                        </a>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/projects/${task.projectId}`}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        Open task <ExternalLink className="h-3.5 w-3.5" />
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
