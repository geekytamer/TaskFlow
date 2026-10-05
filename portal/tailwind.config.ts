import type { Config } from 'tailwindcss';

/**
 * A colour from a CSS variable that still supports opacity modifiers
 * (`bg-accent/10`). A bare `var(--accent)` silently generates no class at all
 * for `/10`, which is how every tinted card and hover state went missing.
 */
const token = (name: string) => `color-mix(in srgb, var(--${name}) calc(<alpha-value> * 100%), transparent)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: Object.fromEntries(
        ['canvas', 'surface', 'surface-2', 'ink', 'ink-soft', 'line', 'field', 'accent', 'accent-ink', 'success', 'warning', 'danger'].map((name) => [name, token(name)]),
      ),
      borderRadius: { control: 'var(--radius-control)', panel: 'var(--radius-panel)' },
      boxShadow: { float: 'var(--shadow-float)' },
      fontFamily: { sans: ['var(--font-latin)', 'var(--font-arabic)', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};

export default config;
