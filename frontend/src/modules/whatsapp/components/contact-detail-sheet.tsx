'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import type { Contact, ContactSummary } from '@/services/contactService';
import { createContact, getContactSummary, updateContact } from '@/services/contactService';
import {
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
  UserPlus,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface ContactDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  contactId?: string;
  /** When opening for a chat without a linked contact, use this phone to prefill creation */
  fallbackPhone?: string;
  /** Notify parent that contact was created so it can re-link the chat */
  onContactCreated?: (contact: Contact) => void;
}

export function ContactDetailSheet({
  open,
  onOpenChange,
  companyId,
  contactId,
  fallbackPhone,
  onContactCreated,
}: ContactDetailSheetProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { money } = useCompanyCurrency();
  const [summary, setSummary] = React.useState<ContactSummary | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '',
    phone: fallbackPhone ? `+${fallbackPhone.replace(/\D/g, '')}` : '',
    email: '',
    address: '',
    notes: '',
  });

  React.useEffect(() => {
    if (!open) return;
    if (!contactId) {
      // Pre-fill create form for an unlinked chat
      setSummary(null);
      setEditing(false);
      setCreating(true);
      setForm({
        name: '',
        phone: fallbackPhone ? `+${fallbackPhone.replace(/\D/g, '')}` : '',
        email: '',
        address: '',
        notes: '',
      });
      return;
    }
    setCreating(false);
    setLoading(true);
    getContactSummary(contactId)
      .then((data) => {
        setSummary(data);
        setForm({
          name: data.contact.name || '',
          phone: data.contact.phone || '',
          email: data.contact.email || '',
          address: data.contact.address || '',
          notes: data.contact.notes || '',
        });
      })
      .catch((err: any) => {
        toast({
          variant: 'destructive',
          title: t('whatsapp.contactSummaryFailedTitle'),
          description: err?.message,
        });
      })
      .finally(() => setLoading(false));
  }, [open, contactId, fallbackPhone, toast, t]);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast({
        variant: 'destructive',
        title: t('whatsapp.contactNameRequiredTitle'),
        description: t('whatsapp.contactNameRequiredDescription'),
      });
      return;
    }
    try {
      const created = await createContact({
        companyId,
        kind: 'Person',
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      toast({ title: t('whatsapp.contactCreatedToast') });
      onContactCreated?.(created);
      setCreating(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t('whatsapp.contactCreateFailedTitle'),
        description: err?.message,
      });
    }
  };

  const handleSave = async () => {
    if (!summary) return;
    try {
      const updated = await updateContact(summary.contact.id, {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setSummary({ ...summary, contact: updated });
      setEditing(false);
      toast({ title: t('whatsapp.contactSavedToast') });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t('whatsapp.contactSaveFailedTitle'),
        description: err?.message,
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {creating
              ? t('whatsapp.createContactTitle')
              : summary?.contact.name || t('whatsapp.contactDetails')}
          </SheetTitle>
          <SheetDescription>
            {creating
              ? t('whatsapp.createContactDescription')
              : summary?.contact.email ||
                summary?.contact.phone ||
                t('whatsapp.contactDetailsSubtitle')}
          </SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && creating && (
          <div className="mt-4 space-y-3">
            <div className="space-y-1">
              <Label>{t('whatsapp.contactName')}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label>{t('whatsapp.contactPhone')}</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{t('whatsapp.contactEmail')}</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{t('whatsapp.contactAddress')}</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{t('whatsapp.contactNotes')}</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleCreate}>
                <UserPlus className="me-2 h-4 w-4" />
                {t('whatsapp.createContact')}
              </Button>
            </div>
          </div>
        )}

        {!loading && summary && !creating && (
          <div className="mt-4 space-y-4">
            {/* Header info */}
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-wrap gap-1">
                {(summary.contact.roles || []).map((r) => (
                  <Badge key={r} variant="outline" className="capitalize">
                    {r}
                  </Badge>
                ))}
                {summary.contact.leadStatus && (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    {summary.contact.leadStatus}
                  </Badge>
                )}
              </div>
              {editing ? (
                <div className="space-y-2">
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  />
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    placeholder={t('whatsapp.contactPhone')}
                  />
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder={t('whatsapp.contactEmail')}
                  />
                  <Input
                    value={form.address}
                    onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                    placeholder={t('whatsapp.contactAddress')}
                  />
                  <Textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder={t('whatsapp.contactNotes')}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                      {t('common.cancel')}
                    </Button>
                    <Button size="sm" onClick={handleSave}>
                      {t('common.save') as any}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1 text-sm">
                  {summary.contact.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{summary.contact.phone}</span>
                    </div>
                  )}
                  {summary.contact.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{summary.contact.email}</span>
                    </div>
                  )}
                  {summary.contact.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{summary.contact.address}</span>
                    </div>
                  )}
                  {summary.contact.notes && (
                    <p className="pt-1 text-xs text-muted-foreground">{summary.contact.notes}</p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1"
                    onClick={() => setEditing(true)}
                  >
                    {t('whatsapp.editContact')}
                  </Button>
                </div>
              )}
            </div>

            {/* Counters */}
            <div className="grid grid-cols-2 gap-2">
              <SummaryStat
                icon={<FileText className="h-4 w-4 text-blue-600" />}
                label={t('whatsapp.summaryInvoices')}
                value={String(summary.totals.invoiceCount)}
                helper={money(summary.totals.invoiceOutstanding) + ' ' + t('whatsapp.summaryOutstanding')}
              />
              <SummaryStat
                icon={<Receipt className="h-4 w-4 text-emerald-600" />}
                label={t('whatsapp.summarySalesOrders')}
                value={String(summary.totals.salesOrderCount)}
                helper={money(summary.totals.salesOrderTotal)}
              />
              <SummaryStat
                icon={<ShoppingCart className="h-4 w-4 text-orange-600" />}
                label={t('whatsapp.summaryPurchaseOrders')}
                value={String(summary.totals.purchaseOrderCount)}
              />
              <SummaryStat
                icon={<Package className="h-4 w-4 text-red-600" />}
                label={t('whatsapp.summaryVendorBills')}
                value={String(summary.totals.vendorBillCount)}
                helper={money(summary.totals.vendorBillOutstanding) + ' ' + t('whatsapp.summaryOutstanding')}
              />
              <SummaryStat
                icon={<TrendingUp className="h-4 w-4 text-violet-600" />}
                label={t('whatsapp.summaryOpportunities')}
                value={String(summary.totals.opportunityCount)}
              />
              <SummaryStat
                icon={<Briefcase className="h-4 w-4 text-cyan-600" />}
                label={t('whatsapp.summaryProjects')}
                value={String(summary.totals.projectCount)}
              />
            </div>

            {/* Recent lists */}
            <ListSection
              title={t('whatsapp.summaryInvoices')}
              items={summary.invoices.slice(0, 5).map((inv) => ({
                primary: inv.invoiceNumber,
                secondary: inv.status + ' · ' + money(inv.total || 0),
              }))}
            />
            <ListSection
              title={t('whatsapp.summarySalesOrders')}
              items={summary.salesOrders.slice(0, 5).map((so) => ({
                primary: so.orderNumber,
                secondary: so.status + ' · ' + money(so.totalAmount || 0),
              }))}
            />
            <ListSection
              title={t('whatsapp.summaryProjects')}
              items={summary.projects.slice(0, 5).map((p) => ({
                primary: p.name,
                secondary: p.description || '',
              }))}
            />
            <ListSection
              title={t('whatsapp.summaryVendorBills')}
              items={summary.vendorBills.slice(0, 5).map((b) => ({
                primary: b.billNumber,
                secondary: b.status + ' · ' + money(b.amount || 0),
              }))}
            />
            <ListSection
              title={t('whatsapp.summaryPurchaseOrders')}
              items={summary.purchaseOrders.slice(0, 5).map((po) => ({
                primary: po.orderNumber,
                secondary: po.status + ' · ' + money(po.totalAmount || 0),
              }))}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SummaryStat({
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

function ListSection({
  title,
  items,
}: {
  title: string;
  items: Array<{ primary: string; secondary?: string }>;
}) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="rounded-lg border bg-card">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between border-b px-3 py-2 text-sm last:border-b-0"
          >
            <span className="font-medium">{item.primary}</span>
            <span className="text-xs text-muted-foreground">{item.secondary}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
