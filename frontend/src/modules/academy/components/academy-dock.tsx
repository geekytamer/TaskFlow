'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronUp, Circle, Compass, Lightbulb, LogOut, Scale, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useI18n } from '@/context/i18n-context';
import { useCompanyCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { getStatements, type AcademyImpact, type AcademyStatements, type StatementLine } from '@/services/academyService';
import { useAcademy } from '../academy-context';
import { EXPLAINERS, type Explainer } from '../lib/explainers';
import { GUIDES, type GuideStep } from '../lib/guides';

type Tr = (en: string, ar: string) => string;
const LEVEL_XP = 200;
const DOCK_COLLAPSED_KEY = 'taskflow_academy_dock_collapsed';

/** The figures the impact panel can show, in reading order. */
const IMPACT_ROWS: Array<{ key: keyof AcademyImpact; en: string; ar: string; goodWhenUp: boolean }> = [
  { key: 'cash', en: 'Cash and bank', ar: 'النقد والبنك', goodWhenUp: true },
  { key: 'receivables', en: 'Owed to you', ar: 'مستحق لك', goodWhenUp: true },
  { key: 'stock', en: 'Stock value', ar: 'قيمة المخزون', goodWhenUp: true },
  { key: 'payables', en: 'Owed to suppliers', ar: 'مستحق للمورّدين', goodWhenUp: false },
  { key: 'vatOwed', en: 'VAT owed', ar: 'ضريبة مستحقة', goodWhenUp: false },
  { key: 'inputVat', en: 'VAT to reclaim', ar: 'ضريبة قابلة للاسترداد', goodWhenUp: true },
  { key: 'commissionsOwed', en: 'Commissions owed', ar: 'عمولات مستحقة', goodWhenUp: false },
  { key: 'gratuityOwed', en: 'End-of-service owed', ar: 'نهاية خدمة مستحقة', goodWhenUp: false },
  { key: 'revenue', en: 'Revenue', ar: 'الإيرادات', goodWhenUp: true },
  { key: 'expenses', en: 'Expenses', ar: 'المصروفات', goodWhenUp: false },
  { key: 'profit', en: 'Profit', ar: 'الربح', goodWhenUp: true },
];

/**
 * Where an open dialog or sheet sits, or null when none is open. A modal blocks
 * clicks everywhere else, so while one is open the dock gives the screen to it
 * and shrinks to a note on the side the modal leaves free.
 */
function useOpenModal(): 'left' | 'right' | 'covered' | null {
  const [side, setSide] = React.useState<'left' | 'right' | 'covered' | null>(null);
  React.useEffect(() => {
    const check = () => {
      const open = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'))
        .filter((el) => !el.closest('[data-academy-dock]'));
      if (open.length === 0) { setSide(null); return; }
      const rect = open[open.length - 1].getBoundingClientRect();
      const modalOnRight = rect.left + rect.width / 2 >= window.innerWidth / 2;
      // The note is 16rem wide plus its margin; with less room than that on the free side it would cover the modal.
      const free = modalOnRight ? rect.left : window.innerWidth - rect.right;
      setSide(free < 288 ? 'covered' : modalOnRight ? 'right' : 'left');
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
    return () => observer.disconnect();
  }, []);
  return side;
}

/** The current step, small, out of the modal's way. Clicks pass through it. */
function ModalNote({ modalSide, step, title, tr }: { modalSide: 'left' | 'right'; step?: GuideStep; title: string; tr: Tr }) {
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-none fixed bottom-4 z-[55] hidden w-64 rounded-lg border bg-background/95 p-2.5 text-xs shadow-lg backdrop-blur sm:block',
        modalSide === 'right' ? 'left-4' : 'right-4',
      )}
    >
      <p className="flex items-center gap-1.5 font-semibold text-primary"><Sparkles className="h-3.5 w-3.5" /><span className="truncate" dir="auto">{title}</span></p>
      {step && <p className="mt-1 text-muted-foreground" dir="auto">{tr(step.en, step.ar)}</p>}
    </div>
  );
}

