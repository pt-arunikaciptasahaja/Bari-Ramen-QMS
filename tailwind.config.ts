import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ink: "#24251f", paper: "#f7f6f2", brand: "#a9362d" },
      boxShadow: { soft: "0 4px 30px rgba(36,37,31,.04)" },
    },
  },
  plugins: [],
} satisfies Config;
