/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dnd: {
          navy: '#0D1117',
          surface: '#161B22',
          surface2: '#21262D',
          border: '#30363D',
          text: '#C9D1D9',
          muted: '#8B949E',
          gold: '#D2A017',
          red: '#F85149',
          green: '#238636',
          blue: '#58A6FF',
        }
      },
      fontFamily: {
        fantasy: ['Cinzel', 'serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
