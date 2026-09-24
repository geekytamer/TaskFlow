import type { InputHTMLAttributes } from 'react';

export function Field({ label, id, ...input }: { label: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>
      <input
        id={id}
        name={id}
        className="h-11 w-full rounded-[10px] border border-field bg-surface px-3.5 text-[15px] text-ink transition-colors hover:border-ink/60 focus-visible:border-ink"
        {...input}
      />
    </div>
  );
}

export const primaryButton =
  'inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-ink px-5 text-[15px] font-semibold text-white transition-[background-color,transform] hover:bg-ink/90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60';
