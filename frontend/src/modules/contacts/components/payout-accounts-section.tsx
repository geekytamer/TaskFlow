'use client';

import * as React from 'react';
import { Check, Copy, Landmark, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HiddenValue } from '@/components/hidden-value';
import { useI18n } from '@/context/i18n-context';
import { usePermissions } from '@/context/permissions-context';
import { useToast } from '@/hooks/use-toast';
import {
  payoutMethods,
  setPayoutAccounts,
  type Contact,
  type PayoutAccount,
  type PayoutMethod,
} from '@/services/contactService';

const METHOD_LABELS: Record<PayoutMethod, [string, string]> = {
  'Bank transfer': ['Bank transfer', 'تحويل بنكي'],
  Cash: ['Cash', 'نقداً'],
  Wallet: ['Wallet', 'محفظة إلكترونية'],
  Other: ['Other', 'أخرى'],
};

type Draft = Partial<PayoutAccount> & { key: string };

const newKey = () => `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const toDraft = (a: PayoutAccount): Draft => ({ ...a, key: a.id });

/** "OM810180000001299123456" → "OM81 0180 0000 0129 9123 456": easier to read out and check. */
const grouped = (value: string) => value.replace(/(.{4})/g, '$1 ').trim();

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the value stays selectable */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label={label}
      title={label}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/**
 * Where we pay this contact: bank accounts, wallets, cash. Shown to those whose
 * role holds the payout_details field; edited by management with that field.
 */
export function PayoutAccountsSection({
  contact,
  onChanged,
}: {
  contact: Contact;
  onChanged: (updated: Contact) => void;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const { can, field } = usePermissions();
  const access = field('payout_details');
  const canEdit = access.edit && can('contacts.manage');
  const accounts = contact.payoutAccounts ?? [];

  const [open, setOpen] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Draft[]>([]);
  const [saving, setSaving] = React.useState(false);

  const startEdit = () => {
    setDrafts(accounts.length ? accounts.map(toDraft) : [{ key: newKey(), method: 'Bank transfer', isDefault: true }]);
    setOpen(true);
  };
  const patch = (key: string, change: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...change } : d)));
  const makeDefault = (key: string) => setDrafts((prev) => prev.map((d) => ({ ...d, isDefault: d.key === key })));
  const remove = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key));
  const add = () => setDrafts((prev) => [...prev, { key: newKey(), method: 'Bank transfer', isDefault: prev.length === 0 }]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = drafts.map(({ key, ...rest }) => ({ ...rest, id: key.startsWith('new-') ? undefined : key }));
      const updated = await setPayoutAccounts(contact.id, payload);
      onChanged(updated);
      setOpen(false);
      toast({ title: tr('Payment details saved', 'تم حفظ بيانات الدفع') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not save', 'تعذّر الحفظ'), description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const methodLabel = (m: PayoutMethod) => tr(...METHOD_LABELS[m]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Landmark className="h-4 w-4" />
          {tr('Payment details', 'بيانات الدفع')}
        </CardTitle>
        {canEdit && access.view && (
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={startEdit}>
            {accounts.length ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {accounts.length ? tr('Edit', 'تعديل') : tr('Add', 'إضافة')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!access.view ? (
          <HiddenValue />
        ) : accounts.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            {tr(
              'No payment details yet. Add the bank account once and it is here for every payment.',
              'لا توجد بيانات دفع بعد. أضف الحساب البنكي مرة واحدة ليكون جاهزاً عند كل دفعة.',
            )}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {accounts.map((a) => (
              <div key={a.id} className="space-y-1.5 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{methodLabel(a.method)}</span>
                  {a.isDefault && accounts.length > 1 && (
                    <Badge variant="outline" className="gap-1 text-[11px]">
                      <Star className="h-3 w-3" />
                      {tr('Default', 'الافتراضي')}
                    </Badge>
                  )}
                  {a.currency && <Badge variant="secondary" className="text-[11px]">{a.currency}</Badge>}
                </div>
                {a.accountHolder && <Line label={tr('Account holder', 'اسم صاحب الحساب')} value={a.accountHolder} />}
                {a.bankName && <Line label={tr('Bank', 'البنك')} value={a.bankName} />}
                {a.iban && <Line label="IBAN" value={grouped(a.iban)} copy={a.iban} mono copyLabel={tr('Copy IBAN', 'نسخ الآيبان')} />}
                {a.accountNumber && (
                  <Line label={tr('Account number', 'رقم الحساب')} value={a.accountNumber} copy={a.accountNumber} mono copyLabel={tr('Copy account number', 'نسخ رقم الحساب')} />
                )}
                {a.swift && <Line label="SWIFT" value={a.swift} mono />}
                {a.walletNumber && (
                  <Line label={tr('Wallet number', 'رقم المحفظة')} value={a.walletNumber} copy={a.walletNumber} mono copyLabel={tr('Copy wallet number', 'نسخ رقم المحفظة')} />
                )}
                {a.notes && <p className="whitespace-pre-wrap pt-1 text-xs text-muted-foreground">{a.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr('Payment details', 'بيانات الدفع')} · {contact.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {drafts.map((d, index) => (
              <div key={d.key} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {tr('Account', 'حساب')} {index + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={d.isDefault ? 'secondary' : 'ghost'}
                      className="h-7 gap-1 text-xs"
                      onClick={() => makeDefault(d.key)}
                      disabled={drafts.length < 2}
                    >
                      <Star className="h-3 w-3" />
                      {tr('Default', 'الافتراضي')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => remove(d.key)}
                    >
                      <Trash2 className="h-3 w-3" />
                      {tr('Remove', 'حذف')}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={tr('Method', 'طريقة الدفع')}>
                    <Select value={d.method ?? 'Bank transfer'} onValueChange={(v) => patch(d.key, { method: v as PayoutMethod })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {payoutMethods.map((m) => <SelectItem key={m} value={m}>{methodLabel(m)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={tr('Account holder', 'اسم صاحب الحساب')}>
                    <Input className="h-9" value={d.accountHolder ?? ''} onChange={(e) => patch(d.key, { accountHolder: e.target.value })} />
                  </Field>
                  {(d.method ?? 'Bank transfer') === 'Bank transfer' && (
                    <>
                      <Field label={tr('Bank', 'البنك')}>
                        <Input className="h-9" value={d.bankName ?? ''} placeholder={tr('Bank Muscat', 'بنك مسقط')} onChange={(e) => patch(d.key, { bankName: e.target.value })} />
                      </Field>
                      <Field label="IBAN">
                        <Input dir="ltr" className="h-9 font-mono" value={d.iban ?? ''} placeholder="OM81 0180 0000 0129 9123 456" onChange={(e) => patch(d.key, { iban: e.target.value })} />
                      </Field>
                      <Field label={tr('Account number', 'رقم الحساب')}>
                        <Input dir="ltr" className="h-9 font-mono" value={d.accountNumber ?? ''} onChange={(e) => patch(d.key, { accountNumber: e.target.value })} />
                      </Field>
                      <Field label="SWIFT">
                        <Input dir="ltr" className="h-9 font-mono" value={d.swift ?? ''} placeholder="BMUSOMRX" onChange={(e) => patch(d.key, { swift: e.target.value })} />
                      </Field>
                    </>
                  )}
                  {d.method === 'Wallet' && (
                    <Field label={tr('Wallet number', 'رقم المحفظة')}>
                      <Input dir="ltr" className="h-9 font-mono" value={d.walletNumber ?? ''} onChange={(e) => patch(d.key, { walletNumber: e.target.value })} />
                    </Field>
                  )}
                  <Field label={tr('Currency', 'العملة')}>
                    <Input dir="ltr" className="h-9 uppercase" maxLength={3} value={d.currency ?? ''} placeholder="OMR" onChange={(e) => patch(d.key, { currency: e.target.value })} />
                  </Field>
                </div>
                <Field label={tr('Notes', 'ملاحظات')}>
                  <Input className="h-9" value={d.notes ?? ''} onChange={(e) => patch(d.key, { notes: e.target.value })} />
                </Field>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={add} disabled={drafts.length >= 5}>
              <Plus className="h-3.5 w-3.5" />
              {tr('Add another account', 'إضافة حساب آخر')}
            </Button>
            <p className="text-xs text-muted-foreground">
              {tr(
                'Every change is recorded in the activity log with who made it.',
                'كل تعديل يُسجَّل في سجل النشاط مع اسم من قام به.',
              )}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button onClick={save} disabled={saving}>{tr('Save', 'حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Line({ label, value, copy, mono, copyLabel }: { label: string; value: string; copy?: string; mono?: boolean; copyLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-1">
        <span dir={mono ? 'ltr' : undefined} className={`truncate ${mono ? 'font-mono text-[13px]' : ''}`}>{value}</span>
        {copy && <CopyValue value={copy} label={copyLabel ?? label} />}
      </span>
    </div>
  );
}
