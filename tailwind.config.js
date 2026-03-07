/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#6366f1',
        secondary: '#6366f1',
        'accent-green': '#22c55e',
        'accent-red': '#ef4444',
        'accent-yellow': '#f59e0b',
        accent: {
          DEFAULT: '#6366f1',
          light: '#eef2ff',
          hover: '#4f46e5',
          green: '#22c55e',
          red: '#ef4444',
          yellow: '#f59e0b'
        }
      },
      borderColor: {
        DEFAULT: '#e4e4e7'
      },
      fontFamily: {
        sans: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      }
    }
  },
  plugins: []
};
