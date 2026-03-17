/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#DD5736',
          orangeHover: '#C94D30',
          ink: '#111827',
          muted: '#6B7280',
          surface: '#FFFFFF',
          background: '#F5F7FA',
          border: '#E5E7EB'
        }
      },
      boxShadow: {
        soft: '0 10px 30px rgba(17, 24, 39, 0.06)',
        card: '0 4px 14px rgba(17, 24, 39, 0.06)'
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
