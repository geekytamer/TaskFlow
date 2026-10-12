'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, RefreshCw, Search, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { getContacts, type Contact } from '@/services/contactService';
import {
  addDiscoverHandles, addPastFollowers, discoverPhotoUrl, findDiscover, getDiscoverOrNull, refreshDiscover,
  saveDiscoverSettings, updateDiscoverProfile, type DiscoverProfile, type DiscoverSummary, type ProfileStatus,
} from '@/services/discoverService';

type View = 'candidate' | 'listed' | 'roster' | 'hidden';
const compact = (n: number | null) => (n === null ? '—' : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n));
/** Apify free-plan price per result, for the usage line. */
const PRICE_PER_RESULT = 0.0026;

function Photo({ profile }: { profile: DiscoverProfile }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    if (profile.hasPhoto) {
      discoverPhotoUrl(profile.id).then((u) => { if (cancelled) { if (u) URL.revokeObjectURL(u); } else { revoked = u; setUrl(u); } }).catch(() => undefined);
    }
    return () => { cancelled = true; if (revoked) URL.revokeObjectURL(revoked); };
  }, [profile.id, profile.hasPhoto, profile.lastFetchedAt]);
  const initial = (profile.fullName || profile.username).charAt(0).toUpperCase();
  return url
    // eslint-disable-next-line @next/next/no-img-element -- object URL from the API
    ? <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-full border object-cover" />
    : <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">{initial}</span>;
}

