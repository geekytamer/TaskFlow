'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompany } from '@/context/company-context';
import { useCompanyCurrency } from '@/lib/currency';
import { ActivityFeed } from '@/modules/operations/components/activity-feed';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { ClientTable } from '@/modules/finance/components/client-table';
import { getClients, getInvoices } from '@/services/financeService';
import { getProjects } from '@/services/projectService';
import type { Client, Invoice, Project } from '@/lib/types';

export function ClientsPage() {
  const { selectedCompany } = useCompany();
  const { money, amount } = useCompanyCurrency();
  const [clients, setClients] = React.useState<Client[]>([]);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!selectedCompany) {
        setClients([]);
        setInvoices([]);
        setProjects([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [clientData, invoiceData, projectData] = await Promise.all([
          getClients(selectedCompany.id),
          getInvoices(selectedCompany.id),
          getProjects(),
        ]);
        if (cancelled) return;
        setClients(clientData);
        setInvoices(invoiceData);
        setProjects(projectData.filter((project) => project.companyId === selectedCompany.id));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedCompany]);

  const outstanding = React.useMemo(
    () =>
      invoices
        .filter((invoice) => invoice.status === 'Sent' || invoice.status === 'Overdue')
        .reduce((sum, invoice) => sum + invoice.total, 0),
    [invoices],
  );

  const linkedProjects = React.useMemo(
    () => projects.filter((project) => Boolean(project.clientId)).length,
    [projects],
  );

  if (!selectedCompany) {
    return (
      <SectionPageShell
        title="Client Management"
        description="Manage client records separately while keeping them linked to projects, billing, and activity history."
      >
        <SectionEmptyState
          title="Choose a company to continue"
          description="Client records are stored per company. Switch into a company first to manage relationships, linked projects, and receivables."
        />
      </SectionPageShell>
    );
  }

  return (
    <SectionPageShell
      title="Client Management"
      description="Manage client records separately while keeping them linked to projects and finance."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Clients</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-14" /> : <div className="text-2xl font-bold">{clients.length}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-14" />
            ) : (
              <div className="text-2xl font-bold">
                {invoices.filter((invoice) => invoice.status !== 'Paid').length}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Receivables</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{amount(outstanding)}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Linked Projects</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-14" /> : <div className="text-2xl font-bold">{linkedProjects}</div>}
          </CardContent>
        </Card>
      </div>

      <ClientTable />

      <ActivityFeed
        title="Client And Billing Activity"
        limit={8}
        emptyMessage="No client activity recorded yet."
      />
    </SectionPageShell>
  );
}
