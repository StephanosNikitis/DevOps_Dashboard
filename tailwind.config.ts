import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Register the font CSS variables as Tailwind utilities.
      // After this, you can write className="font-jetbrains" or "font-rajdhani"
      // and Tailwind will output: font-family: var(--font-jetbrains)
      fontFamily: {
        jetbrains: ["var(--font-jetbrains)", "monospace"],
        rajdhani: ["var(--font-rajdhani)", "sans-serif"],
      },

      // Dashboard color palette
      colors: {
        surface: "#0d1117",   // card backgrounds
        base:    "#0a0e1a",   // page background
        border:  "#21262d",   // card borders
        muted:   "#8b949e",   // secondary text
      },
    },
  },
  plugins: [],
};

export default config;
