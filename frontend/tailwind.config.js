/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0b0f',
        panel: '#12141a',
        border: '#1e2028',
        cyan: '#00d4ff',
        green: '#00ff88',
        red: '#ff3b5c',
        amber: '#ffaa00'
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['"DM Sans"', 'sans-serif']
      }
    }
  },
  plugins: []
};
