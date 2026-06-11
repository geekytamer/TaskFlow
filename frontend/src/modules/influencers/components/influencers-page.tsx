'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
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
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import {
  getContacts,
  influencerPlatforms,
  type Contact,
  type InfluencerAccount,
} from '@/services/contactService';
import { InfluencerEditSheet } from './influencer-edit-sheet';
import {
  Sparkles,
  Search,
  Users,
  TrendingUp,
  CircleDollarSign,
  ExternalLink,
  MapPin,
  Pencil,
} from 'lucide-react';

const AVAILABILITY = ['Available', 'Partially Available', 'Unavailable'] as const;
const SORTS = ['followers', 'engagement', 'rate', 'name'] as const;
type SortKey = (typeof SORTS)[number];

const compactNumber = (n: number) =>
  new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const plainNumber = (n: number) => new Intl.NumberFormat(undefined).format(n);

/** Total followers across a contact's primary field plus all per-platform accounts. */
function totalFollowers(c: Contact): number {
  const fromAccounts = (c.influencerAccounts ?? []).reduce((sum, a) => sum + (a.followers ?? 0), 0);
  return fromAccounts > 0 ? fromAccounts : c.followerCount ?? 0;
}

/** Best engagement rate we know about — explicit field, else max across accounts. */
function bestEngagement(c: Contact): number | undefined {
  const rates = [c.engagementRate, ...(c.influencerAccounts ?? []).map((a) => a.engagementRate)].filter(
    (r): r is number => typeof r === 'number',
  );
  return rates.length ? Math.max(...rates) : undefined;
}

const PLATFORM_COLORS: Record<string, string> = {
  Instagram: 'bg-pink-100 text-pink-800',
  TikTok: 'bg-neutral-900 text-white',
  Snapchat: 'bg-yellow-100 text-yellow-800',
  Facebook: 'bg-blue-100 text-blue-800',
  YouTube: 'bg-red-100 text-red-800',
  X: 'bg-neutral-200 text-neutral-900',
  Other: 'bg-muted text-muted-foreground',
};

const AVAILABILITY_COLORS: Record<string, string> = {
  Available: 'bg-green-100 text-green-800',
  'Partially Available': 'bg-amber-100 text-amber-800',
  Unavailable: 'bg-red-100 text-red-800',
};

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
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

