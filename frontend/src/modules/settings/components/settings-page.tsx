'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowUpRight, BellRing, Bot, Briefcase, Hash, Inbox, ListPlus, MessageCircle, Palette, Search, ShieldCheck, Stamp, Wrench,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/context/i18n-context';
import { usePermissions } from '@/context/permissions-context';
import { useCompany } from '@/context/company-context';
import { cn } from '@/lib/utils';
import { assistantStatusOnce } from '@/services/assistantService';
import { PositionTable } from '@/modules/companies/components/position-table';
import { BrandSettingsPanel } from '@/modules/branding/brand-settings-panel';
import { NumberingSettingsPanel } from './numbering-settings-panel';
import { CustomFieldsPanel } from './custom-fields-panel';
import { ApprovalRulesPanel } from './approval-rules-panel';
import { ClientRemindersPanel } from './client-reminders-panel';
import { WhatsappSettingsPanel } from './whatsapp-settings-panel';
import { WhatsappAutomationCard } from './whatsapp-automation-card';
import { ConversationSettingsPanel } from './conversation-settings-panel';
import { AssistantSettingsPanel } from './assistant-settings-panel';
import { DeveloperToolsPanel } from './developer-tools-panel';

type Pair = [en: string, ar: string];
type GroupId = 'company' | 'workflows' | 'channels' | 'system';

interface Section {
  id: string;
  group: GroupId;
  icon: LucideIcon;
  label: Pair;
  /** Words people search for, in both languages, beyond the label. */
  keywords: string;
  render: () => React.ReactNode;
}

const GROUPS: Array<{ id: GroupId; label: Pair }> = [
  { id: 'company', label: ['Company', 'الشركة'] },
  { id: 'workflows', label: ['Workflows', 'سير العمل'] },
  { id: 'channels', label: ['Channels', 'القنوات'] },
  { id: 'system', label: ['System', 'النظام'] },
];

/** Pages of their own that people look for in Settings. */
const ELSEWHERE: Array<{ href: string; icon: LucideIcon; label: Pair; keywords: string }> = [
  { href: '/settings/people', icon: ShieldCheck, label: ['People & roles', 'الأشخاص والأدوار'], keywords: 'users permissions access invite المستخدمين الصلاحيات دعوة' },
];

