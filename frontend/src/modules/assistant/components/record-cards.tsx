'use client';

/**
 * Records in an assistant reply, as cards: one on its own, several in a row
 * you swipe or scroll sideways. Any kind (task, invoice, client...); each card
 * opens the record in TaskFlow.
 */
import * as React from 'react';
import Link from 'next/link';
import {
  ArrowUpRight, Banknote, Box, Briefcase, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, FileText, FolderKanban,
  Megaphone, ReceiptText, ShoppingCart, Ship, Target, User, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import type { AssistantCard } from '@/services/assistantService';

type Tr = (en: string, ar: string) => string;

const KINDS: Record<string, { en: string; ar: string; icon: React.ComponentType<{ className?: string }> }> = {
  task: { en: 'Task', ar: 'مهمة', icon: CheckSquare },
  project: { en: 'Project', ar: 'مشروع', icon: FolderKanban },
  invoice: { en: 'Invoice', ar: 'فاتورة', icon: ReceiptText },
  quotation: { en: 'Quotation', ar: 'عرض سعر', icon: FileText },
  'sales-order': { en: 'Sales order', ar: 'أمر بيع', icon: ReceiptText },
  'purchase-order': { en: 'Purchase order', ar: 'أمر شراء', icon: ShoppingCart },
  'purchase-requisition': { en: 'Requisition', ar: 'طلب شراء', icon: ShoppingCart },
  'vendor-bill': { en: 'Bill', ar: 'فاتورة مورد', icon: Banknote },
  expense: { en: 'Expense', ar: 'مصروف', icon: Banknote },
  contact: { en: 'Contact', ar: 'جهة اتصال', icon: User },
  client: { en: 'Client', ar: 'عميل', icon: Briefcase },
  supplier: { en: 'Supplier', ar: 'مورد', icon: Briefcase },
  employee: { en: 'Employee', ar: 'موظف', icon: Users },
  'inventory-item': { en: 'Item', ar: 'صنف', icon: Box },
  item: { en: 'Item', ar: 'صنف', icon: Box },
  shipment: { en: 'Shipment', ar: 'شحنة', icon: Ship },
  opportunity: { en: 'Opportunity', ar: 'فرصة', icon: Target },
  campaign: { en: 'Campaign', ar: 'حملة', icon: Megaphone },
};

const kindOf = (kind: string) => KINDS[kind] ?? { en: kind.replace(/-/g, ' '), ar: kind.replace(/-/g, ' '), icon: FileText };

/** Status colour by meaning, whatever the record kind. */
function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (/(overdue|rejected|failed|cancel|blocked|lost)/.test(s)) return 'bg-destructive/10 text-destructive';
  if (/(done|paid|completed|approved|won|active|received|delivered)/.test(s)) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
  if (/(progress|sent|partial|review|waiting|pending|open)/.test(s)) return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
  return 'bg-muted text-muted-foreground';
}

function dateText(value: string, language: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(language === 'ar' ? 'ar' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function RecordCard({ card, tr, language, wide }: { card: AssistantCard; tr: Tr; language: string; wide?: boolean }) {
  const kind = kindOf(card.kind);
  const Icon = kind.icon;
  const overdue = card.date?.label === 'due' && new Date(card.date.value) < new Date() && !/(done|paid|completed|cancel)/i.test(card.status ?? '');
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{tr(kind.en, kind.ar)}</span>
        </span>
        {card.status ? <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', statusTone(card.status))}>{card.status}</span> : null}
      </div>
      <p className="line-clamp-2 text-sm font-semibold leading-snug">{card.title}</p>
      {card.subtitle ? <p className="line-clamp-1 text-xs text-muted-foreground">{card.subtitle}</p> : null}
      <div className="mt-auto flex flex-col gap-1 pt-1 text-xs">
        {card.amount ? <span className="text-base font-semibold tabular-nums">{formatCurrency(card.amount.value, card.amount.currency)}</span> : null}
        {card.date ? (
          <span className={cn('inline-flex items-center gap-1', overdue ? 'text-destructive' : 'text-muted-foreground')}>
            <CalendarDays className="h-3.5 w-3.5" />
            {card.date.label === 'due' ? tr('Due', 'الاستحقاق') : tr('Date', 'التاريخ')} {dateText(card.date.value, language)}
            {overdue ? ` · ${tr('overdue', 'متأخر')}` : ''}
          </span>
        ) : null}
        {card.people?.length ? (
          <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground"><Users className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{card.people.join('، ')}</span></span>
        ) : null}
      </div>
      {card.href ? (
        <span className="inline-flex items-center gap-1 pt-1 text-xs font-medium text-primary">
          {tr('Open', 'فتح')}<ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
        </span>
      ) : null}
    </>
  );
  const className = cn(
    'flex snap-start flex-col gap-1.5 rounded-xl border bg-card p-3.5 text-start shadow-sm transition-colors',
    wide ? 'w-full sm:max-w-sm' : 'w-[15.5rem] shrink-0',
    card.href && 'hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  );
  return card.href
    ? <Link href={card.href} className={className}>{body}</Link>
    : <div className={className}>{body}</div>;
}

export function RecordCards({ cards, tr, language }: { cards: AssistantCard[]; tr: Tr; language: string }) {
  const rail = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ start: true, end: false });
  const rtl = language === 'ar';

  const measure = React.useCallback(() => {
    const el = rail.current;
    if (!el) return;
    const travelled = Math.abs(el.scrollLeft);
    setEdges({ start: travelled < 4, end: travelled + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  React.useEffect(() => { measure(); }, [measure, cards.length]);

  if (cards.length === 1) return <RecordCard card={cards[0]} tr={tr} language={language} wide />;

  const scroll = (dir: 1 | -1) => {
    const el = rail.current;
    if (!el) return;
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * Math.round(el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{tr(`${cards.length} records`, `${cards.length} سجلات`)}</span>
        <div className="hidden gap-1 sm:flex">
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={edges.start} onClick={() => scroll(-1)} aria-label={tr('Previous', 'السابق')}>
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={edges.end} onClick={() => scroll(1)} aria-label={tr('Next', 'التالي')}>
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
        </div>
      </div>
      <div
        ref={rail}
        onScroll={measure}
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-1 pb-2 [scrollbar-width:thin]"
        role="list"
        aria-label={tr('Records', 'السجلات')}
      >
        {cards.map((c) => <div role="listitem" key={`${c.kind}:${c.id}`} className="contents"><RecordCard card={c} tr={tr} language={language} /></div>)}
      </div>
    </div>
  );
}