function AccountRow({ acc }: { acc: InfluencerAccount }) {
  const inner = (
    <div className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
            PLATFORM_COLORS[acc.platform] ?? PLATFORM_COLORS.Other
          }`}
        >
          {acc.platform}
        </span>
        {acc.handle ? <span className="truncate text-muted-foreground">@{acc.handle}</span> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
        {typeof acc.followers === 'number' ? (
          <span className="font-medium text-foreground">{compactNumber(acc.followers)}</span>
        ) : null}
        {typeof acc.engagementRate === 'number' ? <span>{acc.engagementRate}%</span> : null}
        {acc.url ? <ExternalLink className="h-3.5 w-3.5" /> : null}
      </div>
    </div>
  );
  return acc.url ? (
    <a href={acc.url} target="_blank" rel="noreferrer" className="block hover:opacity-80">
      {inner}
    </a>
  ) : (
    inner
  );
}

function InfluencerCard({
  c,
  money,
  onEdit,
}: {
  c: Contact;
  money: (value: number) => string;
  onEdit: () => void;
}) {
  const { t } = useI18n();
  const followers = totalFollowers(c);
  const engagement = bestEngagement(c);
  const accounts = c.influencerAccounts ?? [];

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button type="button" onClick={onEdit} className="text-start font-semibold hover:underline">
            {c.name}
          </button>
          {c.influencerNiche ? (
            <p className="truncate text-sm text-muted-foreground">{c.influencerNiche}</p>
          ) : null}
        </div>
        {c.availabilityStatus ? (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              AVAILABILITY_COLORS[c.availabilityStatus] ?? 'bg-muted text-muted-foreground'
            }`}
          >
            {c.availabilityStatus}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-muted/50 px-2 py-1.5">
          <p className="text-sm font-semibold">{followers ? compactNumber(followers) : '—'}</p>
          <p className="text-[11px] text-muted-foreground">{t('crm.followerCount')}</p>
        </div>
        <div className="rounded-md bg-muted/50 px-2 py-1.5">
          <p className="text-sm font-semibold">{engagement != null ? `${engagement}%` : '—'}</p>
          <p className="text-[11px] text-muted-foreground">{t('crm.engagementRate')}</p>
        </div>
        <div className="rounded-md bg-muted/50 px-2 py-1.5">
          <p className="truncate text-sm font-semibold">
            {c.rateCardAmount != null ? money(c.rateCardAmount) : '—'}
          </p>
          <p className="text-[11px] text-muted-foreground">{t('crm.rateCard')}</p>
        </div>
      </div>

      {(c.location || (c.languages && c.languages.length)) ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {c.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {c.location}
            </span>
          ) : null}
          {c.languages?.length ? <span>{c.languages.join(', ')}</span> : null}
        </div>
      ) : null}

      {accounts.length ? (
        <div className="flex flex-col gap-1.5">
          {accounts.map((acc) => (
            <AccountRow key={acc.id} acc={acc} />
          ))}
        </div>
      ) : c.influencerPlatform ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
              PLATFORM_COLORS[c.influencerPlatform] ?? PLATFORM_COLORS.Other
            }`}
          >
            {c.influencerPlatform}
          </span>
          {c.influencerHandle ? <span>@{c.influencerHandle}</span> : null}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-end pt-1">
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onEdit}>
          <Pencil className="h-3 w-3" />
          {t('influencers.edit')}
        </Button>
      </div>
    </div>
  );
}

export function InfluencersPage() {
  const { selectedCompany } = useCompany();
  const { t } = useI18n();
  const { toast } = useToast();
  const { money } = useCompanyCurrency();

  const [influencers, setInfluencers] = React.useState<Contact[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<Contact | null>(null);

  const [search, setSearch] = React.useState('');
  const [platform, setPlatform] = React.useState<string>('All');
  const [niche, setNiche] = React.useState<string>('All');
  const [availability, setAvailability] = React.useState<string>('All');
  const [minFollowers, setMinFollowers] = React.useState('');
  const [sort, setSort] = React.useState<SortKey>('followers');

  React.useEffect(() => {
    if (!selectedCompany) {
      setInfluencers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getContacts(selectedCompany.id, 'Influencer')
      .then(setInfluencers)
      .catch(() => toast({ title: t('influencers.loadError'), variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [selectedCompany, t, toast]);

  const niches = React.useMemo(() => {
    const set = new Set<string>();
    influencers.forEach((c) => {
      if (c.influencerNiche) set.add(c.influencerNiche);
    });
    return Array.from(set).sort();
  }, [influencers]);

  const matchesPlatform = React.useCallback(
    (c: Contact) => {
      if (platform === 'All') return true;
      if (c.influencerPlatform === platform) return true;
      return (c.influencerAccounts ?? []).some((a) => a.platform === platform);
    },
    [platform],
  );

  const filtered = React.useMemo(() => {
    const min = minFollowers ? Number(minFollowers) : 0;
    const q = search.trim().toLowerCase();
    const result = influencers.filter((c) => {
      if (!matchesPlatform(c)) return false;
      if (niche !== 'All' && c.influencerNiche !== niche) return false;
      if (availability !== 'All' && c.availabilityStatus !== availability) return false;
      if (min && totalFollowers(c) < min) return false;
      if (q) {
        const hay = [
          c.name,
          c.influencerHandle,
          c.influencerNiche,
          c.location,
          ...(c.influencerAccounts ?? []).map((a) => a.handle),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'engagement':
          return (bestEngagement(b) ?? -1) - (bestEngagement(a) ?? -1);
        case 'rate':
          return (b.rateCardAmount ?? -1) - (a.rateCardAmount ?? -1);
        case 'followers':
        default:
          return totalFollowers(b) - totalFollowers(a);
      }
    });
    return result;
  }, [influencers, matchesPlatform, niche, availability, minFollowers, search, sort]);

  // Stats reflect the active filters — they summarize exactly what's shown below.
  const stats = React.useMemo(() => {
    const reach = filtered.reduce((sum, c) => sum + totalFollowers(c), 0);
    const engagements = filtered.map(bestEngagement).filter((r): r is number => r != null);
    const avgEng = engagements.length
      ? engagements.reduce((s, r) => s + r, 0) / engagements.length
      : 0;
    const available = filtered.filter((c) => c.availabilityStatus === 'Available').length;
    return { reach, avgEng, available };
  }, [filtered]);

  return (
    <SectionPageShell title={t('influencers.title')} description={t('influencers.subtitle')}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label={t('influencers.totalInfluencers')} value={plainNumber(filtered.length)} />
        <StatCard icon={Sparkles} label={t('influencers.combinedReach')} value={compactNumber(stats.reach)} />
        <StatCard
          icon={TrendingUp}
          label={t('influencers.avgEngagement')}
          value={stats.avgEng ? `${stats.avgEng.toFixed(1)}%` : '—'}
        />
        <StatCard icon={CircleDollarSign} label={t('influencers.available')} value={plainNumber(stats.available)} />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="flex-1 lg:min-w-[220px]">
          <Label className="text-xs">{t('common.search')}</Label>
          <div className="relative">
            <Search className="absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 ps-8"
              placeholder={t('influencers.searchPh')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">{t('crm.platform')}</Label>
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">{t('influencers.allPlatforms')}</SelectItem>
              {influencerPlatforms.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t('crm.niche')}</Label>
          <Select value={niche} onValueChange={setNiche}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">{t('influencers.allNiches')}</SelectItem>
              {niches.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t('crm.availability')}</Label>
          <Select value={availability} onValueChange={setAvailability}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">{t('influencers.allAvailability')}</SelectItem>
              {AVAILABILITY.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t('influencers.minFollowers')}</Label>
          <Input
            type="number"
            className="h-9 w-[130px]"
            placeholder="0"
            value={minFollowers}
            onChange={(e) => setMinFollowers(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">{t('influencers.sortBy')}</Label>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="followers">{t('crm.followerCount')}</SelectItem>
              <SelectItem value="engagement">{t('crm.engagementRate')}</SelectItem>
              <SelectItem value="rate">{t('crm.rateCard')}</SelectItem>
              <SelectItem value="name">{t('influencers.sortName')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <SectionEmptyState
          title={t('influencers.emptyTitle')}
          description={
            influencers.length === 0 ? t('influencers.emptyAll') : t('influencers.emptyFiltered')
          }
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t('influencers.showing')} {filtered.length} {t('influencers.ofTotal')} {influencers.length}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((c) => (
              <InfluencerCard key={c.id} c={c} money={money} onEdit={() => setEditing(c)} />
            ))}
          </div>
        </>
      )}

      <InfluencerEditSheet
        contact={editing}
        niches={niches}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSaved={(updated) =>
          setInfluencers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
        }
      />
    </SectionPageShell>
  );
}
