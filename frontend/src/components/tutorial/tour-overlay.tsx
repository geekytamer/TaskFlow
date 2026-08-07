'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTour } from './tour-context';
import { useI18n } from '@/context/i18n-context';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PAD = 8;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function TourOverlay() {
  const { activeTour, currentStep, stepIndex, totalSteps, nextStep, prevStep, endTour } = useTour();
  const { language: locale, isRtl } = useI18n();
  const router = useRouter();
  const [rect, setRect] = React.useState<TargetRect | null>(null);
  const [tooltipPos, setTooltipPos] = React.useState({ top: 0, left: 0 });
  const tooltipRef = React.useRef<HTMLDivElement>(null);

  const positionFor = React.useCallback((el: Element | null) => {
    const TW = 340;
    const TH = 200;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!el) {
      // No target — center the card.
      setRect(null);
      setTooltipPos({ top: vh / 2 - TH / 2, left: vw / 2 - TW / 2 });
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const r = el.getBoundingClientRect();
    setRect({ x: r.left, y: r.top, width: r.width, height: r.height });

    let top: number;
    let left: number;
    const pos = currentStep?.position ?? 'auto';
    if (pos === 'right' || (pos === 'auto' && r.right + TW + 24 < vw)) {
      top = r.top + r.height / 2 - TH / 2;
      left = r.right + 16;
    } else if (pos === 'left' || (pos === 'auto' && r.left - TW - 24 > 0)) {
      top = r.top + r.height / 2 - TH / 2;
      left = r.left - TW - 16;
    } else if (pos === 'bottom' || (pos === 'auto' && r.bottom + TH + 24 < vh)) {
      top = r.bottom + 12;
      left = r.left + r.width / 2 - TW / 2;
    } else {
      top = r.top - TH - 12;
      left = r.left + r.width / 2 - TW / 2;
    }
    top = Math.max(12, Math.min(top, vh - TH - 12));
    left = Math.max(12, Math.min(left, vw - TW - 12));
    setTooltipPos({ top, left });
  }, [currentStep]);

  // Set up each step: navigate to its page, run its action (open a dialog),
  // then wait for the target to appear before spotlighting it.
  React.useEffect(() => {
    if (!currentStep || !activeTour) { setRect(null); return; }
    let cancelled = false;
    const desiredRoute = currentStep.route ?? activeTour.route;

    const run = async () => {
      setRect(null);
      // 1) Navigate to the right page if we're not already there.
      if (desiredRoute && window.location.pathname !== desiredRoute) {
        // Close any dialog/sheet a previous step opened before leaving.
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        router.push(desiredRoute);
        for (let i = 0; i < 40 && !cancelled; i++) {
          if (window.location.pathname === desiredRoute) break;
          await sleep(75);
        }
        await sleep(250); // let the destination render/fetch
      }
      if (cancelled) return;
      // 2) Perform the step action (e.g. open a dialog to walk through it).
      if (currentStep.action) {
        await sleep(currentStep.action.delay ?? 350);
        if (cancelled) return;
        const trigger = document.querySelector(currentStep.action.click) as HTMLElement | null;
        trigger?.click();
      }
      // 3) Poll for the target element (page + data + dialog take time).
      let el: Element | null = null;
      for (let i = 0; i < 40 && !cancelled; i++) {
        el = document.querySelector(currentStep.target);
        if (el) break;
        await sleep(100);
      }
      if (cancelled) return;
      positionFor(el); // el may be null (optional/role-gated) → centered card
    };
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, activeTour]);

  // Keep the spotlight aligned on scroll/resize.
  React.useEffect(() => {
    if (!currentStep) return;
    const remeasure = () => {
      const el = document.querySelector(currentStep.target);
      if (el) positionFor(el);
    };
    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', remeasure, true);
    return () => {
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure, true);
    };
  }, [currentStep, positionFor]);

  // Keyboard navigation
  React.useEffect(() => {
    if (!activeTour) return;
    const onKey = (e: KeyboardEvent) => {
      // Ignore the synthetic Escape the step setup dispatches to close dialogs —
      // only a real user keypress should end the tour.
      if (e.key === 'Escape' && e.isTrusted) endTour();
      if ((e.key === 'ArrowRight' || e.key === 'Enter') && e.isTrusted) nextStep();
      if (e.key === 'ArrowLeft' && e.isTrusted) prevStep();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTour, nextStep, prevStep, endTour]);

  if (!activeTour || !currentStep) return null;

  const content = locale === 'ar' ? currentStep.ar : currentStep.en;
  const tourName = locale === 'ar' ? activeTour.ar : activeTour.en;

  const rx = rect ? rect.x - PAD : 0;
  const ry = rect ? rect.y - PAD : 0;
  const rw = rect ? rect.width + PAD * 2 : 0;
  const rh = rect ? rect.height + PAD * 2 : 0;

  return (
    <>
      {/* Backdrop with spotlight hole */}
      <div className="fixed inset-0 z-[9998]" onClick={nextStep} aria-hidden="true">
        <svg
          style={{ position: 'fixed', inset: 0, width: '100%', height: '100%' }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <mask id="tour-spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              {rect && (
                <rect x={rx} y={ry} width={rw} height={rh} rx={6} fill="black" />
              )}
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.55)"
            mask="url(#tour-spotlight-mask)"
          />
        </svg>
      </div>

      {/* Spotlight border ring */}
      {rect && (
        <div
          className="fixed z-[9999] rounded-md pointer-events-none"
          style={{
            top: ry,
            left: rx,
            width: rw,
            height: rh,
            boxShadow: '0 0 0 2px hsl(var(--primary))',
            transition: 'all 0.2s ease',
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="fixed z-[10000] w-80 rounded-xl border bg-card shadow-2xl"
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
          transition: 'all 0.2s ease',
          direction: isRtl ? 'rtl' : 'ltr',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            {tourName} · {stepIndex + 1}/{totalSteps}
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={endTour}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Progress bar */}
        <div className="mx-4 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="px-4 pt-3 pb-2">
          <h3 className="font-semibold text-base mb-1">{content.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{content.desc}</p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-4 pb-4 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={prevStep}
            disabled={stepIndex === 0}
            className="gap-1 text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {locale === 'ar' ? 'السابق' : 'Back'}
          </Button>

          <div className="flex gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${i === stepIndex ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`}
              />
            ))}
          </div>

          <Button size="sm" onClick={nextStep} className="gap-1 text-xs">
            {stepIndex === totalSteps - 1
              ? (locale === 'ar' ? 'إنهاء' : 'Finish')
              : (locale === 'ar' ? 'التالي' : 'Next')
            }
            {stepIndex < totalSteps - 1 && <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </>
  );
}
