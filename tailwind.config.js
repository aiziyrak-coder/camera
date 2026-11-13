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
        // Ilova: oq-qora-kulrang. Rang faqat kichik holat nuqtalarida.
        page: '#FFFFFF',
        side: '#F7F7F8',
        sunk: '#F4F4F5',
        line: '#E7E7EA',
        ink: '#0A0A0B',
        soft: '#55555D',
        faint: '#9A9AA3',
        brand: {
          DEFAULT: '#111113',
          dark: '#000000',
          tint: '#F1F1F3',
        },
        ok: { DEFAULT: '#1E9E5A', tint: '#EFF8F2' },
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
        card: '0 1px 0 rgba(10,10,11,0.03)',
        lift: '0 0 0 1px rgba(10,10,11,0.06), 0 16px 40px -12px rgba(10,10,11,0.22)',
        pop: '0 0 0 1px rgba(10,10,11,0.07), 0 8px 24px -6px rgba(10,10,11,0.16)',
      },
    },
  },
  plugins: [],
};
