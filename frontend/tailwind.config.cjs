const { palette, themePlugin } = require('./themePalette.cjs')

/** @type {import('tailwindcss').Config} */
// Tailwind 3 invalidates require.cache on changes. CommonJS keeps that working
// on Node versions that otherwise cache these files as native ES modules.
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        ...palette('fg'),
        sidebar: 'rgb(var(--sidebar) / <alpha-value>)',
      },
      backgroundColor: { ...palette('bg'), white: 'rgb(var(--surface) / <alpha-value>)' },
      gradientColorStops: { ...palette('bg'), white: 'rgb(var(--surface) / <alpha-value>)' },
      borderColor: { ...palette('line'), DEFAULT: 'rgb(var(--line-gray-200) / <alpha-value>)' },
      divideColor: palette('line'),
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [themePlugin],
}
