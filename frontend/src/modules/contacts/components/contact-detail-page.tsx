'use client';

import { AskAboutThis } from '@/modules/assistant/components/ask-about-this';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/context/i18n-context';
import { useCompanyCurrency } from '@/lib/currency';
import { usePermissions } from '@/context/permissions-context';
import { hiddenText } from '@/components/hidden-value';
import { useLiveRefresh } from '@/lib/live';
import { getContactSummary, type Contact, type ContactRoleType, type ContactSummary } from '@/services/contactService';
import { getContactActivities, type CrmActivity } from '@/services/crmService';
import { getCustomFieldDefinitions, type CustomFieldDefinition } from '@/services/customFieldService';
import { getUsersByCompany } from '@/services/userService';
import type { User as UserType } from '@/modules/users/types';
import { ContactConversation } from '@/modules/conversations/components/contact-conversation';
import { ActivityFeed } from '@/modules/crm/components/activity-feed';
import { LogActivityDialog } from '@/modules/crm/components/log-activity-dialog';
import { RecordSupportPanel } from '@/modules/shared/components/record-support-panel';
import { WorkspaceSection } from './workspace-section';
import { FlexiSection } from './flexi-section';
import { PayoutAccountsSection } from './payout-accounts-section';
import { ContactEditDialog } from './contact-edit-dialog';
import { ROLE_COLORS } from './contact-form-fields';
import { useCanReviewFlexi } from '@/modules/flexi/lib/use-can-review-flexi';
import { InfluencerAvatar, useInfluencerPhotos } from '@/modules/influencers/components/influencer-avatar';
import { PortalAccessPanel } from '@/modules/portal-access/components/portal-access-panel';
import { useCanManagePortal } from '@/modules/portal-access/lib/use-can-manage-portal';
import { agingOf, dayText, quickLinks, sinceText, statementOf } from '../lib/contact-finance';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarClock,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Package,
  Pencil,
  Phone,
  Receipt,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  User,
  Users,
  Wallet,
} from 'lucide-react';

const empty = '—';

/** Arabic for the statuses this page lists (invoices, orders, campaigns, their pieces, quotations, bills). */
const STATUS_AR: Record<string, string> = {
  Planned: 'مخطط', Active: 'نشطة', 'On Hold': 'متوقفة مؤقتاً', Completed: 'مكتملة', Cancelled: 'ملغاة', Archived: 'مؤرشفة',
  'In Progress': 'قيد التنفيذ', Submitted: 'مُرسل للمراجعة', Approved: 'معتمد', Published: 'منشور',
  Draft: 'مسودة', Sent: 'مُرسل', Accepted: 'مقبول', Declined: 'مرفوض', Expired: 'منتهي',
  Paid: 'مدفوعة', Overdue: 'متأخرة', 'Partially Paid': 'مدفوعة جزئياً', Pending: 'قيد الانتظار', Confirmed: 'مؤكد',
  Delivered: 'تم التسليم', Received: 'تم الاستلام', Open: 'مفتوح', Won: 'تم الفوز', Lost: 'خسارة', New: 'جديد',
};

const SOURCE_AR: Record<string, string> = {
  Instagram: 'إنستغرام', TikTok: 'تيك توك', WhatsApp: 'واتساب', Referral: 'ترشيح', Website: 'الموقع',
  Campaign: 'حملة', 'Former Client': 'عميل سابق', Other: 'أخرى',
};

type TabKey = 'overview' | 'activity' | 'finance' | 'sales' | 'campaigns' | 'influencer' | 'conversation' | 'files';
const TAB_KEYS: TabKey[] = ['overview', 'activity', 'finance', 'sales', 'campaigns', 'influencer', 'conversation', 'files'];

/** 52000 -> 52K. Follower counts are unreadable at full precision. */
function compact(value: number): string {
  if (!Number.isFinite(value)) return empty;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(value);
}

