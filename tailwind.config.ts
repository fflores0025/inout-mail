import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./lib/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0A0A",       // fondo principal, casi negro
        paper: "#F3EFE7",     // texto/acento claro cálido (del logo sobre negro)
        line: "#232323",      // bordes y divisores sutiles
        muted: "#8C8577",     // texto secundario
        accent: "#C9A876",    // acento cálido, uso puntual (estados/CTA)
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      letterSpacing: {
        widest2: "0.28em",
      },
    },
  },
  plugins: [],
};

export default config;
