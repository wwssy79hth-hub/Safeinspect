import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' }
    },
    extend: {
      colors: {
        brand: {
          blue:   '#1a3a5c',
          orange: '#f97316',
          light:  '#2563eb',
        },
        status: {
          compliant:             '#16a34a',
          'compliant-bg':        '#dcfce7',
          noncompliant:          '#dc2626',
          'noncompliant-bg':     '#fee2e2',
          recommendation:        '#d97706',
          'recommendation-bg':   '#fef3c7',
          na:                    '#64748b',
          'na-bg':               '#f1f5f9',
        },
        priority: { 1: '#dc2626', 2: '#d97706', 3: '#ca8a04' },
        surface: {
          base:    '#0f172a',
          raised:  '#1e293b',
          overlay: '#334155',
          border:  '#475569',
        },
        border:     'hsl(var(--border))',
        input:      'hsl(var(--input))',
        ring:       'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary:    { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary:  { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive:{ DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted:      { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent:     { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card:       { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      fontFamily: {
        sans:    ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Barlow Condensed', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'field-label': ['0.8125rem', { lineHeight: '1.25rem', letterSpacing: '0.05em' }],
        'field-value': ['1rem',      { lineHeight: '1.5rem' }],
      },
      spacing: {
        'touch':    '48px',
        'touch-lg': '56px',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down':  { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up':    { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'slide-up':        { from: { transform: 'translateY(100%)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        'fade-in':         { from: { opacity: '0' }, to: { opacity: '1' } },
        'pulse-orange':    {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(249,115,22,0.4)' },
          '50%':       { boxShadow: '0 0 0 8px rgba(249,115,22,0)' },
        },
        'slide-down': {
          from: { transform: 'translateY(-100%)', opacity: '0' },
          to:   { transform: 'translateY(0)',     opacity: '1' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        'slide-up':       'slide-up 0.3s ease-out',
        'fade-in':        'fade-in 0.2s ease-out',
        'pulse-orange':   'pulse-orange 2s infinite',
        'slide-down':     'slide-down 0.25s ease-out',
      },
    },
  },
  plugins: [animate],
}

export default config
