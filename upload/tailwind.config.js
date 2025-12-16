/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/ui/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        'glass-black': 'rgba(18, 18, 18, 0.6)',
        'glass-border': 'rgba(255, 255, 255, 0.08)',
        'neon-accent': '#00f2ff',
        'neon-glow': 'rgba(0, 242, 255, 0.4)',
      },
      backdropBlur: {
        'xs': '2px',
        'lg': '16px',
      }
    }
  },
  plugins: [],
}
