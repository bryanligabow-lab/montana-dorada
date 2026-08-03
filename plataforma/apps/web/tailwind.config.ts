import type { Config } from 'tailwindcss';

// Los colores de marca se inyectan por negocio vía CSS variables (ver lib/theme.ts).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: 'var(--c-primary)',
        accent: 'var(--c-accent)',
        surface: 'var(--c-card)',
        base: 'var(--c-bg)',
        ink: '#F1F8F3',
        muted: '#8AA694',
      },
    },
  },
  plugins: [],
} satisfies Config;
