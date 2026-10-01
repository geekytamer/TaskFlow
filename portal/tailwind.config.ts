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
        ['canvas', 'surface', 'ink', 'ink-soft', 'line', 'field', 'accent', 'danger'].map((name) => [name, token(name)]),
      ),
      fontFamily: { sans: ['var(--font-latin)', 'var(--font-arabic)', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};

export default config;
