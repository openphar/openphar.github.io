/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: '#F3F4EE',
        paperdeep: '#E9EBE1',
        ink: '#16241F',
        pine: '#0F3D33',
        moss: '#2E6B5E',
        wash: '#E4EBE5',
        brass: '#B08A3E',
        brasslight: '#D8C08A',
        oxblood: '#8F3B32',
        line: '#C9CFC5',
      },
      fontFamily: {
        display: ['"Fraunces Variable"', 'Georgia', 'serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
