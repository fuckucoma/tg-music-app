export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      'var(--bg)',
        surface: 'var(--surface)',
        border:  'var(--border)',
        text:    'var(--text)',
        muted:   'var(--muted)',
        accent:  'var(--accent)',
        'accent-fg': 'var(--accent-fg)',
        danger:  '#ff4d4d',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
        display: ['Syne', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'eq1': { '0%,100%': { transform: 'scaleY(0.4)' }, '50%': { transform: 'scaleY(1)' } },
        'eq2': { '0%,100%': { transform: 'scaleY(1)' },   '50%': { transform: 'scaleY(0.4)' } },
        'eq3': { '0%,100%': { transform: 'scaleY(0.6)' }, '50%': { transform: 'scaleY(1)' } },
        'spin-slow': { to: { transform: 'rotate(360deg)' } },
        'slide-up': {
          '0%':   { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%':   { transform: 'scale(1.04)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-up':   'fade-up 0.2s ease both',
        'eq1':       'eq1 0.8s ease-in-out infinite',
        'eq2':       'eq2 0.8s ease-in-out infinite',
        'eq3':       'eq3 0.8s ease-in-out infinite',
        'spin-slow': 'spin-slow 0.7s linear infinite',
        'slide-up':  'slide-up 0.4s cubic-bezier(0.32,0.72,0,1)',
        'scale-in':  'scale-in 0.4s cubic-bezier(0.34,1.56,0.64,1)',
      },
    },
  },
  plugins: [],
}