import type { ReactNode } from 'react';

/**
 * Peak's sky, after peak-creative.agency, cut to what a daily tool can carry:
 * a fixed layer of twinkling stars that drifts slowly, two orange nebulae
 * floating, and a shooting star now and then. Transforms and opacity only,
 * so it costs the page nothing while scrolling. Reduce Motion stills it.
 */

// A fixed scatter (no randomness, so the server and the browser draw the same sky).
const STARS = Array.from({ length: 42 }, (_, i) => ({
  x: (i * 37.3) % 100,
  y: (i * 61.7 + 13) % 100,
  size: 1 + (i % 3) * 0.6,
  delay: -((i * 0.73) % 3.8),
}));

export function CosmicSky() {
  return (
    <div aria-hidden="true" className="cosmic-sky">
      <div className="cosmic-nebula" style={{ top: '-22%', insetInlineEnd: '-12%', width: '46rem', height: '46rem', background: 'radial-gradient(circle, rgb(241 114 5 / 0.16), transparent 68%)' }} />
      <div className="cosmic-nebula" style={{ bottom: '-30%', insetInlineStart: '-10%', width: '38rem', height: '38rem', background: 'radial-gradient(circle, rgb(241 114 5 / 0.08), transparent 68%)', animationDelay: '-8s' }} />
      <div className="cosmic-map">
        {STARS.map((s, i) => (
          <i key={i} className="cosmic-star" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s` }} />
        ))}
      </div>
      <span className="cosmic-shoot" style={{ top: '16%', right: '-12%' }} />
      <span className="cosmic-shoot" style={{ top: '48%', right: '-16%', animationDelay: '-7s', animationDuration: '19s' }} />
    </div>
  );
}

/** A small four-point star that glints. */
export function Sparkle({ className = '', size = 18, delay = 0 }: { className?: string; size?: number; delay?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={`cosmic-burst ${className}`} style={{ animationDelay: `${delay}s` }}>
      <path d="M12 2l1.8 6.7L20 10l-6.2 1.6L12 18l-1.8-6.4L4 10l6.2-1.3z" />
    </svg>
  );
}

export interface Satellite { key: string; label: ReactNode; icon?: ReactNode; className: string }

/**
 * The Peak planet: a dark sphere holding the mark, two tilted rings with a
 * light on each, a breathing halo, and optional "satellites": pills that
 * float around it carrying the reader's own figures. `size` is the sphere's
 * diameter in px; everything else scales from it.
 */
export function PeakPlanet({ size = 280, mark, satellites = [], className = '' }: {
  size?: number; mark: ReactNode; satellites?: Satellite[]; className?: string;
}) {
  return (
    <div className={`relative flex items-center justify-center [perspective:900px] ${className}`} style={{ width: size * 1.7, height: size * 1.5, maxWidth: '100%' }}>
      <div aria-hidden="true" className="cosmic-halo absolute rounded-full" style={{ width: size * 1.6, height: size * 1.6, filter: 'blur(8px)', background: 'radial-gradient(circle, rgb(241 114 5 / 0.18), rgb(241 114 5 / 0.035) 38%, transparent 70%)' }} />
      <div aria-hidden="true" className="cosmic-ring-wide absolute rounded-full border border-white/[0.14]" style={{ width: size * 1.66, height: size * 0.54 }}>
        <i className="absolute left-1/2 top-[-4px] h-2 w-2 rounded-full bg-accent shadow-[0_0_16px_var(--accent)]" />
      </div>
      <div aria-hidden="true" className="cosmic-ring-tight absolute rounded-full border border-white/[0.12]" style={{ width: size * 0.94, height: size * 1.34 }}>
        <i className="absolute bottom-[-4px] right-1/2 h-[7px] w-[7px] rounded-full bg-white shadow-[0_0_17px_#fff]" />
      </div>
      <div className="cosmic-sphere relative grid place-items-center rounded-full border border-white/[0.06]"
        style={{ width: size, height: size, background: 'radial-gradient(circle at 40% 35%, rgb(255 255 255 / 0.06), rgb(13 13 13 / 0.55) 45%, rgb(5 5 5 / 0.94) 70%)', boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.06), 0 40px 90px -30px rgb(0 0 0 / 0.95)' }}>
        {mark}
      </div>
      <Sparkle className="absolute left-[16%] top-[12%] text-[#f2a33a]" size={size * 0.075} delay={0} />
      {satellites.map((s, i) => (
        <span key={s.key} className={`cosmic-satellite absolute inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-white/[0.12] bg-[rgb(12_12_12/0.8)] px-3.5 text-[13px] text-ink backdrop-blur-md ${s.className}`} style={{ animationDelay: `${-i * 2}s` }}>
          {s.icon ?? <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />}
          {s.label}
        </span>
      ))}
    </div>
  );
}
