/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "Arial", "sans-serif"]
      },
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.25rem" }]
      },
      colors: {
        jj: {
          black: "#0A0A0A",
          dark: "#131313",
          card: "#1A1A1A",
          yellow: "#FFC400",
          yellowDark: "#E0A800"
        }
      }
    }
  },
  plugins: []
};
