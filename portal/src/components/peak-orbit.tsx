import type { ReactNode } from 'react';

/**
 * Peak's orbit, after the hero on peak-creative.agency, cut down to what a
 * working tool can afford: a dark sphere, two hairline rings and two orange
 * points circling slowly. Pure CSS, no canvas; Reduce Motion stills it.
 * `glyph` is the small version for headings: one ring, one point, no sphere.
 */
export function PeakOrbit({ children, className = '', glyph = false }: { children?: ReactNode; className?: string; glyph?: boolean }) {
  if (glyph) {
    return (
      <span aria-hidden="true" className={`relative inline-block h-7 w-7 shrink-0 ${className}`}>
        <span className="absolute inset-0 rounded-full border border-ink/15" />
        <span className="orbit-spin-quick absolute inset-0">
          <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
        </span>
        <span className="absolute inset-[9px] rounded-full bg-accent/80" />
      </span>
    );
  }
  return (
    <div className={`relative isolate aspect-square ${className}`}>
      {/* The sphere: lit from the top, fading into the ground. */}
      <div
        aria-hidden="true"
        className="absolute inset-[14%] rounded-full"
        style={{
          background: 'radial-gradient(circle at 50% 28%, rgb(255 255 255 / 0.07), transparent 62%), radial-gradient(circle at 50% 50%, #121110, #050505 72%)',
          boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.06), 0 30px 80px -30px rgb(0 0 0 / 0.9)',
        }}
      />
      <div aria-hidden="true" className="orbit-spin absolute inset-[6%] rounded-full border border-ink/10">
        <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_12px_2px_rgb(238_113_3/0.45)]" />
      </div>
      <div aria-hidden="true" className="orbit-spin-slow absolute inset-0 rounded-full border border-dashed border-ink/[0.07]">
        <span className="absolute bottom-[14.6%] right-[14.6%] h-1.5 w-1.5 translate-x-1/2 translate-y-1/2 rounded-full bg-accent/70" />
      </div>
      <div className="orbit-arrive absolute inset-[22%] flex items-center justify-center">{children}</div>
    </div>
  );
}
