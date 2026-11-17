const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        midnight: { 900: '#0f172a', 800: '#111827', 700: '#1f2937' },
        aqua: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#51dda8',
          500: '#34d399',
          600: '#10b981',
          700: '#0ea271',
          800: '#047857',
          900: '#064e3b',
        },
        bg: v('bg'),
        surface: { DEFAULT: v('surface'), 2: v('surface-2'), 3: v('surface-3') },
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        fg: { DEFAULT: v('fg'), muted: v('fg-muted'), subtle: v('fg-subtle') },
        accent: { DEFAULT: v('accent'), fg: v('accent-fg'), ink: v('accent-ink'), tint: 'rgb(var(--accent) / 0.15)' },
        success: { DEFAULT: v('success'), ink: v('success-ink'), tint: 'rgb(var(--success) / 0.15)' },
        warning: { DEFAULT: v('warning'), ink: v('warning-ink'), tint: 'rgb(var(--warning) / 0.16)' },
        danger: { DEFAULT: v('danger'), ink: v('danger-ink'), tint: 'rgb(var(--danger) / 0.15)' },
        cv: {
          bg: v('cv-bg'),
          grid: v('cv-grid'),
          'grid-major': v('cv-grid-major'),
          room: v('cv-room'),
          wall: v('cv-wall'),
          cover: v('cv-cover'),
          ring: v('cv-ring'),
          dim: v('cv-dim'),
          halo: v('cv-halo'),
        },
        zone: { regular: v('zone-regular'), exclusion: v('zone-exclusion'), entry: v('zone-entry') },
        target: { 1: v('target-1'), 2: v('target-2'), 3: v('target-3') },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        body: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        e1: '0 1px 2px rgb(0 0 0 / 0.20), 0 2px 8px rgb(0 0 0 / 0.12)',
        e2: '0 2px 4px rgb(0 0 0 / 0.24), 0 8px 24px rgb(0 0 0 / 0.18)',
      },
    },
  },
  plugins: [],
};
