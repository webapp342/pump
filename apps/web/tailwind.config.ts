import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-geist-sans)",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: ["var(--font-geist-mono)", "SFMono-Regular", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["var(--text-2xs)", { lineHeight: "var(--leading-tight)" }],
        xs: ["var(--text-xs)", { lineHeight: "var(--leading-tight)" }],
        display: ["var(--text-display)", { lineHeight: "var(--leading-display)" }],
        h1: ["var(--text-h1)", { lineHeight: "var(--leading-heading)" }],
        h2: ["var(--text-h2)", { lineHeight: "var(--leading-heading)" }],
        h3: ["var(--text-h3)", { lineHeight: "var(--leading-heading)" }],
        title: ["var(--text-title)", { lineHeight: "var(--leading-heading)" }],
        body: ["var(--text-body)", { lineHeight: "var(--leading-body)" }],
        "body-sm": ["var(--text-body-sm)", { lineHeight: "var(--leading-body)" }],
        "body-lg": ["var(--text-body-lg)", { lineHeight: "var(--leading-tight)" }],
        caption: ["var(--text-caption)", { lineHeight: "var(--leading-caption)" }],
        label: ["var(--text-label)", { lineHeight: "var(--leading-label)" }],
        nav: ["var(--text-nav)", { lineHeight: "var(--leading-body)" }],
        "nav-bottom": ["var(--text-nav-bottom)", { lineHeight: "var(--leading-tight)" }],
        "metric-hero": ["var(--text-metric-hero)", { lineHeight: "var(--leading-tight)" }],
      },
      fontWeight: {
        body: "var(--weight-body)",
        ui: "var(--weight-ui)",
        emphasis: "var(--weight-emphasis)",
        strong: "var(--weight-strong)",
        metric: "var(--weight-metric)",
      },
      colors: {
        pump: {
          bg: "rgb(var(--pump-bg) / <alpha-value>)",
          surface: "rgb(var(--pump-surface) / <alpha-value>)",
          card: "rgb(var(--pump-card) / <alpha-value>)",
          cardSoft: "rgb(var(--pump-card-soft) / <alpha-value>)",
          border: "rgb(var(--pump-border) / <alpha-value>)",
          accent: {
            DEFAULT: "rgb(var(--pump-accent) / <alpha-value>)",
            strong: "rgb(var(--pump-accent-strong) / <alpha-value>)",
            foreground: "rgb(var(--pump-accent-foreground) / <alpha-value>)",
          },
          text: "rgb(var(--pump-text) / <alpha-value>)",
          muted: "rgb(var(--pump-muted) / <alpha-value>)",
          success: "rgb(var(--pump-success) / <alpha-value>)",
          danger: "rgb(var(--pump-danger) / <alpha-value>)",
          warning: "rgb(var(--pump-warning) / <alpha-value>)",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        panel: "0 10px 30px rgba(5, 12, 24, 0.12)",
        panelDark: "0 18px 40px rgba(0, 0, 0, 0.28)",
      },
    },
  },
  plugins: [],
};

export default config;
