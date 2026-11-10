'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { nicheOptions, splitNiches } from '@/lib/niches';
import { useCompany } from '@/context/company-context';
import { InfluencerAvatar, useInfluencerPhotos } from './influencer-avatar';
import { usePermissions } from '@/context/permissions-context';
import { HiddenValue } from '@/components/hidden-value';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { DiscoverLink } from '@/modules/discover/components/discover-link';
import { CsvImportExport } from '@/components/ui/csv-import-export';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CustomFieldsForm } from '@/components/ui/custom-fields-form';
import { getCustomFieldDefinitions, type CustomFieldDefinition } from '@/services/customFieldService';
import {
  getContacts,
  getContact,
  createContact,
  duplicateHandleOf,
  influencerPlatforms,
  type Contact,
  type InfluencerPlatform,
} from '@/services/contactService';
import {
  ContactFormFields,
  emptyContactForm,
  buildContactPayload,
  type ContactForm,
} from '@/modules/contacts/components/contact-form-fields';
import { quickLinks } from '@/modules/contacts/lib/contact-finance';
import { InfluencerEditSheet } from './influencer-edit-sheet';
import { QuickAddPanel } from './quick-add-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  EMPTY_FILTERS,
  SIZE_TIERS,
  accountLinks,
  activeFilterCount,
  cleanHandle,
  displayName,
  engagementOf,
  filtersFromQuery,
  filtersToQuery,
  isMissing,
  languageOptions,
  matchesFilters,
  placeOptions,
  rosterEngagement,
  sizeTierOf,
  sortInfluencers,
  totalFollowers,
  type InfluencerFilters,
  type MissingKind,
  type SizeTier,
} from '../lib/influencer-list';
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileSpreadsheet,
  Link2,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';

const AVAILABILITY = ['Available', 'Partially Available', 'Unavailable'] as const;
const ALL = '__all__';

const compactNumber = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const plainNumber = (n: number) => new Intl.NumberFormat('en').format(n);

const PLATFORM_COLORS: Record<string, string> = {
  Instagram: 'bg-pink-100 dark:bg-pink-500/15 text-pink-800 dark:text-pink-300',
  TikTok: 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900',
  Snapchat: 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-800 dark:text-yellow-300',
  Facebook: 'bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300',
  YouTube: 'bg-red-100 dark:bg-red-500/15 text-red-800 dark:text-red-300',
  X: 'bg-muted text-foreground',
  Other: 'bg-muted text-muted-foreground',
};

const AVAILABILITY_COLORS: Record<string, string> = {
  Available: 'bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300',
  'Partially Available': 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300',
  Unavailable: 'bg-red-100 dark:bg-red-500/15 text-red-800 dark:text-red-300',
};

type Tr = (en: string, ar: string) => string;

const availabilityLabel = (tr: Tr, a: string) =>
  a === 'Available' ? tr('Available', 'متاح') : a === 'Partially Available' ? tr('Partly available', 'متاح جزئياً') : a === 'Unavailable' ? tr('Unavailable', 'غير متاح') : a;

const sizeLabel = (tr: Tr, s: SizeTier) => ({
  nano: tr('Nano (under 10K)', 'نانو (أقل من 10 آلاف)'),
  micro: tr('Micro (10K–100K)', 'مايكرو (10–100 ألف)'),
  macro: tr('Macro (100K–1M)', 'ماكرو (100 ألف – مليون)'),
  mega: tr('Mega (1M+)', 'ميغا (أكثر من مليون)'),
}[s]);

const sizeShort = (tr: Tr, s: SizeTier) => ({ nano: tr('Nano', 'نانو'), micro: tr('Micro', 'مايكرو'), macro: tr('Macro', 'ماكرو'), mega: tr('Mega', 'ميغا') }[s]);

const missingLabel = (tr: Tr, m: MissingKind) => ({
  phone: tr('No phone', 'بدون هاتف'),
  rate: tr('No price', 'بدون سعر'),
  payout: tr('No payment details', 'بدون بيانات دفع'),
  account: tr('No account link', 'بدون رابط حساب'),
}[m]);

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
      </div>
    </div>
  );
}

