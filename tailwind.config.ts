import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'studio-bg':        'rgb(var(--bg) / <alpha-value>)',
        'studio-surface':   'rgb(var(--surface) / <alpha-value>)',
        'studio-surface2':  'rgb(var(--surface2) / <alpha-value>)',
        'studio-raised':    'rgb(var(--raised) / <alpha-value>)',
        'studio-border':    'rgb(var(--border) / <alpha-value>)',
        'studio-border2':   'rgb(var(--border2) / <alpha-value>)',
        'studio-gold':      'rgb(var(--gold) / <alpha-value>)',
        'studio-gold-dim':  'rgb(var(--gold-dim) / <alpha-value>)',
        'studio-green':     'rgb(var(--green) / <alpha-value>)',
        'studio-green-soft': 'rgb(var(--green-soft) / <alpha-value>)',
        'studio-green-line': 'rgb(var(--green-line) / <alpha-value>)',
        'studio-red':       'rgb(var(--red) / <alpha-value>)',
        'studio-red-dark':  'rgb(var(--red-dark) / <alpha-value>)',
        'studio-orange':    'rgb(var(--orange) / <alpha-value>)',
        'studio-coral':     'rgb(var(--coral) / <alpha-value>)',
        'studio-blue':      'rgb(var(--blue) / <alpha-value>)',
        'studio-pink':      'rgb(var(--pink) / <alpha-value>)',
        'studio-text':      'rgb(var(--text) / <alpha-value>)',
        'studio-strong':    'rgb(var(--strong) / <alpha-value>)',
        'studio-soft':      'rgb(var(--soft) / <alpha-value>)',
        'studio-muted':     'rgb(var(--muted) / <alpha-value>)',
        'studio-faint':     'rgb(var(--faint) / <alpha-value>)',
        'studio-muted2':    'rgb(var(--muted2) / <alpha-value>)',
        'studio-ink':       'rgb(var(--ink) / <alpha-value>)',
      },
      fontFamily: {
        serif: ['Georgia', "'Times New Roman'", 'serif'],
      },
      maxWidth: {
        app: '640px',
      },
      backgroundImage: {
        'studio-gradient': 'radial-gradient(ellipse at 20% 10%, rgb(var(--grad1)) 0%, rgb(var(--bg2)) 60%, rgb(var(--bg)) 100%)',
      },
      keyframes: {
        pulseRec: {
          '0%, 100%': { boxShadow: '0 0 40px #FF444455', transform: 'scale(1)' },
          '50%':      { boxShadow: '0 0 60px #FF4444aa', transform: 'scale(1.06)' },
        },
        cdPop: {
          '0%':   { transform: 'scale(1.8)', opacity: '0' },
          '100%': { transform: 'scale(1)',   opacity: '1' },
        },
        spinSm: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        pulseRec: 'pulseRec 1s infinite',
        cdPop:    'cdPop 1s ease-out',
        spinSm:   'spinSm 0.7s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
