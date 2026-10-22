import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ink: "#292722", paper: "#faf7ef", brand: "#292722", terracotta: "#a33f27" },
    },
  },
  plugins: [],
} satisfies Config;
