import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ink: "#1d2848", paper: "#ffffff", brand: "#1d2848", cobalt: "#2d3ee9", "brand-soft": "#f2f5ff" },
    },
  },
  plugins: [],
} satisfies Config;
