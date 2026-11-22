/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      colors: {
        // Ilova: organik uslub — iliq krem fon + BITTA asosiy rang (mox yashil). Yashil/sariq/
        // qizil faqat holat belgilarida. Boshqa rang qo'shilmaydi.
        white: '#FFFDF8',
        page: '#FBF8F2',
        side: '#F3EEE3',
        sunk: '#ECE5D7',
        line: '#E3DBCB',
        ink: '#26281F',
        soft: '#5C5A4C',
        faint: '#9A9482',
        brand: {
          DEFAULT: '#557A46',
          dark: '#43633A',
          deep: '#2B3F27',
          tint: '#EEF3E8',
          line: '#D2DFC6',
        },
        ok: { DEFAULT: '#2E8B6A', tint: '#E8F4EE' },
        warn: { DEFAULT: '#B9801E', tint: '#FAF2E2' },
        bad: { DEFAULT: '#BF5136', tint: '#F9ECE6' },
      },
      borderRadius: {
        DEFAULT: '10px',
        md: '12px',
        lg: '14px',
        xl: '18px',
        '2xl': '24px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(60,50,30,0.04), 0 1px 1px rgba(60,50,30,0.02)',
        soft: '0 1px 2px rgba(60,50,30,0.05), 0 8px 24px -12px rgba(67,99,58,0.12)',
        lift: '0 0 0 1px rgba(60,50,30,0.06), 0 20px 48px -12px rgba(67,99,58,0.28)',
        pop: '0 0 0 1px rgba(60,50,30,0.07), 0 10px 28px -8px rgba(67,99,58,0.20)',
        btn: '0 1px 2px rgba(67,99,58,0.35), inset 0 1px 0 rgba(255,255,255,0.18)',
      },
    },
  },
  plugins: [],
};