const norm = (s: string) => s.toLowerCase().replace(/[ً-ٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').trim();

/**
 * Settings as a place to find one thing fast: sections grouped on the side,
 * one section at a time, each with its own address (?section=approvals) so a
 * link or the back button lands on it. On phones the sections become a row
 * of chips under the title.
 */
export function SettingsPage() {
  const { t, language } = useI18n();
  const tr = React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]);
  const { selectedCompany, currentUser } = useCompany();
  const { can, canAdmin, moduleOn } = usePermissions();
  const router = useRouter();
  const params = useSearchParams();
  const [assistantOn, setAssistantOn] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const contentRef = React.useRef<HTMLDivElement>(null);
  const chipsRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { void assistantStatusOnce().then((s) => setAssistantOn(s.enabled)); }, []);

  const company = selectedCompany;
  const developer = process.env.NODE_ENV !== 'production' || Boolean(currentUser?.isSuperAdmin);

  const sections = React.useMemo<Section[]>(() => {
    const all: Array<Section | false | null | undefined> = [
      company && !company.isTraining && canAdmin('settings.edit_branding') && {
        id: 'brand', group: 'company', icon: Palette, label: ['Brand', 'الهوية'],
        keywords: 'logo colours colors font name theme شعار ألوان خط اسم', render: () => <BrandSettingsPanel />,
      },
      {
        id: 'numbering', group: 'company', icon: Hash, label: ['Numbering & controls', 'الترقيم والضوابط'],
        keywords: 'invoice numbers prefix sequence finance controls lock period ترقيم أرقام الفواتير بادئة الضوابط المالية', render: () => <NumberingSettingsPanel />,
      },
      company && {
        id: 'fields', group: 'company', icon: ListPlus, label: ['Custom fields', 'الحقول المخصصة'],
        keywords: 'extra fields form حقول إضافية نموذج', render: () => <CustomFieldsPanel />,
      },
      company && {
        id: 'positions', group: 'company', icon: Briefcase, label: ['Positions', 'المناصب'],
        keywords: 'job titles org chart hierarchy المسميات الوظيفية الهيكل',
        render: () => (
          <Card>
            <CardHeader>
              <CardTitle>{t('settingsPage.positionsTitle')}</CardTitle>
              <CardDescription>{t('settingsPage.positionsDesc').replace('{company}', company.name)}</CardDescription>
            </CardHeader>
            <CardContent><PositionTable companyId={company.id} /></CardContent>
          </Card>
        ),
      },
      company && {
        id: 'approvals', group: 'workflows', icon: Stamp, label: ['Approvals', 'الموافقات'],
        keywords: 'approve rules policy chain purchase order expense موافقة قواعد سياسة أمر شراء مصروف',
        render: () => <ApprovalRulesPanel canEdit={can('settings.manage_approvals')} />,
      },
      company && {
        id: 'reminders', group: 'workflows', icon: BellRing, label: ['Payment reminders', 'تذكيرات الدفع'],
        keywords: 'overdue invoices clients email remind متأخرة فواتير عملاء تذكير',
        render: () => <ClientRemindersPanel canEdit={can('invoices.edit')} />,
      },
      company && assistantOn && {
        id: 'assistant', group: 'workflows', icon: Bot, label: ['Assistant', 'المساعد'],
        keywords: 'ai bot chat automation learned examples log ذكاء مساعد محادثة سجل',
        render: () => <AssistantSettingsPanel canEdit={can('settings.edit')} />,
      },
      {
        id: 'whatsapp', group: 'channels', icon: MessageCircle, label: ['WhatsApp', 'واتساب'],
        keywords: 'green api instance phone messages رسائل هاتف welcome away auto reply ترحيب رد تلقائي', render: () => <div className="space-y-6"><WhatsappSettingsPanel /><WhatsappAutomationCard /></div>,
      },
      company && moduleOn('inbox') && {
        id: 'inbox', group: 'channels', icon: Inbox, label: ['Inbox response times', 'أوقات الرد'],
        keywords: 'conversations working hours target sla محادثات ساعات العمل',
        render: () => <ConversationSettingsPanel canEdit={can('inbox.edit_settings')} />,
      },
      developer && {
        id: 'developer', group: 'system', icon: Wrench, label: ['Developer tools', 'أدوات المطور'],
        keywords: 'database seed demo admin قاعدة بيانات تجريبية', render: () => <DeveloperToolsPanel />,
      },
    ];
    return all.filter((s): s is Section => Boolean(s));
  }, [company, canAdmin, can, moduleOn, assistantOn, developer, t]);

  const requested = params.get('section');
  const active = sections.find((s) => s.id === requested) ?? sections[0];

  const choose = (id: string) => {
    router.replace(`/settings?section=${id}`, { scroll: false });
    // Land on the section, not wherever the last one was scrolled to.
    const top = contentRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) contentRef.current?.scrollIntoView({ block: 'start' });
  };

  // Keep the chosen chip in view on phones.
  React.useEffect(() => {
    chipsRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active?.id]);

  const q = norm(query);
  const matches = (label: Pair, keywords: string) => !q || norm(`${label[0]} ${label[1]} ${keywords}`).includes(q);
  const shown = sections.filter((s) => matches(s.label, s.keywords));
  const elsewhere = ELSEWHERE.filter((e) => matches(e.label, e.keywords));

  const item = (s: Section) => {
    const on = s.id === active?.id;
    const Icon = s.icon;
    return (
      <li key={s.id}>
        <button
          type="button"
          onClick={() => choose(s.id)}
          aria-current={on ? 'page' : undefined}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-start text-sm transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            on ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          )}
        >
          <Icon className={cn('h-4 w-4 shrink-0', on ? 'text-primary' : 'text-muted-foreground')} />
          <span className="min-w-0 flex-1 truncate">{tr(...s.label)}</span>
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-headline text-3xl font-bold">{t('settings.title')}</h1>
        <p className="text-muted-foreground">
          {company ? tr(`Everything here applies to ${company.name}.`, `كل ما هنا يخص ${company.name}.`) : t('settings.subtitle')}
        </p>
      </header>

      {/* Phones: the sections as one row of chips that stays under the app bar. */}
      <div className="sticky top-14 z-10 -mx-4 bg-background px-4 py-2 md:hidden">
        <div ref={chipsRef} className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="navigation" aria-label={tr('Settings sections', 'أقسام الإعدادات')}>
          {sections.map((s) => {
            const on = s.id === active?.id;
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => choose(s.id)}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                  on ? 'border-primary/50 bg-primary/10 font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                <Icon className={cn('h-3.5 w-3.5', on && 'text-primary')} />
                {tr(...s.label)}
              </button>
            );
          })}
          {ELSEWHERE.map((e) => (
            <Link key={e.href} href={e.href} className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-sm text-muted-foreground">
              {tr(...e.label)}<ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-8 md:flex-row md:items-start">
        <nav aria-label={tr('Settings sections', 'أقسام الإعدادات')} className="hidden w-56 shrink-0 flex-col gap-5 md:sticky md:top-20 md:flex">
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && shown[0]) { choose(shown[0].id); setQuery(''); } }}
              placeholder={tr('Find a setting', 'ابحث عن إعداد')}
              aria-label={tr('Find a setting', 'ابحث عن إعداد')}
              className="h-8 ps-8 text-sm"
            />
          </div>
          {GROUPS.map((g) => {
            const inGroup = shown.filter((s) => s.group === g.id);
            const links = g.id === 'company' ? elsewhere : [];
            if (!inGroup.length && !links.length) return null;
            return (
              <div key={g.id} className="flex flex-col gap-1">
                <p className="px-2.5 text-xs font-medium text-muted-foreground">{tr(...g.label)}</p>
                <ul className="flex flex-col gap-0.5">
                  {inGroup.map(item)}
                  {links.map((e) => (
                    <li key={e.href}>
                      <Link href={e.href} className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <e.icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{tr(...e.label)}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 rtl:-scale-x-100" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {!shown.length && !elsewhere.length ? (
            <p className="px-2.5 text-sm text-muted-foreground">{tr('No setting matches. Try another word.', 'لا يوجد إعداد مطابق. جرّب كلمة أخرى.')}</p>
          ) : null}
        </nav>

        <div ref={contentRef} className="flex min-w-0 max-w-4xl flex-1 scroll-mt-20 flex-col gap-6">
          {active ? <React.Fragment key={active.id}>{active.render()}</React.Fragment> : null}
        </div>
      </div>
    </div>
  );
}
