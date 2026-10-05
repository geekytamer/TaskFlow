import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The portal's small set of building blocks, so every screen uses the same
 * button, panel and heading. Controls are 44px tall: phones come first.
 */

const base = 'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-control px-4 text-[15px] font-semibold transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60';

export const button = {
  primary: `${base} bg-accent text-accent-ink hover:bg-accent/90`,
  secondary: `${base} border border-field bg-surface text-ink hover:border-ink/60`,
  ghost: `${base} px-3 text-ink-soft hover:bg-ink/5 hover:text-ink`,
  danger: `${base} bg-danger text-canvas hover:bg-danger/90`,
} as const;

/** A text link with a full 44px touch target. */
export const textLink = 'inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline';

export const panel = 'rounded-panel border border-line bg-surface';

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="space-y-3">
      {back && (
        <Link href={back.href} className="-ms-1 inline-flex min-h-11 items-center gap-1 px-1 text-sm font-medium text-ink-soft hover:text-ink">
          <span aria-hidden="true" className="rtl:rotate-180">←</span>{back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
          {subtitle && <div className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function SectionTitle({ id, children, aside }: { id?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="text-base font-semibold">{children}</h2>
      {aside}
    </div>
  );
}

/** An empty state that says what will appear here and how to get it. */
export function EmptyState({ title, body, action }: { title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`${panel} px-5 py-8 sm:px-8`}>
      <p className="font-semibold">{title}</p>
      {body && <p className="mt-1.5 max-w-prose leading-relaxed text-ink-soft">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** A labelled figure, statement style: the number leads, the label explains. */
export function Figure({ label, value, hint, tone = 'ink', size = 'md' }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'ink' | 'danger' | 'success'; size?: 'md' | 'lg' }) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-ink';
  return (
    <div className="min-w-0">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className={`mt-1 font-semibold tracking-tight ${color} ${size === 'lg' ? 'text-[28px] leading-none' : 'text-xl leading-tight'}`}>{value}</dd>
      {hint && <dd className="mt-1 text-sm text-ink-soft">{hint}</dd>}
    </div>
  );
}

/** A tappable list row: whole row is the link, with a direction-aware chevron. */
export function RowLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={`group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-surface-2 sm:px-5 ${className}`}>
      <div className="min-w-0 flex-1">{children}</div>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m6 3 5 5-5 5" /></svg>
    </Link>
  );
}

export const list = `${panel} divide-y divide-line overflow-hidden`;
