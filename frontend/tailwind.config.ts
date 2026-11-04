import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.ts"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)", ink: "var(--ink)", mute: "var(--mute)", sub: "var(--sub)",
        line: "var(--line)", card: "var(--card)", accent: "var(--accent)", "accent-ink": "var(--accent-ink)",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"], mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"] },
      letterSpacing: { tightest: "-0.035em" },
    },
  },
  plugins: [],
} satisfies Config;