/** Why the step works the way it does: who sees it, what it does to the books, what is final. */
function HowItWorks({ explainer, tr }: { explainer: Explainer; tr: Tr }) {
  return (
    <details className="group mt-2 rounded-md border bg-muted/40 p-2 text-sm" open>
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
        <Lightbulb className="h-4 w-4 shrink-0 text-amber-500" />
        <span className="flex-1" dir="auto">{tr('How this works: ', 'كيف يعمل هذا: ')}{tr(explainer.title.en, explainer.title.ar)}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <p className="mt-1.5 text-muted-foreground" dir="auto">{tr(explainer.en, explainer.ar)}</p>
    </details>
  );
}

/**
 * A ring around the step's target that lets every click through, and a small
 * card with one instruction. Clicking the target moves to the next step.
 */
function Spotlight({ step, tr, onAdvance, onClose }: { step: GuideStep; tr: Tr; onAdvance: () => void; onClose: () => void }) {
  const [rect, setRect] = React.useState<DOMRect | null>(null);

  React.useEffect(() => {
    if (!step.target) { setRect(null); return; }
    let target: Element | null = null;
    const onClick = () => onAdvance();
    const find = () => {
      const el = document.querySelector(step.target!);
      if (el !== target) {
        target?.removeEventListener('click', onClick, true);
        target = el;
        target?.addEventListener('click', onClick, true);
      }
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 0 && r.height > 0 ? r : null);
    };
    find();
    const timer = window.setInterval(find, 400);
    window.addEventListener('resize', find);
    window.addEventListener('scroll', find, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', find);
      window.removeEventListener('scroll', find, true);
      target?.removeEventListener('click', onClick, true);
    };
  }, [step.target, onAdvance]);

  // Nothing to point at: the instruction stays in the dock.
  if (!rect) return null;
  const pad = 6;
  const below = rect.bottom + 140 < window.innerHeight;
  const cardTop = below ? rect.bottom + 12 : Math.max(12, rect.top - 100);
  const cardLeft = Math.max(12, Math.min(window.innerWidth - 332, rect.left));

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed z-[60] rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background transition-all duration-200 motion-safe:animate-pulse"
        style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
      />
      <div role="status" className="fixed z-[61] w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg" style={{ top: cardTop, left: cardLeft }}>
        <div className="flex items-start gap-2">
          <Compass className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="flex-1 leading-snug" dir="auto">{tr(step.en, step.ar)}</p>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label={tr('Hide the guide', 'إخفاء الدليل')}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}

/** The current step inside the dock, with a way to the right page. */
function NextStep({ step, tr }: { step: GuideStep; tr: Tr }) {
  const router = useRouter();
  const pathname = usePathname();
  const onRoute = !step.route || pathname === step.route.split('?')[0];
  return (
    <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-2 text-sm">
      <p className="flex items-start gap-2"><Compass className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span dir="auto">{tr(step.en, step.ar)}</span></p>
      {!onRoute && (
        <Button size="sm" variant="secondary" className="mt-2 h-8 w-full" onClick={() => router.push(step.route!)}>{tr('Take me there', 'خذني إلى هناك')}</Button>
      )}
    </div>
  );
}

