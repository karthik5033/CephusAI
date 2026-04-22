import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#FFFFFF",
        surface: "#F8FAFC",
        border: "#E2E8F0",
        foreground: "#0F172A",
        gold: "#D97706",
        red: {
          DEFAULT: "#DC2626",
          500: "#DC2626",
        },
        blue: {
          DEFAULT: "#2563EB",
          500: "#2563EB",
        },
        green: {
          DEFAULT: "#059669",
          500: "#059669",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
