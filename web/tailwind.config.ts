import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Light (Cosmos-inspired) palette
        cream: {
          DEFAULT: "#f1efe9",
          soft: "#eceae3",
          card: "#e6e3da",
        },
        ink: {
          DEFAULT: "#0e0e10",
          dim: "#5d5d64",
          faint: "#9c9ca3",
          line: "rgba(14,14,16,0.08)",
        },
        // Galaxy (dark) palette
        night: {
          DEFAULT: "#06070c",
          soft: "#0b0d14",
          card: "#13151f",
        },
        snow: {
          DEFAULT: "#efeee9",
          dim: "#9fa0a9",
          faint: "#5a5c6a",
        },
        dot: {
          red: "#e5484d",
          orange: "#f59e0b",
          green: "#30a46c",
          blue: "#3b82f6",
          purple: "#8b5cf6",
        },
      },
      fontFamily: {
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Instrument Serif"', '"Inter"', "ui-serif", "serif"],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      keyframes: {
        floatY: {
          "0%,100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        scrollY: {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(-50%)" },
        },
        scrollYRev: {
          "0%": { transform: "translateY(-50%)" },
          "100%": { transform: "translateY(0)" },
        },
        pulseDot: {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.55", transform: "scale(1.35)" },
        },
        popIn: {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        floatY: "floatY 7s ease-in-out infinite",
        scrollY: "scrollY 60s linear infinite",
        scrollYRev: "scrollYRev 60s linear infinite",
        pulseDot: "pulseDot 1.6s ease-in-out infinite",
        popIn: "popIn 0.45s cubic-bezier(.2,.9,.3,1.4)",
      },
    },
  },
  plugins: [],
};
export default config;
