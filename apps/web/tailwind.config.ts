import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/context/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#090D16",
        surface: {
          DEFAULT: "#0F172A",
          dim: "#090D16",
          bright: "#1E293B",
          container: "#1E293B",
          high: "#334155",
        },
        primary: {
          DEFAULT: "#0284C7",
          dark: "#0369A1",
          light: "#38BDF8",
        },
        status: {
          vacantClean: "#10B981",  // Emerald
          vacantDirty: "#F59E0B",  // Amber
          occupied: "#0284C7",     // Sky Blue
          maintenance: "#64748B",  // Muted Slate
          occupiedDirty: "#EF4444",// Coral Red
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
    },
  },
  plugins: [],
};

export default config;