/** Reach across every platform, falling back to the legacy single-platform field. */
function totalFollowers(contact: { influencerAccounts?: { followers?: number }[]; followerCount?: number }): number {
  const accounts = contact.influencerAccounts ?? [];
  if (accounts.length > 0) return accounts.reduce((sum, a) => sum + (Number(a.followers) || 0), 0);
  return Number(contact.followerCount) || 0;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '؟';

export function ContactDetailPage({ contactId }: { contactId: string }) {
  const router = useRouter();
  const { t, language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { money, amount, amountIn } = useCompanyCurrency();
  const { can, field, moduleOn } = usePermissions();
  const canManage = can('contacts.manage');
  const canSeePricing = field('rate_cards').view;
  const canSeeWorkspace = can('influencers.use_workspace') && moduleOn('influencers');
  const canReviewFlexi = useCanReviewFlexi();
  const canManagePortal = useCanManagePortal();

  const [summary, setSummary] = React.useState<ContactSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState<'missing' | 'error' | null>(null);
  const [activities, setActivities] = React.useState<CrmActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = React.useState(false);
  const [users, setUsers] = React.useState<UserType[]>([]);
  const [defs, setDefs] = React.useState<CustomFieldDefinition[]>([]);
  const [editOpen, setEditOpen] = React.useState(false);
  const [logOpen, setLogOpen] = React.useState(false);
  const [tab, setTab] = React.useState<TabKey>('overview');
  const companyId = summary?.contact.companyId;
  const photos = useInfluencerPhotos(companyId);

  // The tab lives in the address, so a link or a refresh opens the same one.
  React.useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('tab') as TabKey | null;
    if (fromUrl && TAB_KEYS.includes(fromUrl)) setTab(fromUrl);
  }, []);
  const changeTab = (next: string) => {
    setTab(next as TabKey);
    const url = new URL(window.location.href);
    if (next === 'overview') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url.toString());
  };

  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      setSummary(await getContactSummary(contactId));
      setFailed(null);
    } catch (err: any) {
      if (!quiet) setFailed(err?.status === 404 ? 'missing' : 'error');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [contactId]);

  const loadActivities = React.useCallback(async () => {
    if (!canManage) return;
    setActivitiesLoading(true);
    try {
      setActivities(await getContactActivities(contactId, 50));
    } catch {
      setActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  }, [contactId, canManage]);

  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => { void loadActivities(); }, [loadActivities]);
  // Colleagues' changes show up without reloading.
  useLiveRefresh(['contacts', 'clients', 'suppliers', 'influencers', 'invoices', 'opportunities'], () => load(true));

  React.useEffect(() => {
    if (!companyId) return;
    let active = true;
    getUsersByCompany(companyId).then((u) => { if (active) setUsers(u); }).catch(() => undefined);
    getCustomFieldDefinitions(companyId, 'contact').then((d) => { if (active) setDefs(d); }).catch(() => undefined);
    return () => { active = false; };
  }, [companyId]);

  const back = () => {
    // Opened straight from a link: there is nothing in this tab to go back to.
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) router.back();
    else router.push('/contacts');
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-muted-foreground">
        {failed === 'missing' ? t('contact360.notFound') : tr('The contact could not be loaded.', 'تعذّر تحميل جهة الاتصال.')}
        <div className="flex gap-2">
          {failed !== 'missing' && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5" />
              {tr('Try again', 'إعادة المحاولة')}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => router.push('/contacts')}>{tr('All contacts', 'كل جهات الاتصال')}</Button>
        </div>
      </div>
    );
  }

  const c = summary.contact;
  const roles = (c.roles ?? []) as ContactRoleType[];
  const isInfluencer = roles.includes('Influencer');
  const isClient = roles.includes('Client') || roles.includes('Lead');
  const isVendor = roles.includes('Vendor');
  const isPaid = isInfluencer || isVendor || roles.includes('Partner');
  const totals = summary.totals;
  const invoices = summary.invoices ?? [];
  const payments = summary.payments ?? [];
  const deliverables = summary.deliverables ?? [];
  const campaigns = summary.campaigns ?? [];
  const quotations = summary.quotations ?? [];
  const links = quickLinks(c);
  const aging = agingOf(invoices);
  const statement = statementOf(invoices, payments);
  const lastInvoice = invoices.reduce<any>((latest, inv) => (!latest || new Date(inv.issueDate) > new Date(latest.issueDate) ? inv : latest), null);
  const day = (v?: string | Date | null) => dayText(v) ?? empty;
  const status = (v?: string) => (v ? (language === 'ar' ? STATUS_AR[v] ?? v : v) : empty);
  const followupDue = c.nextFollowupDate ? new Date(c.nextFollowupDate) : null;
  const followupLate = followupDue ? followupDue.getTime() < new Date(new Date().toDateString()).getTime() : false;
  const ownerName = c.ownerName ?? users.find((u) => u.id === c.ownerUserId)?.name;
  const vendorBillsTitle = isInfluencer ? tr('Payouts', 'المدفوعات') : t('whatsapp.summaryVendorBills');
  const onContactChanged = (updated: Contact) => setSummary((s) => (s ? { ...s, contact: { ...s.contact, ...updated } } : s));

  // ── Key numbers: what matters for this kind of contact ──
  const kpis: Array<{ key: string; icon: React.ReactNode; label: string; value: string; helper?: string; tone?: 'bad' | 'good' }> = [];
  if (isClient || invoices.length > 0) {
    kpis.push(
      { key: 'sales', icon: <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />, label: tr('Invoiced', 'إجمالي الفواتير'), value: money(totals.invoiceTotal ?? 0), helper: `${totals.invoiceCount} ${tr('invoices', 'فاتورة')}` },
      { key: 'paid', icon: <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />, label: tr('Paid', 'المدفوع'), value: money(totals.paymentTotal ?? 0), tone: 'good' },
      { key: 'owed', icon: <Receipt className="h-4 w-4 text-amber-600 dark:text-amber-400" />, label: tr('Owed to us', 'مستحق لنا'), value: money(totals.invoiceOutstanding), helper: lastInvoice ? `${tr('Last invoice', 'آخر فاتورة')} ${day(lastInvoice.issueDate)}` : undefined },
      { key: 'late', icon: <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />, label: tr('Overdue', 'متأخر'), value: money(aging.overdue), tone: aging.overdue > 0 ? 'bad' : undefined },
    );
  }
  if (isInfluencer) {
    kpis.push(
      { key: 'inf-paid', icon: <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />, label: tr('Paid to them', 'دفعنا لهم'), value: money(totals.vendorBillPaid ?? 0) },
      { key: 'inf-owed', icon: <Package className="h-4 w-4 text-red-600 dark:text-red-400" />, label: tr('Still to pay them', 'باقي لهم'), value: money(totals.vendorBillOutstanding) },
      { key: 'inf-camp', icon: <Megaphone className="h-4 w-4 text-pink-600 dark:text-pink-400" />, label: tr('Campaigns', 'الحملات'), value: String(totals.campaignCount ?? 0), helper: `${totals.deliverableCount ?? 0} ${tr('pieces of work', 'محتوى')}` },
      { key: 'inf-reach', icon: <Users className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-400" />, label: tr('Followers', 'المتابعون'), value: totalFollowers(c) ? compact(totalFollowers(c)) : empty },
    );
  } else if (isVendor || isPaid) {
    kpis.push(
      { key: 'v-po', icon: <ShoppingCart className="h-4 w-4 text-orange-600 dark:text-orange-400" />, label: t('whatsapp.summaryPurchaseOrders'), value: String(totals.purchaseOrderCount) },
      { key: 'v-paid', icon: <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />, label: tr('Paid to them', 'دفعنا لهم'), value: money(totals.vendorBillPaid ?? 0) },
      { key: 'v-owed', icon: <Package className="h-4 w-4 text-red-600 dark:text-red-400" />, label: tr('We still owe them', 'باقي علينا لهم'), value: money(totals.vendorBillOutstanding), helper: `${totals.vendorBillCount} ${vendorBillsTitle}` },
    );
  }
  if (kpis.length === 0) {
    kpis.push(
      { key: 'opp', icon: <TrendingUp className="h-4 w-4 text-violet-600 dark:text-violet-400" />, label: t('whatsapp.summaryOpportunities'), value: String(totals.opportunityCount) },
      { key: 'proj', icon: <Briefcase className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />, label: t('whatsapp.summaryProjects'), value: String(totals.projectCount) },
      { key: 'quotes', icon: <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />, label: tr('Quotations', 'عروض الأسعار'), value: String(totals.quotationCount ?? 0) },
    );
  }

  // ── Tabs: only those with something to show for this contact ──
  const salesCount = quotations.length + summary.salesOrders.length + summary.opportunities.length + summary.projects.length + summary.purchaseOrders.length;
  const financeCount = invoices.length + summary.vendorBills.length;
  const tabs: Array<{ key: TabKey; label: string; count?: number; show: boolean }> = [
    { key: 'overview', label: tr('Overview', 'نظرة عامة'), show: true },
    { key: 'activity', label: tr('Activity', 'الأنشطة'), count: activities.length || undefined, show: canManage },
    { key: 'finance', label: tr('Finance', 'المالية'), count: financeCount || undefined, show: isClient || isPaid || financeCount > 0 },
    { key: 'sales', label: tr('Sales & projects', 'المبيعات والمشاريع'), count: salesCount || undefined, show: isClient || isVendor || salesCount > 0 },
    { key: 'campaigns', label: tr('Campaigns', 'الحملات'), count: (campaigns.length + deliverables.length) || undefined, show: moduleOn('campaigns') && (isInfluencer || campaigns.length + deliverables.length > 0) },
    { key: 'influencer', label: tr('Influencer', 'المؤثر'), show: isInfluencer },
    { key: 'conversation', label: tr('Conversation', 'المحادثة'), show: moduleOn('inbox') || canManagePortal },
    { key: 'files', label: tr('Files', 'الملفات'), show: true },
  ];
  const visibleTabs = tabs.filter((x) => x.show);
  const activeTab = visibleTabs.some((x) => x.key === tab) ? tab : 'overview';

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ms-2" onClick={back}>
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
          {t('common.back')}
        </Button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            {isInfluencer ? (
              <InfluencerAvatar contactId={c.id} name={c.name} photoAt={photos?.[c.id] ?? null} size="lg" />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
                {c.kind === 'Organization' ? <Building2 className="h-6 w-6" /> : initials(c.name)}
              </div>
            )}
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{c.name}</h1>
                {c.visibility === 'Private' && (
                  <span title={t('crm.visibilityPrivate')}><Lock className="h-4 w-4 text-red-500" /></span>
                )}
                <AskAboutThis subject={{ kind: 'contact', id: c.id, title: c.name }} />
              </div>
              {(c.nameAr && c.nameEn && c.nameAr !== c.nameEn) && (
                <p className="text-sm text-muted-foreground" dir="auto">{c.name === c.nameAr ? c.nameEn : c.nameAr}</p>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                {roles.map((r) => (
                  <span key={r} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[r] ?? ''}`}>
                    {t(`contacts.role${r}`)}
                  </span>
                ))}
                {c.leadStatus && <Badge variant="outline" className="text-xs">{t(`crm.status${c.leadStatus.replace('-', '')}`)}</Badge>}
                {c.priority && (
                  <Badge variant="outline" className="border-amber-300 text-xs text-amber-700 dark:border-amber-500/40 dark:text-amber-300">
                    {t('crm.priority')}: {t(`crm.priority${c.priority}`)}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{tr('Owner', 'المسؤول')}: {ownerName ?? tr('nobody', 'لا أحد')}</span>
                <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{tr('Last contact', 'آخر تواصل')}: {sinceText(summary.lastActivityAt, language) ?? tr('never', 'لا يوجد')}</span>
                {followupDue && (
                  <span className={`inline-flex items-center gap-1 ${followupLate ? 'font-medium text-red-600 dark:text-red-400' : ''}`}>
                    <CalendarClock className="h-3.5 w-3.5" />
                    {tr('Follow-up', 'المتابعة')}: {day(followupDue)}{followupLate ? ` (${tr('late', 'متأخرة')})` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            {links.call && (
              <Button asChild size="sm" variant="outline" className="gap-1.5"><a href={links.call}><Phone className="h-4 w-4" />{tr('Call', 'اتصال')}</a></Button>
            )}
            {links.whatsapp && (
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <a href={links.whatsapp} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 text-emerald-600" />{tr('WhatsApp', 'واتساب')}</a>
              </Button>
            )}
            {links.email && (
              <Button asChild size="sm" variant="outline" className="gap-1.5"><a href={links.email}><Mail className="h-4 w-4" />{tr('Email', 'إيميل')}</a></Button>
            )}
            {canManage && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setLogOpen(true)}>
                <Phone className="h-4 w-4" />{t('crm.logActivity')}
              </Button>
            )}
            <Button size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />{tr('Edit', 'تعديل')}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Key numbers ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.slice(0, 8).map((k) => (
          <div key={k.key} className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">{k.icon}<span>{k.label}</span></div>
            <div className={`mt-1 text-lg font-semibold ${k.tone === 'bad' ? 'text-red-600 dark:text-red-400' : ''}`}>{k.value}</div>
            {k.helper && <div className="text-[11px] text-muted-foreground">{k.helper}</div>}
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={changeTab} className="space-y-4">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex h-auto w-max flex-nowrap">
            {visibleTabs.map((x) => (
              <TabsTrigger key={x.key} value={x.key} className="gap-1.5">
                {x.label}
                {x.count ? <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{x.count}</span> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-sm font-medium">{t('contact360.detailsTitle')}</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <Detail icon={<Phone className="h-3.5 w-3.5" />} label={tr('Phone', 'الهاتف')} value={c.phone} dir="ltr" />
                  <Detail icon={<Mail className="h-3.5 w-3.5" />} label={tr('Email', 'الإيميل')} value={c.email} dir="ltr" />
                  <Detail icon={<MapPin className="h-3.5 w-3.5" />} label={tr('Address', 'العنوان')} value={c.address} />
                  <Detail icon={<User className="h-3.5 w-3.5" />} label={t('contacts.contactPerson')} value={c.contactPerson} />
                  <Detail icon={<Building2 className="h-3.5 w-3.5" />} label={tr('Legal name', 'الاسم القانوني')} value={c.legalName} />
                  <Detail icon={<FileText className="h-3.5 w-3.5" />} label={tr('Tax number', 'الرقم الضريبي')} value={c.taxNumber} dir="ltr" />
                  <Detail icon={<TrendingUp className="h-3.5 w-3.5" />} label={t('crm.leadSource')} value={c.leadSource ? (language === 'ar' ? SOURCE_AR[c.leadSource] ?? c.leadSource : c.leadSource) : undefined} />
                  <Detail icon={c.visibility === 'Private' ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />} label={t('crm.visibility')} value={t(`crm.visibility${c.visibility ?? 'Public'}`)} />
                  {defs.map((d) => {
                    const v = c.customFields?.[d.key];
                    if (v === undefined || v === null || v === '') return null;
                    return <Detail key={d.id} label={d.label} value={typeof v === 'boolean' ? (v ? tr('Yes', 'نعم') : tr('No', 'لا')) : String(v)} />;
                  })}
                  <Detail label={tr('Added', 'تاريخ الإضافة')} value={day(c.createdAt)} />
                </dl>
                {c.notes && (
                  <div className="mt-4 rounded-md bg-muted/40 p-3 text-sm">
                    <div className="mb-1 text-xs font-medium text-muted-foreground">{tr('Notes', 'ملاحظات')}</div>
                    <p className="whitespace-pre-wrap">{c.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-sm font-medium">{tr('Next step', 'الخطوة القادمة')}</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {followupDue ? (
                    <>
                      <div className={`font-medium ${followupLate ? 'text-red-600 dark:text-red-400' : ''}`}>{day(followupDue)}{followupLate ? ` · ${tr('late', 'متأخرة')}` : ''}</div>
                      {c.nextFollowupNote && <p className="text-muted-foreground">{c.nextFollowupNote}</p>}
                    </>
                  ) : (
                    <p className="text-muted-foreground">{tr('No follow-up set.', 'لا توجد متابعة محددة.')}</p>
                  )}
                  <Button size="sm" variant="outline" className="mt-1 h-8 gap-1" onClick={() => setEditOpen(true)}>
                    <CalendarClock className="h-3.5 w-3.5" />{followupDue ? tr('Change', 'تغيير') : tr('Set a follow-up', 'تحديد متابعة')}
                  </Button>
                </CardContent>
              </Card>

              {canManage && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-medium">{tr('Latest activity', 'آخر الأنشطة')}</CardTitle>
                    {activities.length > 3 && (
                      <button type="button" className="text-xs text-primary hover:underline" onClick={() => changeTab('activity')}>{tr('All', 'الكل')}</button>
                    )}
                  </CardHeader>
                  <CardContent>
                    <ActivityFeed activities={activities.slice(0, 3)} loading={activitiesLoading} />
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Activity */}
        {canManage && (
          <TabsContent value="activity" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" className="gap-1.5" onClick={() => setLogOpen(true)}><Phone className="h-4 w-4" />{t('crm.logActivity')}</Button>
            </div>
            <Card><CardContent className="pt-6"><ActivityFeed activities={activities} loading={activitiesLoading} /></CardContent></Card>
          </TabsContent>
        )}

        {/* Finance */}
        <TabsContent value="finance" className="space-y-4">
          {aging.total > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">{tr('What they owe, by age', 'المستحق حسب مدة التأخير')}</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  [tr('Not yet due', 'لم يستحق بعد'), aging.current, ''],
                  [tr('1–30 days', '1–30 يوم'), aging.d1_30, 'text-amber-600 dark:text-amber-400'],
                  [tr('31–60 days', '31–60 يوم'), aging.d31_60, 'text-orange-600 dark:text-orange-400'],
                  [tr('61–90 days', '61–90 يوم'), aging.d61_90, 'text-red-600 dark:text-red-400'],
                  [tr('Over 90 days', 'أكثر من 90 يوم'), aging.d90plus, 'text-red-700 dark:text-red-300'],
                ].map(([label, value, tone]) => (
                  <div key={label as string} className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className={`mt-1 font-semibold ${(value as number) > 0 ? tone : 'text-muted-foreground'}`}>{money(value as number)}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {statement.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium">{tr('Statement of account', 'كشف الحساب')}</CardTitle>
                <span className="text-xs text-muted-foreground">{tr('Balance', 'الرصيد')}: <b className="text-foreground">{money(statement[statement.length - 1].balance)}</b></span>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tr('Date', 'التاريخ')}</TableHead>
                      <TableHead>{tr('Entry', 'البيان')}</TableHead>
                      <TableHead className="text-end">{tr('Invoiced', 'مدين')}</TableHead>
                      <TableHead className="text-end">{tr('Paid', 'دائن')}</TableHead>
                      <TableHead className="text-end">{tr('Balance', 'الرصيد')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statement.slice(-30).reverse().map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="whitespace-nowrap text-sm">{day(line.date)}</TableCell>
                        <TableCell className="text-sm">
                          {line.kind === 'invoice' ? tr('Invoice', 'فاتورة') : tr('Payment', 'دفعة')} {line.reference}
                          {line.method ? <span className="text-muted-foreground"> · {line.method}</span> : null}
                        </TableCell>
                        <TableCell className="text-end text-sm">{line.debit ? amount(line.debit) : ''}</TableCell>
                        <TableCell className="text-end text-sm text-emerald-700 dark:text-emerald-400">{line.credit ? amount(line.credit) : ''}</TableCell>
                        <TableCell className="text-end text-sm font-medium">{amount(line.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {statement.length > 30 && (
                  <p className="pt-2 text-xs text-muted-foreground">{tr(`Latest 30 of ${statement.length}`, `آخر 30 من ${statement.length}`)}</p>
                )}
              </CardContent>
            </Card>
          )}

          <RecordTable
            title={t('whatsapp.summaryInvoices')}
            href="/finance?tab=invoices"
            columns={[t('contact360.colNumber'), t('contact360.colStatus'), t('contact360.colTotal'), t('contact360.colOutstanding'), t('contact360.colDue')]}
            rows={invoices.slice(0, 15).map((inv) => [
              inv.invoiceNumber, status(inv.status), amountIn(inv.total || 0, inv.currency), amountIn(inv.outstandingAmount || 0, inv.currency), day(inv.dueDate),
            ])}
            total={totals.invoiceCount}
          />
          <RecordTable
            title={vendorBillsTitle}
            href="/finance?tab=payables"
            columns={[t('contact360.colNumber'), t('contact360.colStatus'), t('contact360.colTotal'), t('contact360.colOutstanding'), t('contact360.colDue')]}
            rows={summary.vendorBills.slice(0, 15).map((b) => [b.billNumber, status(b.status), amount(b.amount || 0), amount(b.outstandingAmount || 0), day(b.dueDate)])}
            total={totals.vendorBillCount}
          />
          {isPaid && <PayoutAccountsSection contact={c} onChanged={onContactChanged} />}
          {roles.includes('Client') && canReviewFlexi && <FlexiSection contactId={c.id} />}
          {financeCount === 0 && !isPaid && <EmptyTab text={tr('No invoices or payments yet.', 'لا توجد فواتير أو دفعات بعد.')} />}
        </TabsContent>

        {/* Sales & projects */}
        <TabsContent value="sales" className="space-y-4">
          <RecordTable
            title={tr('Quotations', 'عروض الأسعار')}
            href="/sales"
            columns={[t('contact360.colNumber'), t('contact360.colStatus'), t('contact360.colTotal'), tr('Valid until', 'صالح حتى')]}
            rows={quotations.slice(0, 15).map((q) => [q.quoteNumber, status(q.status), amountIn(q.totalAmount || 0, q.currency), day(q.validUntil)])}
            total={quotations.length}
          />
          <RecordTable
            title={t('whatsapp.summarySalesOrders')}
            href="/sales"
            columns={[t('contact360.colNumber'), t('contact360.colStatus'), t('contact360.colTotal'), t('contact360.colOrderDate')]}
            rows={summary.salesOrders.slice(0, 15).map((so) => [so.orderNumber, status(so.status), amount(so.totalAmount || 0), day(so.orderDate)])}
            total={totals.salesOrderCount}
          />
          <RecordTable
            title={t('whatsapp.summaryOpportunities')}
            href="/crm/opportunities"
            columns={[t('contact360.colName'), t('contact360.colStatus'), t('contact360.colTotal')]}
            rows={summary.opportunities.slice(0, 15).map((opp) => [opp.name ?? opp.title, status(opp.stage), amount(opp.expectedRevenue || 0)])}
            total={totals.opportunityCount}
          />
          <RecordTable
            title={t('whatsapp.summaryProjects')}
            href="/projects"
            columns={[t('contact360.colName'), t('contact360.colDescription')]}
            rows={summary.projects.slice(0, 15).map((p) => [
              <Link key={p.id} href={`/projects/${p.id}`} className="text-primary hover:underline">{p.name}</Link>,
              p.description || empty,
            ])}
            total={totals.projectCount}
          />
          <RecordTable
            title={t('whatsapp.summaryPurchaseOrders')}
            href="/purchases"
            columns={[t('contact360.colNumber'), t('contact360.colStatus'), t('contact360.colTotal')]}
            rows={summary.purchaseOrders.slice(0, 15).map((po) => [po.orderNumber, status(po.status), amount(po.totalAmount || 0)])}
            total={totals.purchaseOrderCount}
          />
          {salesCount === 0 && <EmptyTab text={tr('No quotations, orders or projects yet.', 'لا توجد عروض أسعار أو طلبات أو مشاريع بعد.')} />}
        </TabsContent>

        {/* Campaigns */}
        <TabsContent value="campaigns" className="space-y-4">
          <RecordTable
            title={tr('Campaigns', 'الحملات')}
            href="/crm/campaigns"
            columns={[t('contact360.colName'), t('contact360.colStatus'), tr('Their part', 'دوره'), tr('Dates', 'التواريخ')]}
            rows={campaigns.slice(0, 15).map((cmp) => [
              <Link key={cmp.id} href={`/crm/campaigns?campaign=${encodeURIComponent(cmp.id)}`} className="text-primary hover:underline">{cmp.name}</Link>,
              status(cmp.status),
              cmp.relation === 'client' ? tr('Client', 'العميل') : tr('Works on it', 'مشارك بالتنفيذ'),
              [cmp.startDate, cmp.endDate].some(Boolean) ? `${day(cmp.startDate)} – ${day(cmp.endDate)}` : empty,
            ])}
            total={campaigns.length}
          />
          <RecordTable
            title={tr('Work we pay for', 'الأعمال المدفوعة')}
            href="/crm/campaigns"
            columns={[tr('Piece', 'المحتوى'), tr('Campaign', 'الحملة'), t('contact360.colStatus'), t('contact360.colDue'), tr('Our cost', 'التكلفة علينا'), tr('Billed', 'الفوترة')]}
            rows={deliverables.slice(0, 15).map((d) => [
              [d.title, d.platform].filter(Boolean).join(' · '),
              <Link key={d.id} href={`/crm/campaigns?campaign=${encodeURIComponent(d.campaignId)}`} className="text-primary hover:underline">{d.campaignName}</Link>,
              status(d.status),
              day(d.dueDate),
              d.cost === undefined ? hiddenText(language) : d.cost != null ? money(d.cost) : empty,
              d.vendorBillId ? tr('Bill raised', 'صدرت فاتورة') : tr('Not billed yet', 'لم تُفوتر بعد'),
            ])}
            total={deliverables.length}
          />
          {campaigns.length + deliverables.length === 0 && <EmptyTab text={tr('No campaigns yet.', 'لا توجد حملات بعد.')} />}
        </TabsContent>

        {/* Influencer */}
        {isInfluencer && (
          <TabsContent value="influencer" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium"><Users className="h-4 w-4" />{tr('Influencer profile', 'ملف المؤثر')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat icon={<Users className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-400" />} label={tr('Followers', 'المتابعون')} value={totalFollowers(c) ? compact(totalFollowers(c)) : empty} />
                  <Stat icon={<TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />} label={tr('Engagement', 'التفاعل')} value={c.engagementRate != null ? `${c.engagementRate}%` : empty} />
                  <Stat icon={<BadgeCheck className="h-4 w-4 text-sky-600 dark:text-sky-400" />} label={tr('Niche', 'المجال')} value={c.influencerNiche || empty} />
                  <Stat
                    icon={<Receipt className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                    label={tr('Rate card', 'قائمة الأسعار')}
                    value={!canSeePricing && c.rateCardAmount == null ? hiddenText(language) : c.rateCardAmount != null ? money(c.rateCardAmount) : empty}
                  />
                </div>
                {(c.influencerAccounts || []).length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(c.influencerAccounts || []).map((acc) => (
                      <div key={acc.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{acc.platform}</span>
                            {acc.handle && <span className="truncate text-xs text-muted-foreground" dir="ltr">{acc.handle}</span>}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {acc.followers ? `${compact(acc.followers)} ${tr('followers', 'متابع')}` : tr('No follower count', 'لا يوجد عدد متابعين')}
                            {acc.engagementRate != null ? ` · ${acc.engagementRate}%` : ''}
                          </p>
                        </div>
                        {acc.url && (
                          <a href={acc.url} target="_blank" rel="noreferrer" className="shrink-0 text-primary" title={tr('Open profile', 'فتح الحساب')}>
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    {tr('No social accounts recorded yet.', 'لا توجد حسابات اجتماعية مسجلة بعد.')}
                  </p>
                )}
              </CardContent>
            </Card>
            {canSeeWorkspace && <WorkspaceSection contactId={c.id} />}
          </TabsContent>
        )}

        {/* Conversation & portal */}
        <TabsContent value="conversation" className="space-y-4">
          {moduleOn('inbox') && <ContactConversation companyId={c.companyId} contactId={c.id} />}
          {canManagePortal && (['Influencer', 'Client'] as const).filter((r) => roles.includes(r)).map((r) => (
            <Card key={r}>
              <CardContent className="pt-6">
                <PortalAccessPanel contact={c} audience={r === 'Influencer' ? 'influencer' : 'client'} onContactChanged={onContactChanged} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Files */}
        <TabsContent value="files">
          <RecordSupportPanel companyId={c.companyId} entityType="contact" entityId={c.id} title={tr('Files and history', 'الملفات والسجل')} />
        </TabsContent>
      </Tabs>

      <ContactEditDialog
        contact={c}
        open={editOpen}
        onOpenChange={setEditOpen}
        users={users}
        onSaved={(updated) => { onContactChanged(updated); void load(true); }}
      />
      <LogActivityDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        contactId={c.id}
        contactName={c.name}
        onLogged={() => { void loadActivities(); void load(true); }}
      />
    </div>
  );
}

function Detail({ icon, label, value, dir }: { icon?: React.ReactNode; label: string; value?: string | null; dir?: 'ltr' }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</dt>
      <dd className="mt-0.5 truncate" dir={value ? dir : undefined}>{value || empty}</dd>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function EmptyTab({ text }: { text: string }) {
  return <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function RecordTable({
  title,
  href,
  columns,
  rows,
  total,
}: {
  title: string;
  href: string;
  columns: string[];
  rows: Array<Array<React.ReactNode>>;
  /** How many there are in all, when more than the rows shown. */
  total?: number;
}) {
  const { language } = useI18n();
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Link href={href} className="text-xs text-primary underline-offset-2 hover:underline">
          {language === 'ar' ? 'فتح القسم' : 'Open section'} →
        </Link>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>{columns.map((col) => <TableHead key={col}>{col}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, idx) => (
              <TableRow key={idx}>
                {r.map((cell, cidx) => <TableCell key={cidx} className="text-sm">{cell}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {total !== undefined && total > rows.length && (
          <p className="pt-2 text-xs text-muted-foreground">
            {language === 'ar' ? `يُعرض ${rows.length} من ${total}` : `Showing ${rows.length} of ${total}`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