function InfluencerCard({
  c,
  money,
  onEdit,
  showPricing,
  showPayout,
  photoAt,
}: {
  c: Contact;
  /** The person may see payment details: then none on file is worth saying. */
  showPayout: boolean;
  photoAt?: string | null;
  money: (value: number) => string;
  /** Absent when the person may not save an influencer: no Edit button. */
  onEdit?: () => void;
  /** Rate cards are negotiated pricing: the API withholds them without the field. */
  showPricing: boolean;
}) {
  const { t, language } = useI18n();
  const tr: Tr = (en, ar) => (language === 'ar' ? ar : en);
  const followers = totalFollowers(c);
  const engagement = engagementOf(c);
  const tier = sizeTierOf(followers);
  const accounts = accountLinks(c);
  const links = quickLinks(c);
  const name = displayName(c.name);
  const gaps = (['phone', 'rate', 'payout'] as MissingKind[]).filter((m) => (m !== 'rate' || showPricing) && (m !== 'payout' || showPayout) && isMissing(c, m));

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <InfluencerAvatar contactId={c.id} name={name} photoAt={photoAt} />
          <div className="min-w-0">
            {/* The name opens the full profile; editing stays on its own control. */}
            <Link href={`/contacts/${c.id}`} className="block truncate text-start font-semibold hover:underline" dir="auto">
              {name}
            </Link>
            {splitNiches(c.influencerNiche).length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {splitNiches(c.influencerNiche).slice(0, 3).map((n) => (
                  <Badge key={n} variant="secondary" className="max-w-full truncate px-1.5 py-0 text-[11px] font-normal">{n}</Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {c.availabilityStatus ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${AVAILABILITY_COLORS[c.availabilityStatus] ?? 'bg-muted text-muted-foreground'}`}>
            {availabilityLabel(tr, c.availabilityStatus)}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-muted/50 px-2 py-1.5">
          <p className="text-sm font-semibold">{followers ? compactNumber(followers) : '—'}</p>
          <p className="text-[11px] text-muted-foreground">{t('crm.followerCount')}{tier ? ` · ${sizeShort(tr, tier)}` : ''}</p>
        </div>
        <div className="rounded-md bg-muted/50 px-2 py-1.5">
          <p className="text-sm font-semibold">{engagement != null ? `${engagement}%` : '—'}</p>
          <p className="text-[11px] text-muted-foreground">{t('crm.engagementRate')}</p>
        </div>
        <div className="min-w-0 rounded-md bg-muted/50 px-2 py-1.5">
          <p className="break-words text-xs font-semibold leading-5" title={c.rateCardAmount != null ? money(c.rateCardAmount) : undefined}>
            {!showPricing && c.rateCardAmount == null
              ? <HiddenValue className="text-xs font-normal" />
              : c.rateCardAmount != null ? money(c.rateCardAmount) : '—'}
          </p>
          <p className="text-[11px] text-muted-foreground">{t('crm.rateCard')}</p>
        </div>
      </div>

      {(c.location || (c.languages && c.languages.length)) ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {c.location ? (
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{c.location.replace(/_/g, '، ')}</span>
          ) : null}
          {c.languages?.length ? <span>{c.languages.join('، ')}</span> : null}
        </div>
      ) : null}

      {/* Each account opens on its platform. */}
      {accounts.length ? (
        <div className="flex flex-col gap-1.5">
          {accounts.map((acc) => {
            const row = (
              <>
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${PLATFORM_COLORS[acc.platform] ?? PLATFORM_COLORS.Other}`}>{acc.platform}</span>
                  {acc.handle ? <span className="truncate text-muted-foreground" dir="ltr">@{acc.handle}</span> : null}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {typeof acc.followers === 'number' && acc.followers > 0 ? <span className="font-medium text-foreground">{compactNumber(acc.followers)}</span> : null}
                  {acc.url ? (
                    <span className="inline-flex items-center gap-1 font-medium text-primary">
                      {tr('Open', 'فتح')}<ExternalLink className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                </span>
              </>
            );
            return acc.url ? (
              <a key={acc.key} href={acc.url} target="_blank" rel="noreferrer"
                className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
                title={tr(`Open on ${acc.platform}`, `فتح الحساب على ${acc.platform}`)}>
                {row}
              </a>
            ) : (
              <div key={acc.key} className="flex items-center justify-between gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-sm">{row}</div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-md border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground">{tr('No accounts yet', 'لا توجد حسابات بعد')}</p>
      )}

      {gaps.length > 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">{tr('Missing', 'ناقص')}: {gaps.map((g) => missingLabel(tr, g)).join('، ')}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-1 pt-1">
        <div className="flex items-center gap-1">
          {links.whatsapp && (
            <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
              <a href={links.whatsapp} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5 text-emerald-600" />{tr('WhatsApp', 'واتساب')}</a>
            </Button>
          )}
          {links.call && (
            <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
              <a href={links.call}><Phone className="h-3.5 w-3.5" />{tr('Call', 'اتصال')}</a>
            </Button>
          )}
        </div>
        {onEdit && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onEdit}>
            <Pencil className="h-3 w-3" />{t('influencers.edit')}
          </Button>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
  width = 'w-full sm:w-[160px]',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  allLabel: string;
  width?: string;
}) {
  return (
    <div className={width}>
      <Label className="text-xs">{label}</Label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
        <SelectTrigger className={`h-9 ${value ? 'border-primary/60' : ''}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function InfluencersPage() {
  const { selectedCompany } = useCompany();
  const photos = useInfluencerPhotos(selectedCompany?.id);
  const { can, field } = usePermissions();
  const showPricing = field('rate_cards').view;
  const editPricing = field('rate_cards').edit;
  const showPayout = field('payout_details').view;
  const { t, language } = useI18n();
  const tr: Tr = (en, ar) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const { money } = useCompanyCurrency();

  const [influencers, setInfluencers] = React.useState<Contact[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<Contact | null>(null);
  const [openCreate, setOpenCreate] = React.useState(false);
  const [form, setForm] = React.useState<ContactForm>(emptyContactForm({ kind: 'Person' }));
  const [account, setAccount] = React.useState({ platform: 'Instagram', handle: '', followers: '', rate: '', availability: 'Available' });
  const [customFieldDefs, setCustomFieldDefs] = React.useState<CustomFieldDefinition[]>([]);
  const [createCustomValues, setCreateCustomValues] = React.useState<Record<string, unknown>>({});
  const [saving, setSaving] = React.useState(false);
  const [existing, setExisting] = React.useState<{ id: string; name: string } | null>(null);

  // Filters live in the address: kept on refresh and when the link is shared.
  const [filters, setFilters] = React.useState<InfluencerFilters>(EMPTY_FILTERS);
  const [moreOpen, setMoreOpen] = React.useState(false);
  // On a phone the filters fold away behind one button, so the influencers come first.
  const [phoneFilters, setPhoneFilters] = React.useState(false);
  React.useEffect(() => {
    const fromUrl = filtersFromQuery(window.location.search);
    setFilters(fromUrl);
    if (fromUrl.minEngagement || fromUrl.minRate || fromUrl.maxRate || fromUrl.missing) setMoreOpen(true);
  }, []);
  const setFilter = <K extends keyof InfluencerFilters>(key: K, value: InfluencerFilters[K]) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      const query = filtersToQuery(next);
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
      return next;
    });
  };
  const resetFilters = () => {
    setFilters({ ...EMPTY_FILTERS, sort: filters.sort });
    const query = filtersToQuery({ ...EMPTY_FILTERS, sort: filters.sort });
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  };

  const loadInfluencers = React.useCallback(async () => {
    if (!selectedCompany) {
      setInfluencers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setInfluencers(await getContacts(selectedCompany.id, 'Influencer'));
    } catch {
      toast({ title: t('influencers.loadError'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, t, toast]);

  React.useEffect(() => { void loadInfluencers(); }, [loadInfluencers]);

  React.useEffect(() => {
    if (!selectedCompany) { setCustomFieldDefs([]); return; }
    let cancelled = false;
    getCustomFieldDefinitions(selectedCompany.id, 'contact')
      .then((defs) => { if (!cancelled) setCustomFieldDefs(defs); })
      .catch(() => { if (!cancelled) setCustomFieldDefs([]); });
    return () => { cancelled = true; };
  }, [selectedCompany]);

  const resetCreate = () => {
    setForm(emptyContactForm({ kind: 'Person' }));
    setAccount({ platform: 'Instagram', handle: '', followers: '', rate: '', availability: 'Available' });
    setCreateCustomValues({});
    setExisting(null);
  };

  const handleCreate = async () => {
    if (!selectedCompany || !form.name.trim()) return;
    setSaving(true);
    setExisting(null);
    try {
      const handle = cleanHandle(account.handle);
      const followers = account.followers ? Number(account.followers) : undefined;
      // The account and figures go in the same step; the server cleans the handle and builds the link.
      await createContact({
        companyId: selectedCompany.id,
        ...buildContactPayload(form, { customFields: createCustomValues, lockedRole: 'Influencer' }),
        ...(handle ? {
          influencerPlatform: account.platform,
          influencerHandle: handle,
          influencerAccounts: [{ id: '', platform: account.platform as InfluencerPlatform, handle: account.handle.trim(), followers }],
        } : {}),
        ...(followers && !handle ? { followerCount: followers } : {}),
        ...(editPricing && account.rate ? { rateCardAmount: Number(account.rate) } : {}),
        availabilityStatus: account.availability || undefined,
      });
      setOpenCreate(false);
      resetCreate();
      await loadInfluencers();
      toast({ title: t('contacts.created') });
    } catch (error: any) {
      const owner = duplicateHandleOf(error);
      if (owner) setExisting(owner);
      else toast({ title: tr('Could not add', 'تعذّرت الإضافة'), description: error?.status === 403 ? tr('Your role cannot add influencers.', 'دورك لا يسمح بإضافة مؤثرين.') : undefined, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  /** A record from the quick-add results or a duplicate: open its edit window. */
  const openById = async (id: string) => {
    try {
      const found = influencers.find((c) => c.id === id) ?? (await getContact(id));
      setOpenCreate(false);
      resetCreate();
      setEditing(found);
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  const niches = React.useMemo(() => nicheOptions(influencers.map((c) => c.influencerNiche)), [influencers]);
  const places = React.useMemo(() => placeOptions(influencers), [influencers]);
  const languages = React.useMemo(() => languageOptions(influencers), [influencers]);

  const filtered = React.useMemo(
    () => sortInfluencers(influencers.filter((c) => matchesFilters(c, filters, { pricing: showPricing })), filters.sort),
    [influencers, filters, showPricing],
  );
  const activeCount = activeFilterCount(filters);

  // Stats summarise exactly what is shown.
  const stats = React.useMemo(() => ({
    reach: filtered.reduce((sum, c) => sum + totalFollowers(c), 0),
    engagement: rosterEngagement(filtered),
    available: filtered.filter((c) => c.availabilityStatus === 'Available').length,
  }), [filtered]);

  return (
    <SectionPageShell
      title={t('influencers.title')}
      description={t('influencers.subtitle')}
      actions={
        selectedCompany ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setOpenCreate(true)}>
              <Plus className="h-4 w-4 me-1" />{tr('Add influencers', 'إضافة مؤثرين')}
            </Button>
            <DiscoverLink />
            <CsvImportExport
              exportPath={`/companies/${selectedCompany.id}/influencers/export`}
              exportFilename="influencers.csv"
              importPath={can('influencers.create') ? `/companies/${selectedCompany.id}/influencers/import` : undefined}
              onImported={loadInfluencers}
              labels={{ template: tr('Template', 'القالب'), export: tr('Export', 'تصدير'), import: tr('Import', 'استيراد') }}
              template={{
                filename: 'influencers-template.csv',
                // The same columns the export writes; a row updates the influencer with the same handle or email.
                columns: [
                  'name', 'email', 'phone',
                  'instagram', 'instagramFollowers', 'tiktok', 'tiktokFollowers', 'snapchat', 'snapchatFollowers',
                  'youtube', 'youtubeFollowers', 'x', 'xFollowers', 'facebook', 'facebookFollowers',
                  'niche', 'engagementRate', ...(showPricing ? ['rateCard'] : []), 'location', 'languages', 'availability',
                ],
                sample: {
                  name: 'Jane Doe', email: 'jane@example.com', phone: '+96891234567',
                  instagram: 'https://www.instagram.com/janedoe/', instagramFollowers: '52000',
                  tiktok: '@janedoe', tiktokFollowers: '18000', niche: 'Beauty',
                  engagementRate: '3.4', rateCard: '150',
                  location: 'Muscat', languages: 'Arabic; English', availability: 'Available',
                },
              }}
            />
          </div>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label={t('influencers.totalInfluencers')} value={plainNumber(filtered.length)} />
        <StatCard icon={Sparkles} label={t('influencers.combinedReach')} value={compactNumber(stats.reach)} />
        <StatCard icon={TrendingUp} label={tr('Engagement', 'التفاعل')} value={stats.engagement != null ? `${stats.engagement}%` : '—'} />
        <StatCard icon={CheckCircle2} label={t('influencers.available')} value={plainNumber(stats.available)} />
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-lg border bg-card p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label className="text-xs">{t('common.search')}</Label>
            <div className="relative">
              <Search className="absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 ps-8"
                placeholder={tr('Name, @account, niche, city or phone…', 'الاسم، @الحساب، المجال، المدينة أو الهاتف…')}
                value={filters.q}
                onChange={(e) => setFilter('q', e.target.value)}
              />
            </div>
          </div>
          <div className="w-full sm:w-[170px]">
            <Label className="text-xs">{t('influencers.sortBy')}</Label>
            <Select value={filters.sort} onValueChange={(v) => setFilter('sort', v as InfluencerFilters['sort'])}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="followers">{tr('Most followers', 'الأكثر متابعين')}</SelectItem>
                <SelectItem value="engagement">{tr('Highest engagement', 'الأعلى تفاعلاً')}</SelectItem>
                {showPricing && <SelectItem value="rate">{tr('Highest price', 'الأعلى سعراً')}</SelectItem>}
                <SelectItem value="name">{t('influencers.sortName')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button type="button" variant="outline" size="sm" className="h-9 w-full gap-1 sm:hidden" onClick={() => setPhoneFilters((o) => !o)}>
          <SlidersHorizontal className="h-4 w-4" />
          {tr('Filters', 'الفلاتر')}{activeCount ? ` (${activeCount})` : ''}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${phoneFilters ? 'rotate-180' : ''}`} />
        </Button>
        <div className={`${phoneFilters ? 'flex' : 'hidden'} flex-wrap items-end gap-3 sm:flex`}>
          <FilterSelect label={t('crm.platform')} value={filters.platform} onChange={(v) => setFilter('platform', v)} allLabel={t('influencers.allPlatforms')}
            options={influencerPlatforms.map((p) => ({ value: p, label: p }))} />
          <FilterSelect label={t('crm.niche')} value={filters.niche} onChange={(v) => setFilter('niche', v)} allLabel={t('influencers.allNiches')}
            options={niches.map((n) => ({ value: n, label: n }))} />
          <FilterSelect label={tr('City', 'المدينة')} value={filters.place} onChange={(v) => setFilter('place', v)} allLabel={tr('All cities', 'كل المدن')}
            options={places.map((p) => ({ value: p, label: p }))} />
          <FilterSelect label={tr('Size', 'الحجم')} value={filters.size} onChange={(v) => setFilter('size', v as InfluencerFilters['size'])} allLabel={tr('All sizes', 'كل الأحجام')}
            options={SIZE_TIERS.map((s) => ({ value: s, label: sizeLabel(tr, s) }))} width="w-full sm:w-[190px]" />
          <FilterSelect label={tr('Language', 'اللغة')} value={filters.language} onChange={(v) => setFilter('language', v)} allLabel={tr('All languages', 'كل اللغات')}
            options={languages.map((l) => ({ value: l, label: l }))} />
          <FilterSelect label={t('crm.availability')} value={filters.availability} onChange={(v) => setFilter('availability', v)} allLabel={t('influencers.allAvailability')}
            options={AVAILABILITY.map((a) => ({ value: a, label: availabilityLabel(tr, a) }))} />
          <Button type="button" variant="ghost" size="sm" className="h-9 gap-1" onClick={() => setMoreOpen((o) => !o)}>
            <SlidersHorizontal className="h-4 w-4" />{tr('More filters', 'فلاتر أكثر')}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
          </Button>
          {activeCount > 0 && (
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={resetFilters}>
              <RotateCcw className="h-3.5 w-3.5" />{tr(`Clear filters (${activeCount})`, `مسح الفلاتر (${activeCount})`)}
            </Button>
          )}
        </div>

        {moreOpen && (
          <div className={`${phoneFilters ? 'flex' : 'hidden'} flex-wrap items-end gap-3 border-t pt-3 sm:flex`}>
            <div className="w-full sm:w-[160px]">
              <Label className="text-xs">{tr('Engagement at least (%)', 'تفاعل لا يقل عن (%)')}</Label>
              <Input type="number" min={0} step="0.1" className="h-9" placeholder="0" value={filters.minEngagement} onChange={(e) => setFilter('minEngagement', e.target.value)} />
            </div>
            {showPricing && (
              <>
                <div className="w-[48%] sm:w-[130px]">
                  <Label className="text-xs">{tr('Price from', 'السعر من')}</Label>
                  <Input type="number" min={0} className="h-9" value={filters.minRate} onChange={(e) => setFilter('minRate', e.target.value)} />
                </div>
                <div className="w-[48%] sm:w-[130px]">
                  <Label className="text-xs">{tr('Price to', 'السعر إلى')}</Label>
                  <Input type="number" min={0} className="h-9" value={filters.maxRate} onChange={(e) => setFilter('maxRate', e.target.value)} />
                </div>
              </>
            )}
            <FilterSelect label={tr('Missing data', 'بيانات ناقصة')} value={filters.missing} onChange={(v) => setFilter('missing', v as InfluencerFilters['missing'])} allLabel={tr('Any', 'الكل')}
              options={(['phone', ...(showPricing ? ['rate'] : []), ...(showPayout ? ['payout'] : []), 'account'] as MissingKind[]).map((m) => ({ value: m, label: missingLabel(tr, m) }))} width="w-full sm:w-[190px]" />
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="space-y-3">
          <SectionEmptyState
            title={t('influencers.emptyTitle')}
            description={influencers.length === 0 ? t('influencers.emptyAll') : t('influencers.emptyFiltered')}
          />
          {influencers.length > 0 && activeCount > 0 && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" className="gap-1" onClick={resetFilters}><RotateCcw className="h-3.5 w-3.5" />{tr('Clear filters', 'مسح الفلاتر')}</Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {tr(`Showing ${filtered.length} of ${influencers.length}`, `يُعرض ${filtered.length} من ${influencers.length}`)}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((c) => (
              <InfluencerCard key={c.id} c={c} money={money} onEdit={can('contacts.manage') ? () => setEditing(c) : undefined} showPricing={showPricing} showPayout={showPayout} photoAt={photos?.[c.id] ?? null} />
            ))}
          </div>
        </>
      )}

      <Dialog open={openCreate} onOpenChange={(v) => { if (!v) resetCreate(); setOpenCreate(v); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr('Add influencers', 'إضافة مؤثرين')}</DialogTitle>
          </DialogHeader>
          {/* min-w-0: the dialog is a grid, and its track would otherwise widen to the longest pasted line on a phone. */}
          <Tabs defaultValue="paste" className="min-w-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="paste" className="gap-1"><Link2 className="h-3.5 w-3.5" />{tr('Paste links (fastest)', 'الصق الروابط (الأسرع)')}</TabsTrigger>
              <TabsTrigger value="details">{tr('One by one', 'واحد بالتفصيل')}</TabsTrigger>
            </TabsList>
            <TabsContent value="paste" className="space-y-3 pt-2">
              <p className="rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
                {tr(
                  'Paste Instagram or TikTok links, or @accounts, one influencer per line. Each becomes a record, and the name and followers arrive from Instagram on their own.',
                  'الصق روابط إنستغرام أو تيك توك أو @الحساب، كل مؤثر في سطر. يُنشأ لكل واحد سجل، ويُجلب اسمه وعدد متابعيه من إنستغرام تلقائياً.',
                )}
              </p>
              {selectedCompany && <QuickAddPanel companyId={selectedCompany.id} onAdded={loadInfluencers} onOpen={openById} />}
            </TabsContent>
            <TabsContent value="details" className="space-y-4 pt-2">
              <ContactFormFields form={form} setForm={setForm} lockedRole="Influencer" />
              <div className="space-y-3 border-t pt-3">
                <h4 className="text-sm font-semibold">{tr('Main account', 'الحساب الأساسي')}</h4>
                <div className="grid gap-3 sm:grid-cols-[130px_1fr]">
                  <div>
                    <Label className="text-xs">{t('crm.platform')}</Label>
                    <Select value={account.platform} onValueChange={(v) => setAccount((a) => ({ ...a, platform: v }))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{influencerPlatforms.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">{tr('Account link or @handle', 'رابط الحساب أو @الحساب')}</Label>
                    <Input dir="ltr" className="h-9" placeholder="@username" value={account.handle} onChange={(e) => setAccount((a) => ({ ...a, handle: e.target.value }))} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">{t('crm.followerCount')}</Label>
                    <Input type="number" min={0} className="h-9" value={account.followers} onChange={(e) => setAccount((a) => ({ ...a, followers: e.target.value }))} />
                  </div>
                  {editPricing && (
                    <div>
                      <Label className="text-xs">{t('crm.rateCard')}</Label>
                      <Input type="number" min={0} className="h-9" value={account.rate} onChange={(e) => setAccount((a) => ({ ...a, rate: e.target.value }))} />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">{t('crm.availability')}</Label>
                    <Select value={account.availability} onValueChange={(v) => setAccount((a) => ({ ...a, availability: v }))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{AVAILABILITY.map((a) => <SelectItem key={a} value={a}>{availabilityLabel(tr, a)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              {customFieldDefs.length > 0 && (
                <div className="border-t pt-3">
                  <CustomFieldsForm definitions={customFieldDefs} values={createCustomValues} onChange={setCreateCustomValues} />
                </div>
              )}
              {existing && (
                <div role="alert" className="flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
                  <span>{tr(`This account is already on ${existing.name}'s record.`, `هذا الحساب موجود في سجل ${existing.name}.`)}</span>
                  <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => void openById(existing.id)}>{tr('Open it', 'فتح سجله')}</Button>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenCreate(false)}>{t('common.cancel')}</Button>
                <Button onClick={handleCreate} disabled={saving || !form.name.trim()}>{t('common.save')}</Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
          <p className="flex flex-wrap items-center gap-1 border-t pt-3 text-xs text-muted-foreground">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            {tr('Many at once from a spreadsheet: use Template, then Import. Or pick from the Discover directory.', 'لإضافة عدد كبير من ملف إكسل: نزّل "القالب" ثم "استيراد". أو اختر من دليل المؤثرين (Discover).')}
          </p>
        </DialogContent>
      </Dialog>

      <InfluencerEditSheet
        contact={editing}
        niches={niches}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        onSaved={(updated) => setInfluencers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))}
      />
    </SectionPageShell>
  );
}
