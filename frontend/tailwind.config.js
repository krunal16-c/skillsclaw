/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff1ee",
          100: "#ffd5cb",
          200: "#ffab95",
          300: "#ff7158",
          400: "#f83f1d",
          500: "#d22a0e",
          600: "#a91f0a",
          700: "#7f1708",
          800: "#4f0e05",
          900: "#220603",
        },
        signal: {
          100: "#fff1bf",
          200: "#ffe06e",
          300: "#ffc92a",
        },
      },
      fontFamily: {
        sans: ["Space Grotesk", "system-ui", "sans-serif"],
        display: ["Sora", "Space Grotesk", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};
