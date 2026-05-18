'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { getContactSummary, type ContactSummary } from '@/services/contactService';
import {
  ArrowLeft,
  Briefcase,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Package,
  Phone,
  Receipt,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';

const empty = '—';

export function ContactDetailPage({ contactId }: { contactId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const { toast } = useToast();
  const { money, amount } = useCompanyCurrency();
  const [summary, setSummary] = React.useState<ContactSummary | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    getContactSummary(contactId)
      .then(setSummary)
      .catch((err: any) => {
        toast({
          variant: 'destructive',
          title: t('contact360.loadFailed'),
          description: err?.message,
        });
      })
      .finally(() => setLoading(false));
  }, [contactId, toast, t]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-6 text-sm text-muted-foreground">{t('contact360.notFound')}</div>
    );
  }

  const c = summary.contact;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4" />
            {t('common.back')}
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">{c.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {(c.roles || []).map((r) => (
              <Badge key={r} variant="outline">
                {r}
              </Badge>
            ))}
            {c.leadStatus && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                {c.leadStatus}
              </Badge>
            )}
            {c.priority && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                {c.priority}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Top row: details + counters */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {t('contact360.detailsTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row icon={<Phone className="h-3.5 w-3.5" />} label={c.phone || empty} />
            <Row icon={<Mail className="h-3.5 w-3.5" />} label={c.email || empty} />
            <Row icon={<MapPin className="h-3.5 w-3.5" />} label={c.address || empty} />
            {c.notes && (
              <p className="pt-2 text-xs text-muted-foreground whitespace-pre-wrap">{c.notes}</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {t('contact360.financialsTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat
              icon={<FileText className="h-4 w-4 text-blue-600" />}
              label={t('whatsapp.summaryInvoices')}
              value={String(summary.totals.invoiceCount)}
              helper={money(summary.totals.invoiceOutstanding) + ' ' + t('whatsapp.summaryOutstanding')}
            />
            <Stat
              icon={<Receipt className="h-4 w-4 text-emerald-600" />}
              label={t('whatsapp.summarySalesOrders')}
              value={String(summary.totals.salesOrderCount)}
              helper={money(summary.totals.salesOrderTotal)}
            />
            <Stat
              icon={<ShoppingCart className="h-4 w-4 text-orange-600" />}
              label={t('whatsapp.summaryPurchaseOrders')}
              value={String(summary.totals.purchaseOrderCount)}
            />
            <Stat
              icon={<Package className="h-4 w-4 text-red-600" />}
              label={t('whatsapp.summaryVendorBills')}
              value={String(summary.totals.vendorBillCount)}
              helper={money(summary.totals.vendorBillOutstanding) + ' ' + t('whatsapp.summaryOutstanding')}
            />
            <Stat
              icon={<TrendingUp className="h-4 w-4 text-violet-600" />}
              label={t('whatsapp.summaryOpportunities')}
              value={String(summary.totals.opportunityCount)}
            />
            <Stat
              icon={<Briefcase className="h-4 w-4 text-cyan-600" />}
              label={t('whatsapp.summaryProjects')}
              value={String(summary.totals.projectCount)}
            />
          </CardContent>
        </Card>
      </div>

      {/* Detailed sections */}
      <RecordTable
        title={t('whatsapp.summaryInvoices')}
        href="/finance?tab=invoices"
        columns={[
          t('contact360.colNumber'),
          t('contact360.colStatus'),
          t('contact360.colTotal'),
          t('contact360.colOutstanding'),
          t('contact360.colDue'),
        ]}
        rows={summary.invoices.slice(0, 15).map((inv) => [
          inv.invoiceNumber,
          inv.status,
          amount(inv.total || 0),
          amount(inv.outstandingAmount || 0),
          inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : empty,
        ])}
      />
      <RecordTable
        title={t('whatsapp.summarySalesOrders')}
        href="/sales"
        columns={[
          t('contact360.colNumber'),
          t('contact360.colStatus'),
          t('contact360.colTotal'),
          t('contact360.colOrderDate'),
        ]}
        rows={summary.salesOrders.slice(0, 15).map((so) => [
          so.orderNumber,
          so.status,
          amount(so.totalAmount || 0),
          so.orderDate ? new Date(so.orderDate).toLocaleDateString() : empty,
        ])}
      />
      <RecordTable
        title={t('whatsapp.summaryProjects')}
        href="/projects"
        columns={[t('contact360.colName'), t('contact360.colDescription')]}
        rows={summary.projects.slice(0, 15).map((p) => [p.name, p.description || empty])}
      />
      <RecordTable
        title={t('whatsapp.summaryVendorBills')}
        href="/finance?tab=payables"
        columns={[
          t('contact360.colNumber'),
          t('contact360.colStatus'),
          t('contact360.colTotal'),
          t('contact360.colOutstanding'),
          t('contact360.colDue'),
        ]}
        rows={summary.vendorBills.slice(0, 15).map((b) => [
          b.billNumber,
          b.status,
          amount(b.amount || 0),
          amount(b.outstandingAmount || 0),
          b.dueDate ? new Date(b.dueDate).toLocaleDateString() : empty,
        ])}
      />
      <RecordTable
        title={t('whatsapp.summaryPurchaseOrders')}
        href="/purchases"
        columns={[
          t('contact360.colNumber'),
          t('contact360.colStatus'),
          t('contact360.colTotal'),
        ]}
        rows={summary.purchaseOrders.slice(0, 15).map((po) => [
          po.orderNumber,
          po.status,
          amount(po.totalAmount || 0),
        ])}
      />
      <RecordTable
        title={t('whatsapp.summaryOpportunities')}
        href="/crm/opportunities"
        columns={[
          t('contact360.colName'),
          t('contact360.colStatus'),
          t('contact360.colTotal'),
        ]}
        rows={summary.opportunities.slice(0, 15).map((opp) => [
          opp.name,
          opp.stage,
          amount(opp.expectedRevenue || 0),
        ])}
      />
    </div>
  );
}

function Row({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  helper,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {helper && <div className="text-[11px] text-muted-foreground">{helper}</div>}
    </div>
  );
}

function RecordTable({
  title,
  href,
  columns,
  rows,
}: {
  title: string;
  href: string;
  columns: string[];
  rows: Array<Array<React.ReactNode>>;
}) {
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Link
          href={href}
          className="text-xs text-primary underline-offset-2 hover:underline"
        >
          {title} →
        </Link>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c}>{c}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, idx) => (
              <TableRow key={idx}>
                {r.map((cell, cidx) => (
                  <TableCell key={cidx} className="text-sm">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
