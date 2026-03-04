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
        'studio-bg':       '#080812',
        'studio-surface':  '#12100a',
        'studio-surface2': '#0e0c08',
        'studio-border':   '#1e1c18',
        'studio-border2':  '#2a2418',
        'studio-gold':     '#E8C547',
        'studio-gold-dim': '#B8962A',
        'studio-green':    '#4ADE80',
        'studio-red':      '#FF4444',
        'studio-red-dark': '#CC2222',
        'studio-text':     '#E8E0D0',
        'studio-muted':    '#555555',
        'studio-muted2':   '#333333',
        'studio-soprano':  '#E8C547',
        'studio-alto':     '#FF9944',
        'studio-tenor':    '#4ADE80',
        'studio-basse':    '#6688FF',
      },
      fontFamily: {
        serif: ['Georgia', "'Times New Roman'", 'serif'],
      },
      maxWidth: {
        app: '640px',
      },
      backgroundImage: {
        'studio-gradient': 'radial-gradient(ellipse at 20% 10%, #1a1008 0%, #0a0a0f 60%, #080812 100%)',
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
