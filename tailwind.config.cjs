/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#d86c34',
          orangeHover: '#b95624',
          ink: '#14233d',
          navy: '#10213a',
          muted: '#5f6f86',
          surface: '#ffffff',
          background: '#f6f3ee',
          backgroundAlt: '#efe8dd',
          border: '#d8d2c7',
          sand: '#eadcc9',
          mist: '#edf2f6'
        }
      },
      boxShadow: {
        soft: '0 18px 50px rgba(16, 33, 58, 0.10)',
        card: '0 12px 28px rgba(16, 33, 58, 0.08)'
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
