'use client';

import * as React from 'react';
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

export function TourOverlay() {
  const { activeTour, currentStep, stepIndex, totalSteps, nextStep, prevStep, endTour } = useTour();
  const { language: locale, isRtl } = useI18n();
  const [rect, setRect] = React.useState<TargetRect | null>(null);
  const [tooltipPos, setTooltipPos] = React.useState({ top: 0, left: 0 });
  const tooltipRef = React.useRef<HTMLDivElement>(null);

  // Measure target element and position tooltip
  React.useEffect(() => {
    if (!currentStep) { setRect(null); return; }

    const measure = () => {
      const el = document.querySelector(currentStep.target);
      if (!el) { setRect(null); return; }
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const r = el.getBoundingClientRect();
      const target: TargetRect = { x: r.left, y: r.top, width: r.width, height: r.height };
      setRect(target);

      // Tooltip positioning
      const TW = 320;
      const TH = 180;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let top: number;
      let left: number;
      const pos = currentStep.position ?? 'auto';

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

      // Clamp to viewport
      top = Math.max(12, Math.min(top, vh - TH - 12));
      left = Math.max(12, Math.min(left, vw - TW - 12));
      setTooltipPos({ top, left });
    };

    const t = setTimeout(measure, 80);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [currentStep]);

  // Keyboard navigation
  React.useEffect(() => {
    if (!activeTour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour();
      if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep();
      if (e.key === 'ArrowLeft') prevStep();
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
