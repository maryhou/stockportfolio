/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#f3f0ff',
          100: '#ebe5ff',
          200: '#d9ceff',
          300: '#bea6ff',
          400: '#9f76ff',
          500: '#8347ff',
          600: '#7023f7',
          700: '#6117e3',
          800: '#5113bf',
          900: '#43109c',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Noto Sans TC', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
