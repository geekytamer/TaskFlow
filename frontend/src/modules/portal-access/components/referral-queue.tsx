'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import {
  approveReferralCommission,
  convertReferral,
  declineReferral,
  linkCommissionCreditNote,
  listReferrals,
  setReferralCommission,
  voidReferralCommission,
  type CommissionBasis,
  type CommissionTerms,
  type PayoutType,
  type StaffReferral,
} from '@/services/portalAccessService';

type Tr = (en: string, ar: string) => string;

const money = (amount: number | null | undefined, currency: string, language: string) =>
  amount == null ? '-' : new Intl.NumberFormat(language === 'ar' ? 'ar-u-nu-latn' : 'en', { style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 2 }).format(amount);

/** Commission terms as a small form. Returns null while incomplete. */
function TermsFields({ tr, value, onChange }: { tr: Tr; value: TermsDraft; onChange: (v: TermsDraft) => void }) {
  const id = React.useId();
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <Label htmlFor={`${id}-basis`} className="text-xs">{tr('Basis', 'الأساس')}</Label>
        <Select value={value.basis} onValueChange={(v) => onChange({ ...value, basis: v as CommissionBasis })}>
          <SelectTrigger id={`${id}-basis`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="percent">{tr('% of the deal', '٪ من الصفقة')}</SelectItem>
            <SelectItem value="fixed">{tr('Fixed amount', 'مبلغ ثابت')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor={`${id}-number`} className="text-xs">{value.basis === 'percent' ? tr('Rate (%)', 'النسبة (٪)') : tr('Amount', 'المبلغ')}</Label>
        <Input id={`${id}-number`} type="number" min={0} step="any" inputMode="decimal" value={value.number} onChange={(e) => onChange({ ...value, number: e.target.value })} />
      </div>
      <div>
        <Label htmlFor={`${id}-payout`} className="text-xs">{tr('Paid by', 'تُدفع عبر')}</Label>
        <Select value={value.payoutType} onValueChange={(v) => onChange({ ...value, payoutType: v as PayoutType })}>
          <SelectTrigger id={`${id}-payout`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="credit_note">{tr('Credit note', 'إشعار دائن')}</SelectItem>
            <SelectItem value="vendor_bill">{tr('Vendor bill (cash)', 'فاتورة مورد (نقدًا)')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

interface TermsDraft { basis: CommissionBasis; number: string; payoutType: PayoutType }

const toTerms = (draft: TermsDraft): CommissionTerms | null => {
  const n = Number(draft.number);
  if (!draft.number.trim() || !Number.isFinite(n) || n <= 0) return null;
  if (draft.basis === 'percent' && n > 100) return null;
  return draft.basis === 'percent'
    ? { basis: 'percent', ratePercent: n, payoutType: draft.payoutType }
    : { basis: 'fixed', fixedAmount: n, payoutType: draft.payoutType };
};

const defaultPayout = (r: StaffReferral): PayoutType => (r.referrer.roles.includes('Client') ? 'credit_note' : 'vendor_bill');

/**
 * Referrals sent from the portals. Staff decide each one; nothing reaches the
 * CRM until converted, and commissions never post to the ledger from here.
 */
export function ReferralQueue() {
  const { language } = useI18n();
  const tr: Tr = (en, ar) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const [items, setItems] = React.useState<StaffReferral[] | null>(null);
  const [filter, setFilter] = React.useState<'waiting' | 'all'>('waiting');
  const [openId, setOpenId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!companyId) return;
    try {
      setItems(await listReferrals(companyId));
    } catch (error) {
      setItems([]);
      toast({ title: error instanceof Error ? error.message : tr('Could not load referrals', 'تعذّر تحميل الإحالات'), variant: 'destructive' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  React.useEffect(() => { void load(); }, [load]);

  const replace = (updated: StaffReferral) => setItems((current) => current?.map((r) => (r.id === updated.id ? updated : r)) ?? null);
  const visible = (items ?? []).filter((r) => filter === 'all' || r.status === 'submitted' || (r.commission && ['pending', 'approved'].includes(r.commission.status)));
  const waiting = (items ?? []).filter((r) => r.status === 'submitted').length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tr('Portal referrals', 'إحالات البوابة')}</h1>
          <p className="text-sm text-muted-foreground">
            {tr('Businesses your clients and influencers introduced. Converting creates a lead and an opportunity.', 'أنشطة تجارية عرّفكم بها عملاؤكم ومؤثروكم. التحويل ينشئ عميلًا محتملًا وفرصة.')}
          </p>
        </div>
        <div className="flex gap-1 rounded-md border p-1" role="tablist">
          {(['waiting', 'all'] as const).map((key) => (
            <Button key={key} type="button" size="sm" role="tab" aria-selected={filter === key} variant={filter === key ? 'default' : 'ghost'} onClick={() => setFilter(key)}>
              {key === 'waiting' ? `${tr('Needs action', 'تحتاج إجراء')}${waiting ? ` (${waiting})` : ''}` : tr('All', 'الكل')}
            </Button>
          ))}
        </div>
      </header>

      {items === null ? (
        <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>
      ) : visible.length === 0 ? (
        <p className="rounded-md border p-6 text-sm text-muted-foreground">{tr('Nothing needs your attention.', 'لا شيء يحتاج انتباهك.')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {visible.map((r) => (
            <ReferralRow
              key={r.id}
              referral={r}
              companyId={companyId!}
              tr={tr}
              language={language}
              open={openId === r.id}
              onToggle={() => setOpenId(openId === r.id ? null : r.id)}
              onChange={replace}
              onError={(error, fallback) => toast({ title: error instanceof Error ? error.message : fallback, variant: 'destructive' })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReferralRow({ referral: r, companyId, tr, language, open, onToggle, onChange, onError }: {
  referral: StaffReferral;
  companyId: string;
  tr: Tr;
  language: string;
  open: boolean;
  onToggle: () => void;
  onChange: (r: StaffReferral) => void;
  onError: (error: unknown, fallback: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [revenue, setRevenue] = React.useState(r.estimatedValue != null ? String(r.estimatedValue) : '');
  const [withCommission, setWithCommission] = React.useState(false);
  const [terms, setTerms] = React.useState<TermsDraft>({ basis: 'percent', number: '', payoutType: defaultPayout(r) });
  const [creditNote, setCreditNote] = React.useState('');
  const id = React.useId();

  const act = async (fn: () => Promise<StaffReferral>, fallback: string) => {
    setBusy(true);
    try {
      onChange(await fn());
    } catch (error) {
      onError(error, fallback);
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = { submitted: tr('Waiting for review', 'بانتظار المراجعة'), converted: tr('Converted', 'محوّلة'), declined: tr('Declined', 'مرفوضة') }[r.status];
  const commissionLabel = r.commission && {
    pending: tr('Commission pending', 'عمولة معلّقة'),
    approved: tr('Commission approved', 'عمولة معتمدة'),
    paid: tr('Commission paid', 'عمولة مدفوعة'),
    voided: tr('Commission withdrawn', 'عمولة مسحوبة'),
  }[r.commission.status];
  const parsedTerms = toTerms(terms);
  const revenueNumber = revenue.trim() === '' ? undefined : Number(revenue);
  const revenueValid = revenueNumber === undefined || (Number.isFinite(revenueNumber) && revenueNumber >= 0);

  return (
    <li className="p-4">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center justify-between gap-3 text-start">
        <span className="min-w-0">
          <span dir="auto" className="block truncate font-medium">{r.prospectName}</span>
          <span className="block text-xs text-muted-foreground">
            {tr('From', 'من')} {r.referrer.name ?? '-'}{r.submittedBy ? ` (${r.submittedBy})` : ''} · {new Date(r.createdAt).toLocaleDateString(language === 'ar' ? 'ar-u-nu-latn' : 'en')}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {commissionLabel && <Badge variant="outline">{commissionLabel}</Badge>}
          <Badge variant={r.status === 'submitted' ? 'default' : 'secondary'}>{statusLabel}</Badge>
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <dl className="grid gap-2 text-sm sm:grid-cols-[160px_1fr]">
            <dt className="text-muted-foreground">{tr('What they need', 'ما يحتاجونه')}</dt>
            <dd dir="auto" className="whitespace-pre-line">{r.description}</dd>
            <dt className="text-muted-foreground">{tr('Contact', 'التواصل')}</dt>
            <dd dir="auto">{r.prospectContact}</dd>
            <dt className="text-muted-foreground">{tr('Their estimate', 'تقديرهم')}</dt>
            <dd>{money(r.estimatedValue, r.currency, language)}</dd>
            {r.opportunity && (
              <>
                <dt className="text-muted-foreground">{tr('Opportunity', 'الفرصة')}</dt>
                <dd>
                  <Link href="/crm/opportunities" className="underline underline-offset-4"><bdi>{r.opportunity.title}</bdi></Link>
                  <span className="ms-2 text-muted-foreground">{r.opportunity.stage} · {money(r.opportunity.expectedRevenue, r.currency, language)}</span>
                </dd>
              </>
            )}
            {r.staffNote && (
              <>
                <dt className="text-muted-foreground">{tr('Internal note', 'ملاحظة داخلية')}</dt>
                <dd dir="auto" className="whitespace-pre-line">{r.staffNote}</dd>
              </>
            )}
          </dl>

          {r.status === 'submitted' && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`${id}-revenue`} className="text-xs">{tr('Deal value for the opportunity', 'قيمة الصفقة للفرصة')}</Label>
                  <Input id={`${id}-revenue`} type="number" min={0} step="any" inputMode="decimal" value={revenue} onChange={(e) => setRevenue(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor={`${id}-note`} className="text-xs">{tr('Internal note (never shown to them)', 'ملاحظة داخلية (لا تظهر لهم)')}</Label>
                  <Textarea id={`${id}-note`} dir="auto" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={withCommission} onChange={(e) => setWithCommission(e.target.checked)} />
                {tr('Offer a commission', 'تقديم عمولة')}
              </label>
              {withCommission && <TermsFields tr={tr} value={terms} onChange={setTerms} />}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => act(() => declineReferral(companyId, r.id, note), tr('Could not decline', 'تعذّر الرفض'))}>
                  {tr('Decline', 'رفض')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !revenueValid || (withCommission && !parsedTerms)}
                  onClick={() => act(() => convertReferral(companyId, r.id, {
                    expectedRevenue: revenueNumber,
                    staffNote: note || undefined,
                    commission: withCommission && parsedTerms ? parsedTerms : undefined,
                  }), tr('Could not convert', 'تعذّر التحويل'))}
                >
                  {tr('Convert to opportunity', 'تحويل إلى فرصة')}
                </Button>
              </div>
            </div>
          )}

          {r.status === 'converted' && (!r.commission || ['pending', 'voided'].includes(r.commission.status)) && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">
                {r.commission?.status === 'pending'
                  ? `${tr('Commission', 'العمولة')}: ${r.commission.basis === 'percent' ? `${r.commission.ratePercent}%` : money(r.commission.fixedAmount, r.currency, language)} · ${r.commission.payoutType === 'credit_note' ? tr('credit note', 'إشعار دائن') : tr('vendor bill', 'فاتورة مورد')}`
                  : tr('No commission set', 'لا عمولة محددة')}
              </p>
              <TermsFields tr={tr} value={terms} onChange={setTerms} />
              <div className="flex flex-wrap justify-end gap-2">
                {r.commission?.status === 'pending' && (
                  <>
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => act(() => voidReferralCommission(companyId, r.id), tr('Could not withdraw', 'تعذّر السحب'))}>
                      {tr('Withdraw', 'سحب')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy || r.opportunity?.stage !== 'Won'}
                      title={r.opportunity?.stage !== 'Won' ? tr('Approve once the deal is won', 'اعتمد بعد الفوز بالصفقة') : undefined}
                      onClick={() => act(() => approveReferralCommission(companyId, r.id), tr('Could not approve', 'تعذّر الاعتماد'))}
                    >
                      {tr('Approve commission', 'اعتماد العمولة')}
                    </Button>
                  </>
                )}
                <Button type="button" size="sm" disabled={busy || !parsedTerms} onClick={() => parsedTerms && act(() => setReferralCommission(companyId, r.id, parsedTerms), tr('Could not save', 'تعذّر الحفظ'))}>
                  {r.commission?.status === 'pending' ? tr('Change terms', 'تغيير الشروط') : tr('Set commission', 'تحديد العمولة')}
                </Button>
              </div>
            </div>
          )}

          {r.commission && r.commission.status === 'approved' && (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p className="font-medium">{tr('Approved', 'معتمدة')}: {money(r.commission.amount, r.currency, language)}</p>
              {r.commission.payoutType === 'vendor_bill' ? (
                <p className="text-muted-foreground">{tr('A draft vendor bill was created for finance to approve and pay. It shows as paid here once the bill is paid.', 'أُنشئت فاتورة مورد مسودة ليعتمدها قسم المالية ويدفعها. تظهر مدفوعة هنا عند دفع الفاتورة.')}</p>
              ) : (
                <>
                  <p className="text-muted-foreground">{tr('Ask an accountant to issue a credit note to this client for exactly this amount, then enter its number here.', 'اطلب من المحاسب إصدار إشعار دائن لهذا العميل بهذا المبلغ تمامًا، ثم أدخل رقمه هنا.')}</p>
                  <div className="flex flex-wrap gap-2">
                    <Input dir="ltr" className="max-w-xs" aria-label={tr('Credit note number', 'رقم الإشعار الدائن')} placeholder={tr('Credit note number', 'رقم الإشعار الدائن')} value={creditNote} onChange={(e) => setCreditNote(e.target.value)} />
                    <Button type="button" size="sm" disabled={busy || !creditNote.trim()} onClick={() => act(() => linkCommissionCreditNote(companyId, r.id, creditNote), tr('Could not link', 'تعذّر الربط'))}>
                      {tr('Link credit note', 'ربط الإشعار الدائن')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
