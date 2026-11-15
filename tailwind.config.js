/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      colors: {
        // Ilova: sovuq neytral fon + BITTA asosiy rang (indigo). Yashil/sariq/
        // qizil faqat holat belgilarida. Boshqa rang qo'shilmaydi.
        page: '#FFFFFF',
        side: '#F5F7FB',
        sunk: '#EFF2F7',
        line: '#E3E7EF',
        ink: '#0F1422',
        soft: '#4B5567',
        faint: '#8D96A8',
        brand: {
          DEFAULT: '#3D5AF1',
          dark: '#2C45D0',
          deep: '#1E2A78',
          tint: '#EEF1FF',
          line: '#D5DCFF',
        },
        ok: { DEFAULT: '#1E9E5A', tint: '#EDF8F1' },
        warn: { DEFAULT: '#C98A12', tint: '#FBF6EA' },
        bad: { DEFAULT: '#D0453B', tint: '#FBEFEE' },
      },
      borderRadius: {
        DEFAULT: '6px',
        md: '7px',
        lg: '8px',
        xl: '10px',
        '2xl': '12px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,20,34,0.04), 0 1px 1px rgba(15,20,34,0.02)',
        soft: '0 1px 2px rgba(15,20,34,0.05), 0 8px 24px -12px rgba(30,42,120,0.12)',
        lift: '0 0 0 1px rgba(15,20,34,0.06), 0 20px 48px -12px rgba(30,42,120,0.28)',
        pop: '0 0 0 1px rgba(15,20,34,0.07), 0 10px 28px -8px rgba(30,42,120,0.20)',
        btn: '0 1px 2px rgba(44,69,208,0.35), inset 0 1px 0 rgba(255,255,255,0.18)',
      },
    },
  },
  plugins: [],
};
