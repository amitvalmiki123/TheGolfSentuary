/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Outfit', 'sans-serif'],
      },
      colors: {
        ink: '#060306',
        mauve: '#543551',
        gold: '#D5AA55',
        wine: '#572223',
        coral: '#C35445',
        violet: '#A154D6',
        deep: '#6A418E',
        cream: '#E9CDC2',
      },
      backgroundImage: {
        'grad-card': 'linear-gradient(135deg, rgba(84,53,81,0.8), rgba(87,34,35,0.8))',
      }
    },
  },
  plugins: [],
}
