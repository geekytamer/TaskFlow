import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        line: 'var(--line)',
        field: 'var(--field)',
        accent: 'var(--accent)',
        danger: 'var(--danger)',
      },
      fontFamily: { sans: ['var(--font-latin)', 'var(--font-arabic)', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};

export default config;
