import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ink: "#171717", paper: "#fafafa", brand: "#171717" },
    },
  },
  plugins: [],
} satisfies Config;