export function DiscoverPage() {
  const { language } = useI18n();
  const tr = React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]);
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [view, setView] = React.useState<View>('candidate');
  const [profiles, setProfiles] = React.useState<DiscoverProfile[]>([]);
  const [summary, setSummary] = React.useState<DiscoverSummary | null>(null);
  const [available, setAvailable] = React.useState<boolean | null>(null);
  const [handles, setHandles] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<DiscoverProfile | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [influencers, setInfluencers] = React.useState<Contact[]>([]);

  const load = React.useCallback(async () => {
    if (!selectedCompany) return;
    const data = await getDiscoverOrNull(selectedCompany.id);
    if (!data) { setAvailable(false); return; }
    setAvailable(true);
    setProfiles(data.profiles);
    setSummary(data.summary);
  }, [selectedCompany]);

  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    if (!selectedCompany) return;
    getContacts(selectedCompany.id, 'Influencer').then(setInfluencers).catch(() => setInfluencers([]));
  }, [selectedCompany]);
  // While a run is going, check every few seconds so its result shows without a reload.
  React.useEffect(() => {
    if (!summary?.running) return;
    const timer = window.setInterval(() => { void load(); }, 4000);
    return () => window.clearInterval(timer);
  }, [summary?.running, load]);

  const fail = (error: unknown) => toast({ variant: 'destructive', title: tr('Could not complete', 'تعذّر الإتمام'), description: error instanceof Error ? error.message : undefined });

  const shown = profiles.filter((p) => (view === 'roster' ? p.isRoster
    : p.isRoster ? false
      : view === 'hidden' ? p.status === 'rejected' || p.status === 'removed' : p.status === view));

  const setStatus = async (p: DiscoverProfile, status: ProfileStatus) => {
    try { await updateDiscoverProfile(p.id, { status }); await load(); } catch (e) { fail(e); }
  };

  const addHandles = async () => {
    if (!selectedCompany || !handles.trim()) return;
    setAdding(true);
    try {
      const res = await addDiscoverHandles(selectedCompany.id, handles);
      setHandles('');
      toast({
        title: tr(`${res.added.length} added`, `أُضيف ${res.added.length}`),
        description: [res.alreadyThere.length ? tr(`${res.alreadyThere.length} already in the directory.`, `${res.alreadyThere.length} موجود مسبقاً.`) : '',
          res.skipped.length ? tr(`Skipped: ${res.skipped.join(', ')}`, `تم تجاهل: ${res.skipped.join('، ')}`) : ''].filter(Boolean).join(' ') || undefined,
      });
      setView('listed');
      await load();
    } catch (e) { fail(e); } finally { setAdding(false); }
  };

  const start = async (kind: 'refresh' | 'find') => {
    if (!selectedCompany) return;
    try {
      const s = kind === 'refresh' ? await refreshDiscover(selectedCompany.id) : await findDiscover(selectedCompany.id);
      setSummary(s);
      window.setTimeout(() => { void load(); }, 1500);
    } catch (e) { fail(e); }
  };

  if (available === false) {
    return (
      <SectionPageShell title={tr('Discover directory', 'دليل الاكتشاف')} description="">
        <SectionEmptyState title={tr('Not available here', 'غير متاح هنا')} description={tr('The influencer directory belongs to the portal company, for its admins and managers.', 'دليل المؤثرين خاص بشركة البوابة، لمديريها ومشرفيها.')} />
      </SectionPageShell>
    );
  }

  const running = Boolean(summary?.running);
  const latest = summary?.runs[0];

  return (
    <SectionPageShell
      title={tr('Discover directory', 'دليل الاكتشاف')}
      description={tr('The Omani influencers clients browse under Discover in the portal. Figures come from Apify; nothing reaches clients until it is listed here.', 'المؤثرون العمانيون الذين يتصفحهم العملاء في "اكتشف" على البوابة. الأرقام من Apify، ولا يظهر شيء للعملاء قبل إدراجه هنا.')}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild><Link href="/influencers"><ArrowLeft className="me-1 h-4 w-4 rtl:rotate-180" />{tr('Influencers', 'المؤثرون')}</Link></Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}><Settings2 className="me-1 h-4 w-4" />{tr('Settings', 'الإعدادات')}</Button>
          <Button variant="outline" size="sm" disabled={!summary?.apifyConfigured || running} onClick={() => start('refresh')}>
            <RefreshCw className="me-1 h-4 w-4" />{tr('Refresh figures', 'تحديث الأرقام')}
          </Button>
          <Button size="sm" disabled={!summary?.apifyConfigured || running} onClick={() => start('find')}>
            <Search className="me-1 h-4 w-4" />{tr('Find new accounts', 'ابحث عن حسابات جديدة')}
          </Button>
        </div>
      }
    >
      {summary && (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-card p-4 text-sm">
            <p className="text-muted-foreground">{tr('Directory', 'الدليل')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.counts.listed + summary.counts.candidate} <span className="text-base font-normal text-muted-foreground">/ {summary.limit}</span></p>
            <p className="text-xs text-muted-foreground">{tr(`${summary.counts.listed} listed for clients · ${summary.counts.candidate} waiting for review`, `${summary.counts.listed} مُدرج للعملاء · ${summary.counts.candidate} بانتظار المراجعة`)}</p>
            <p className="text-xs text-muted-foreground">{tr(`+ ${summary.rosterCount} of Peak's influencers, synced from their records (not counted)`, `+ ${summary.rosterCount} من مؤثري بيك، تُزامن من سجلاتهم (لا تُحتسب)`)}</p>
          </div>
          <div className="rounded-xl border bg-card p-4 text-sm">
            <p className="text-muted-foreground">{tr('Apify this month', 'Apify هذا الشهر')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.resultsThisMonth} <span className="text-base font-normal text-muted-foreground">/ {summary.monthlyCap} {tr('results', 'نتيجة')}</span></p>
            <Progress value={Math.min(100, (summary.resultsThisMonth / summary.monthlyCap) * 100)} className="mt-2 h-1.5" />
            <p className="mt-1 text-xs text-muted-foreground">{tr(`About $${(summary.resultsThisMonth * PRICE_PER_RESULT).toFixed(2)} of the free plan's $5`, `حوالي ${(summary.resultsThisMonth * PRICE_PER_RESULT).toFixed(2)}$ من 5$ في الخطة المجانية`)}</p>
          </div>
          <div className="rounded-xl border bg-card p-4 text-sm">
            <p className="text-muted-foreground">{tr('Last run', 'آخر تشغيل')}</p>
            {!summary.apifyConfigured ? (
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">{tr('Apify is not set up: add APIFY_TOKEN to the backend settings. Handles can still be added and edited.', 'لم يُضبط Apify: أضف APIFY_TOKEN إلى إعدادات الخادم. يمكن إضافة الحسابات وتعديلها.')}</p>
            ) : running ? (
              <p className="mt-1 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{summary.running?.kind === 'refresh' ? tr('Refreshing figures…', 'جارٍ تحديث الأرقام…') : tr('Looking for new accounts…', 'جارٍ البحث عن حسابات…')}</p>
            ) : latest ? (
              <>
                <div className="mt-1 font-medium">{latest.kind === 'refresh' ? tr('Refresh', 'تحديث') : tr('Discovery', 'اكتشاف')} · <Badge variant={latest.status === 'done' ? 'secondary' : 'destructive'}>{runStatus(latest.status, tr)}</Badge></div>
                <p className="text-xs text-muted-foreground">{new Date(latest.startedAt).toLocaleString()} · {latest.message}</p>
              </>
            ) : <p className="mt-1 text-muted-foreground">{tr('Nothing has run yet. Figures refresh weekly and new accounts are found monthly on their own.', 'لم يُشغَّل شيء بعد. تُحدَّث الأرقام أسبوعياً ويُبحث عن حسابات جديدة شهرياً تلقائياً.')}</p>}
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-4">
        <Label htmlFor="discover-handles" className="text-sm font-semibold">{tr('Add Instagram accounts', 'أضف حسابات إنستغرام')}</Label>
        <p className="mb-2 text-xs text-muted-foreground">{tr('One per line: @handle or profile link. They are listed straight away and their figures arrive with the next fetch (started now).', 'حساب في كل سطر: ‎@الاسم أو رابط الحساب. تُدرج فوراً وتصل أرقامها مع الجلب التالي (يبدأ الآن).')}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Textarea id="discover-handles" value={handles} onChange={(e) => setHandles(e.target.value)} rows={2} placeholder="@muscat.eats" className="min-h-[2.75rem]" />
          <Button onClick={addHandles} disabled={adding || !handles.trim()} className="shrink-0"><Plus className="me-1 h-4 w-4" />{tr('Add', 'إضافة')}</Button>
        </div>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        <TabsList>
          <TabsTrigger value="candidate">{tr('To review', 'للمراجعة')} ({summary?.counts.candidate ?? 0})</TabsTrigger>
          <TabsTrigger value="listed">{tr('Listed', 'مُدرج')} ({summary?.counts.listed ?? 0})</TabsTrigger>
          <TabsTrigger value="roster">{tr('Your roster', 'مؤثرو بيك')} ({summary?.rosterCount ?? 0})</TabsTrigger>
          <TabsTrigger value="hidden">{tr('Hidden', 'مخفي')} ({(summary?.counts.rejected ?? 0) + (summary?.counts.removed ?? 0)})</TabsTrigger>
        </TabsList>
      </Tabs>

      {shown.length === 0 ? (
        <SectionEmptyState
          title={view === 'candidate' ? tr('Nothing to review', 'لا شيء للمراجعة') : view === 'listed' ? tr('No one listed yet', 'لا أحد مُدرج بعد') : view === 'roster' ? tr('No roster influencer has an Instagram handle yet', 'لا يوجد مؤثر في القائمة لديه حساب إنستغرام بعد') : tr('Nothing hidden', 'لا شيء مخفي')}
          description={view === 'candidate' ? tr('"Find new accounts" looks through Omani hashtags and puts what it finds here for you to approve.', '"ابحث عن حسابات جديدة" يفحص الوسوم العمانية ويضع ما يجده هنا لتوافق عليه.') : view === 'roster' ? tr("Add an Instagram account to an influencer's record and they appear here with the next refresh; their followers and engagement then update on their record every week.", 'أضف حساب إنستغرام إلى سجل المؤثر ليظهر هنا مع التحديث التالي، ثم تتحدث أرقام متابعيه وتفاعله في سجله أسبوعياً.') : ''}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('Account', 'الحساب')}</TableHead>
                <TableHead className="text-end">{tr('Followers', 'المتابعون')}</TableHead>
                <TableHead className="text-end">{tr('3 months', '3 أشهر')}</TableHead>
                <TableHead className="text-end">{tr('Engagement', 'التفاعل')}</TableHead>
                <TableHead>{tr('Details', 'التفاصيل')}</TableHead>
                <TableHead>{tr('Contacts (staff only)', 'التواصل (للموظفين)')}</TableHead>
                <TableHead className="text-end">{tr('Actions', 'إجراءات')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Photo profile={p} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.fullName || p.username}</p>
                        <a href={`https://www.instagram.com/${p.username}/`} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline" dir="ltr">@{p.username}</a>
                        {p.fetchError && <p className="text-xs text-destructive">{p.fetchError}</p>}
                        {!p.lastFetchedAt && !p.fetchError && <p className="text-xs text-muted-foreground">{tr('Waiting for the first fetch', 'بانتظار الجلب الأول')}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{compact(p.followers)}{p.tier && <p className="text-xs capitalize text-muted-foreground">{p.tier}</p>}</TableCell>
                  <TableCell className="text-end tabular-nums">{p.growth3m === null ? <span className="text-muted-foreground">{tr('New', 'جديد')}</span> : `${p.growth3m > 0 ? '+' : ''}${p.growth3m}%`}</TableCell>
                  <TableCell className="text-end tabular-nums">{p.engagementRate === null ? '—' : `${p.engagementRate}%`}</TableCell>
                  <TableCell className="text-sm">
                    <p>{[p.niche, p.location, p.gender === 'female' ? tr('Female', 'أنثى') : p.gender === 'male' ? tr('Male', 'ذكر') : null].filter(Boolean).join(' · ') || <span className="text-muted-foreground">{tr('Not set', 'غير محدد')}</span>}</p>
                    {p.contactName && <Badge variant="secondary" className="mt-1">{tr('Roster', 'ضمن القائمة')}: {p.contactName}</Badge>}
                    {p.requests > 0 && <p className="text-xs text-muted-foreground">{tr(`Requested by ${p.requests} client(s)`, `طلبه ${p.requests} عميل`)}</p>}
                  </TableCell>
                  <TableCell className="max-w-[14rem] text-xs text-muted-foreground" dir="ltr">{[...p.emails, ...p.phones].join(', ') || '—'}</TableCell>
                  <TableCell className="text-end">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>{tr('Edit', 'تعديل')}</Button>
                      {p.isRoster && <span className="self-center text-xs text-muted-foreground">{tr('Shown to clients while in the portal catalogue', 'يظهر للعملاء ما دام في كتالوج البوابة')}</span>}
                      {!p.isRoster && p.status === 'candidate' && <>
                        <Button size="sm" onClick={() => setStatus(p, 'listed')}>{tr('Approve', 'موافقة')}</Button>
                        <Button size="sm" variant="outline" onClick={() => setStatus(p, 'rejected')}>{tr('Reject', 'رفض')}</Button>
                      </>}
                      {!p.isRoster && p.status === 'listed' && <Button size="sm" variant="outline" onClick={() => setStatus(p, 'removed')}>{tr('Remove', 'إزالة')}</Button>}
                      {!p.isRoster && (p.status === 'rejected' || p.status === 'removed') && <Button size="sm" variant="outline" onClick={() => setStatus(p, 'listed')}>{tr('List again', 'إدراج مجدداً')}</Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && <EditDialog profile={editing} influencers={influencers} tr={tr} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} onError={fail} />}
      {settingsOpen && summary && selectedCompany && (
        <SettingsDialog companyId={selectedCompany.id} settings={summary.settings} tr={tr} onClose={() => setSettingsOpen(false)} onSaved={async () => { setSettingsOpen(false); await load(); }} onError={fail} />
      )}
    </SectionPageShell>
  );
}

type Tr = (en: string, ar: string) => string;

const runStatus = (status: DiscoverSummary['runs'][number]['status'], tr: Tr) =>
  ({ running: tr('running', 'قيد التشغيل'), done: tr('done', 'تم'), failed: tr('failed', 'فشل'), refused: tr('not run', 'لم يُشغَّل') })[status];

function EditDialog({ profile, influencers, tr, onClose, onSaved, onError }: {
  profile: DiscoverProfile; influencers: Contact[]; tr: Tr; onClose: () => void; onSaved: () => void; onError: (e: unknown) => void;
}) {
  const [niche, setNiche] = React.useState(profile.niche ?? '');
  const [location, setLocation] = React.useState(profile.location ?? '');
  const [gender, setGender] = React.useState<string>(profile.gender ?? 'none');
  const [contactId, setContactId] = React.useState(profile.contactId ?? '');
  const [pastFollowers, setPastFollowers] = React.useState('');
  const [pastDate, setPastDate] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateDiscoverProfile(profile.id, {
        niche: niche.trim() || null, location: location.trim() || null,
        gender: gender === 'female' || gender === 'male' ? gender : null,
        ...(profile.isRoster ? {} : { contactId: contactId || null }),
      });
      if (pastFollowers && pastDate) await addPastFollowers(profile.id, Number(pastFollowers), new Date(pastDate).toISOString());
      onSaved();
    } catch (e) { onError(e); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle dir="ltr">@{profile.username}</DialogTitle>
          <DialogDescription>{tr('What clients filter by. Gender and niche are set by Peak, never guessed.', 'ما يفلتر به العملاء. الجنس والمجال يحددهما فريق بيك ولا يُخمَّنان.')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="d-niche">{tr('Niche', 'المجال')}</Label><Input id="d-niche" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder={tr('Food, Fashion…', 'طعام، أزياء…')} /></div>
          <div className="space-y-1.5"><Label htmlFor="d-location">{tr('Location', 'الموقع')}</Label><Input id="d-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Muscat" /></div>
          <div className="space-y-1.5">
            <Label>{tr('Gender', 'الجنس')}</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{tr('Not set', 'غير محدد')}</SelectItem>
                <SelectItem value="female">{tr('Female', 'أنثى')}</SelectItem>
                <SelectItem value="male">{tr('Male', 'ذكر')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Peak roster influencer', 'مؤثر ضمن قائمة بيك')}</Label>
            {profile.isRoster ? (
              <p className="flex h-10 items-center text-sm">{profile.contactName} <span className="ms-1 text-xs text-muted-foreground">({tr('from their record', 'من سجله')})</span></p>
            ) : (
              <Combobox options={influencers.map((c) => ({ value: c.id, label: c.name }))} value={contactId} onValueChange={setContactId}
                placeholder={tr('Not on the roster', 'ليس ضمن القائمة')} searchPlaceholder={tr('Search…', 'بحث…')} clearLabel={tr('Not on the roster', 'ليس ضمن القائمة')} />
            )}
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-sm font-medium">{tr('Earlier follower count (optional)', 'عدد متابعين سابق (اختياري)')}</p>
          <p className="mb-2 text-xs text-muted-foreground">{tr('From a screenshot or report about three months old, so growth shows now instead of in three months.', 'من لقطة شاشة أو تقرير عمره نحو ثلاثة أشهر، ليظهر النمو الآن بدل الانتظار ثلاثة أشهر.')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input type="number" min={0} value={pastFollowers} onChange={(e) => setPastFollowers(e.target.value)} placeholder={tr('Followers', 'المتابعون')} />
            <Input type="date" value={pastDate} onChange={(e) => setPastDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={save} disabled={saving}>{tr('Save', 'حفظ')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({ companyId, settings, tr, onClose, onSaved, onError }: {
  companyId: string; settings: DiscoverSummary['settings']; tr: Tr; onClose: () => void; onSaved: () => void; onError: (e: unknown) => void;
}) {
  const [hashtags, setHashtags] = React.useState(settings.hashtags.join(', '));
  const [minFollowers, setMinFollowers] = React.useState(String(settings.minFollowers));
  const [perHashtag, setPerHashtag] = React.useState(String(settings.perHashtag));
  const tags = hashtags.split(/[,\s]+/).map((h) => h.replace(/^#+/, '').trim()).filter(Boolean);
  const estimate = tags.length * (Number(perHashtag) || 0);

  const save = async () => {
    try {
      await saveDiscoverSettings(companyId, { hashtags: tags, minFollowers: Number(minFollowers), perHashtag: Number(perHashtag) });
      onSaved();
    } catch (e) { onError(e); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr('Finding new accounts', 'البحث عن حسابات جديدة')}</DialogTitle>
          <DialogDescription>{tr('Once a month (or when you press Find), recent posts under these hashtags are read and their Omani authors over the threshold are added for review.', 'مرة شهرياً (أو عند الضغط على ابحث) تُقرأ أحدث المنشورات تحت هذه الوسوم ويُضاف أصحابها العمانيون فوق الحد للمراجعة.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="d-tags">{tr('Hashtags', 'الوسوم')}</Label><Textarea id="d-tags" value={hashtags} onChange={(e) => setHashtags(e.target.value)} rows={3} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="d-min">{tr('Minimum followers', 'الحد الأدنى للمتابعين')}</Label><Input id="d-min" type="number" min={1000} value={minFollowers} onChange={(e) => setMinFollowers(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="d-per">{tr('Posts per hashtag', 'منشورات لكل وسم')}</Label><Input id="d-per" type="number" min={10} max={200} value={perHashtag} onChange={(e) => setPerHashtag(e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">{tr(`Each search reads about ${estimate} posts plus up to 100 new profiles: roughly $${((estimate + 100) * PRICE_PER_RESULT).toFixed(2)}.`, `كل بحث يقرأ نحو ${estimate} منشوراً وحتى 100 حساب جديد: حوالي ${((estimate + 100) * PRICE_PER_RESULT).toFixed(2)}$.`)}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={save}>{tr('Save', 'حفظ')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
