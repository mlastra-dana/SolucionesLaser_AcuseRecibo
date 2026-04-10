/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#2f41ff',
          orangeHover: '#1f2fd6',
          ink: '#f8fafc',
          muted: '#c2c8d4',
          surface: '#111827',
          background: '#151d2a',
          border: '#2b3546'
        }
      },
      boxShadow: {
        soft: '0 14px 36px rgba(47, 65, 255, 0.10)',
        card: '0 6px 18px rgba(0, 0, 0, 0.24)'
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem'
      }
    }
  },
  plugins: []
};
