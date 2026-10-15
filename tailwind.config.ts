import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ink: "#0f172a", paper: "#f8fafc", brand: "#0f172a" },
    },
  },
  plugins: [],
} satisfies Config;