/** The before → after figures for the objective that just completed. */
function ImpactPanel({ tr, onClose, onStatements }: { tr: Tr; onClose: () => void; onStatements: () => void }) {
  const { impact, impactBefore, justCompleted } = useAcademy();
  const { amount } = useCompanyCurrency();
  if (!justCompleted) return null;
  const changes = impact && impactBefore
    ? IMPACT_ROWS
      .map((r) => ({ ...r, before: Number(impactBefore[r.key]), after: Number(impact[r.key]) }))
      .filter((r) => Math.abs(r.after - r.before) >= 0.005)
    : [];
  return (
    <div className="border-b bg-emerald-50 p-3 dark:bg-emerald-950/40" role="status" aria-live="polite">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
        <p className="flex-1 text-sm font-semibold" dir="auto">{tr(`Done: ${justCompleted.title.en}`, `تم: ${justCompleted.title.ar}`)}</p>
        <button type="button" onClick={onClose} aria-label={tr('Close', 'إغلاق')} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      {changes.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{tr('No money moved: this step organises the work, not the books.', 'لم تتحرك أموال: هذه الخطوة تنظّم العمل لا الدفاتر.')}</p>
      ) : (
        <table className="mt-2 w-full text-xs tabular-nums">
          <tbody>
            {changes.map((c) => {
              const diff = c.after - c.before;
              const good = diff > 0 === c.goodWhenUp;
              return (
                <tr key={c.key}>
                  <td className="py-0.5 pe-2">{tr(c.en, c.ar)}</td>
                  <td className="py-0.5 pe-2 text-end text-muted-foreground"><bdi dir="ltr">{amount(c.before)} → {amount(c.after)}</bdi></td>
                  <td className={cn('py-0.5 text-end font-semibold', good ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
                    <bdi dir="ltr">{diff > 0 ? '+' : '−'}{amount(Math.abs(diff))}</bdi>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <Button size="sm" variant="link" className="h-7 px-0 text-xs" onClick={onStatements}>{tr('See it in the statements', 'شاهد ذلك في القوائم')}</Button>
    </div>
  );
}

function Lines({ rows, amount }: { rows: StatementLine[]; amount: (n: number) => React.ReactNode }) {
  return (
    <>
      {rows.map((l) => (
        <div key={l.code} className="flex justify-between gap-2 py-0.5 text-sm">
          <span className="text-muted-foreground"><span dir="ltr">{l.code}</span> {l.name}</span>
          <span className="tabular-nums">{amount(l.amount)}</span>
        </div>
      ))}
    </>
  );
}

/** A mini P&L and balance sheet that refresh as the trainee works. */
function StatementsSheet({ open, onOpenChange, tr }: { open: boolean; onOpenChange: (v: boolean) => void; tr: Tr }) {
  const { impact } = useAcademy();
  const { amount } = useCompanyCurrency();
  const [data, setData] = React.useState<AcademyStatements | null>(null);
  React.useEffect(() => {
    if (!open) return;
    getStatements().then(setData).catch(() => setData(null));
  }, [open, impact]);
  const total = (label: string, value: number) => (
    <div className="mt-1 flex justify-between border-t pt-1 text-sm font-semibold"><span>{label}</span><span className="tabular-nums">{amount(value)}</span></div>
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{tr('Practice company statements', 'قوائم الشركة التدريبية')}</SheetTitle>
          <p className="text-sm text-muted-foreground">{tr('Live from the books. They update as you complete each step.', 'مباشرة من الدفاتر. تتحدث مع كل خطوة تكملها.')}</p>
        </SheetHeader>
        {!data ? <p className="py-8 text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p> : (
          <div className="space-y-6 py-4">
            <section>
              <h3 className="mb-1 text-sm font-semibold">{tr('Profit and loss', 'الأرباح والخسائر')}</h3>
              <Lines rows={data.profitAndLoss.revenue} amount={amount} />
              {total(tr('Revenue', 'الإيرادات'), data.profitAndLoss.totalRevenue)}
              <div className="mt-2" />
              <Lines rows={data.profitAndLoss.expenses} amount={amount} />
              {total(tr('Expenses', 'المصروفات'), data.profitAndLoss.totalExpenses)}
              {total(tr('Profit', 'الربح'), data.profitAndLoss.netIncome)}
            </section>
            <section>
              <h3 className="mb-1 text-sm font-semibold">{tr('Balance sheet', 'الميزانية العمومية')}</h3>
              <Lines rows={data.balanceSheet.assets} amount={amount} />
              {total(tr('What the company has', 'ما تملكه الشركة'), data.balanceSheet.totalAssets)}
              <div className="mt-2" />
              <Lines rows={data.balanceSheet.liabilities} amount={amount} />
              <Lines rows={data.balanceSheet.equity} amount={amount} />
              <div className="flex justify-between gap-2 py-0.5 text-sm"><span className="text-muted-foreground">{tr('Profit so far', 'الربح حتى الآن')}</span><span className="tabular-nums">{amount(data.balanceSheet.currentProfit)}</span></div>
              {total(tr('What it owes + owner’s share', 'ما عليها + حصة المالك'), data.balanceSheet.totalLiabilitiesAndEquity)}
              <p className={cn('mt-2 text-xs', Math.abs(data.balanceSheet.totalAssets - data.balanceSheet.totalLiabilitiesAndEquity) < 0.01 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
                {Math.abs(data.balanceSheet.totalAssets - data.balanceSheet.totalLiabilitiesAndEquity) < 0.01
                  ? tr('Both sides match: the books balance.', 'الجانبان متساويان: الدفاتر متوازنة.')
                  : tr('The sides differ: something is unposted.', 'الجانبان مختلفان: هناك شيء غير مُرحّل.')}
              </p>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * The mission dock: shown while the trainee is in their practice company. It
 * tells the story, lists the objectives, guides the current one with a
 * spotlight, and shows what each completed step did to the books.
 */
export function AcademyDock() {
  const { inPractice, currentMission, progress, leavePractice, dismissCompleted, justCompleted } = useAcademy();
  const { language } = useI18n();
  const tr: Tr = React.useCallback((en, ar) => (language === 'ar' ? ar : en), [language]);
  // Remembered for the session; on narrower screens the dock starts folded so it does not cover the page.
  const [collapsed, setCollapsedState] = React.useState(false);
  React.useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DOCK_COLLAPSED_KEY);
      setCollapsedState(saved !== null ? saved === '1' : window.innerWidth < 1280);
    } catch { setCollapsedState(window.innerWidth < 1280); }
  }, []);
  // A finished mission is worth seeing: unfold to show what it did to the books.
  React.useEffect(() => { if (justCompleted) setCollapsedState(false); }, [justCompleted]);
  const setCollapsed = React.useCallback((next: boolean | ((c: boolean) => boolean)) => {
    setCollapsedState((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      try { sessionStorage.setItem(DOCK_COLLAPSED_KEY, value ? '1' : '0'); } catch { /* private mode */ }
      return value;
    });
  }, []);
  const [guiding, setGuiding] = React.useState(true);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [statements, setStatements] = React.useState(false);

  const objective = currentMission?.objectives.find((o) => !o.done) ?? null;
  const steps = React.useMemo(() => (objective && currentMission ? GUIDES[`${currentMission.id}/${objective.id}`] ?? [] : []), [objective, currentMission]);
  const objectiveKey = `${currentMission?.id}/${objective?.id}`;
  const explainer = EXPLAINERS[objectiveKey];
  const modalSide = useOpenModal();
  React.useEffect(() => { setStepIndex(0); setGuiding(true); }, [objectiveKey]);
  const advance = React.useCallback(() => setStepIndex((i) => Math.min(i + 1, Math.max(steps.length - 1, 0))), [steps.length]);
  // "Open X" steps are done once the trainee is on the page the next step works on.
  const pathname = usePathname();
  React.useEffect(() => {
    const next = steps[stepIndex + 1];
    if (next?.route && next.route.split('?')[0] === pathname) setStepIndex((i) => i + 1);
  }, [pathname, stepIndex, steps]);

  if (!inPractice || !progress) return null;
  const xpInLevel = progress.xp % LEVEL_XP;
  const allDone = progress.missions.every((m) => m.status === 'done');

  if (modalSide && !statements) {
    if (modalSide === 'covered') return null;
    const title = objective ? tr(objective.title.en, objective.title.ar) : currentMission ? tr(currentMission.title.en, currentMission.title.ar) : tr('Academy', 'الأكاديمية');
    return <ModalNote modalSide={modalSide} step={steps[stepIndex]} title={title} tr={tr} />;
  }

  return (
    <>
      {guiding && !collapsed && steps[stepIndex] && (
        <Spotlight step={steps[stepIndex]} tr={tr} onAdvance={advance} onClose={() => setGuiding(false)} />
      )}
      <aside
        data-academy-dock
        aria-label={tr('Academy mission', 'مهمة الأكاديمية')}
        className="fixed bottom-4 end-4 z-[55] w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-background shadow-xl"
      >
        <header className="flex items-center gap-2 border-b bg-primary px-3 py-2 text-primary-foreground">
          <Sparkles className="h-4 w-4" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" dir="auto">
              {allDone ? tr('All missions done', 'أُنجزت كل المهام') : currentMission ? tr(currentMission.title.en, currentMission.title.ar) : tr('Academy', 'الأكاديمية')}
            </p>
            <div className="mt-1 flex items-center gap-2 text-[11px] opacity-90">
              <span>{tr(`Level ${progress.level}`, `المستوى ${progress.level}`)}</span>
              <Progress value={(xpInLevel / LEVEL_XP) * 100} className="h-1.5 flex-1 bg-primary-foreground/25" />
              <span className="tabular-nums">{progress.xp} XP</span>
            </div>
          </div>
          <button type="button" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? tr('Expand', 'توسيع') : tr('Collapse', 'طي')} className="rounded p-1 hover:bg-primary-foreground/15">
            {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </header>
        {!collapsed && (
          <>
            {justCompleted && <ImpactPanel tr={tr} onClose={dismissCompleted} onStatements={() => setStatements(true)} />}
            {currentMission && (
              <div className="max-h-[50vh] overflow-y-auto p-3">
                <p className="text-sm text-muted-foreground" dir="auto">{tr(currentMission.story.en, currentMission.story.ar)}</p>
                <ol className="mt-3 space-y-1.5">
                  {currentMission.objectives.map((o) => {
                    const current = o.id === objective?.id;
                    return (
                      <li key={o.id} className={cn('flex items-start gap-2 rounded-md px-2 py-1 text-sm', current && 'bg-primary/10 font-medium')}>
                        {o.done
                          ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label={tr('Done', 'تم')} />
                          : <Circle className={cn('mt-0.5 h-4 w-4 shrink-0', current ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />}
                        <span className={cn(o.done && 'text-muted-foreground line-through')} dir="auto">{tr(o.title.en, o.title.ar)}</span>
                      </li>
                    );
                  })}
                </ol>
                {steps[stepIndex] && <NextStep step={steps[stepIndex]} tr={tr} />}
                {explainer && <HowItWorks key={objectiveKey} explainer={explainer} tr={tr} />}
              </div>
            )}
            {allDone && (
              <p className="p-3 text-sm text-muted-foreground">{tr('Every module is unlocked. Your practice company stays here to try things safely.', 'كل الوحدات مفتوحة. تبقى شركتك التدريبية هنا لتجربة الأشياء بأمان.')}</p>
            )}
            <footer className="flex flex-wrap items-center gap-1 border-t p-2">
              {steps.length > 0 && (
                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setStepIndex(0); setGuiding(true); }}>
                  <Compass className="me-1.5 h-4 w-4" />{tr('Show me', 'أرني')}
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setStatements(true)}>
                <Scale className="me-1.5 h-4 w-4" />{tr('Statements', 'القوائم')}
              </Button>
              <Button size="sm" variant="ghost" className="ms-auto h-8" onClick={leavePractice}>
                <LogOut className="me-1.5 h-4 w-4" />{tr('Leave practice', 'مغادرة التدريب')}
              </Button>
            </footer>
          </>
        )}
      </aside>
      <StatementsSheet open={statements} onOpenChange={setStatements} tr={tr} />
    </>
  );
}
