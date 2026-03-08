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
        sheet: {
          bg: "#f8f9fa",
          surface: "#ffffff",
          border: "#e2e4e9",
          accent: "#1a73e8",
          "accent-dim": "#1557b0",
          text: "#1a1a1a",
          muted: "#6b7280",
          cell: "#ffffff",
          "cell-hover": "#f8f9fa",
          "cell-selected": "#e8f0fe",
          "cell-editing": "#ffffff",
          header: "#f1f3f4",
          "header-hover": "#e2e4e9",
        },
      },
      animation: {
        "pulse-save": "pulse-save 1.5s ease-in-out",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
      },
      keyframes: {
        "pulse-save": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { transform: "translateY(4px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;