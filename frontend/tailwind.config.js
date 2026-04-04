/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f4ff',
          100: '#e0eaff',
          200: '#c7d7fd',
          300: '#a5bbfb',
          400: '#8098f8',
          500: '#5b73f3',
          600: '#3d52e8',
          700: '#2f3fd4',
          800: '#2a35ab',
          900: '#273287',
        },
        law: {
          blue: '#1e3a5f',
          gold: '#c9922a',
          light: '#f5f7fa',
        }
      },
      fontFamily: {
        sans: ['Noto Sans KR', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
