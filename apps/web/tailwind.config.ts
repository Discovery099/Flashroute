import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fx: {
          bg: 'rgb(var(--fx-bg) / <alpha-value>)',
          surface: 'rgb(var(--fx-surface) / <alpha-value>)',
          'surface-strong': 'rgb(var(--fx-surface-strong) / <alpha-value>)',
          elevated: 'rgb(var(--fx-surface-elevated) / <alpha-value>)',
          border: 'rgb(var(--fx-border) / <alpha-value>)',
          'border-subtle': 'rgb(var(--fx-border-subtle) / <alpha-value>)',
          'text-primary': 'rgb(var(--fx-text-primary) / <alpha-value>)',
          'text-secondary': 'rgb(var(--fx-text-secondary) / <alpha-value>)',
          'text-muted': 'rgb(var(--fx-text-muted) / <alpha-value>)',
          positive: 'rgb(var(--fx-positive) / <alpha-value>)',
          negative: 'rgb(var(--fx-negative) / <alpha-value>)',
          warning: 'rgb(var(--fx-warning) / <alpha-value>)',
          info: 'rgb(var(--fx-info) / <alpha-value>)',
          accent: 'rgb(var(--fx-accent) / <alpha-value>)',
          grid: 'rgb(var(--fx-grid) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 24px 80px rgba(0, 0, 0, 0.35)',
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      spacing: {
        18: '4.5rem',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '0.5', transform: 'scale(0.95)' },
          '50%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
