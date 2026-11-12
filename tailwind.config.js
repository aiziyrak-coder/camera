/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        page: '#F6F7F9',
        line: '#E7E9EE',
        ink: '#151B26',
        soft: '#5E6675',
        faint: '#98A0AE',
        brand: {
          DEFAULT: '#1F8A5B',
          dark: '#17704A',
          tint: '#E8F5EE',
        },
        ok: { DEFAULT: '#1F8A5B', tint: '#E8F5EE' },
        warn: { DEFAULT: '#B7791F', tint: '#FDF4E3' },
        bad: { DEFAULT: '#C2413A', tint: '#FCECEA' },
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(21,27,38,0.04), 0 1px 1px rgba(21,27,38,0.02)',
        lift: '0 12px 32px -8px rgba(21,27,38,0.18)',
      },
    },
  },
  plugins: [],
};
