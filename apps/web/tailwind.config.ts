import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * shadcn/ui-style config, CSS-variable-driven. Colors read `var(--x)`
 * directly (not wrapped in `hsl()`, shadcn's usual default) because the
 * real backend theme (`ThemeTokens`) ships hex, not HSL triplets — see
 * `src/lib/theme.ts`'s own doc comment for the full reasoning. Tailwind 3
 * (not 4) chosen deliberately per the approved plan, to keep the shadcn CLI
 * / JS-config path well-trodden.
 */
const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        brand: {
          primary: "var(--color-primary)",
          secondary: "var(--color-secondary)",
          accent: "var(--color-accent)",
          primaryLight: "var(--color-primary-light)",
          primarySoft: "var(--color-primary-soft)",
          primaryLavender: "var(--color-primary-lavender)",
          surface: "var(--color-surface)",
          dark: "var(--color-dark)",
          black: "var(--color-black)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        success: {
          DEFAULT: "var(--success)",
          foreground: "var(--success-foreground)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          foreground: "var(--warning-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        // Slice 1.5 (visual redesign) — soft-tint badge/icon-badge
        // backgrounds, `color-mix()`-derived in styles/tokens.css so they
        // track `--card`/`--color-*` per mode/tenant automatically.
        tint: {
          primary: "var(--tint-primary)",
          secondary: "var(--tint-secondary)",
          accent: "var(--tint-accent)",
          success: "var(--tint-success)",
          warning: "var(--tint-warning)",
          destructive: "var(--tint-destructive)",
        },
      },
      borderRadius: {
        xl: "var(--radius-xl)",
        lg: "var(--radius-lg)",
        md: "var(--radius, var(--radius-md))",
        sm: "var(--radius-sm)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
      spacing: {
        xs: "var(--spacing-xs)",
        brandSm: "var(--spacing-sm)",
        brandMd: "var(--spacing-md)",
        brandLg: "var(--spacing-lg)",
        brandXl: "var(--spacing-xl)",
        brandXxl: "var(--spacing-xxl)",
        brandXxxl: "var(--spacing-xxxl)",
      },
      fontFamily: {
        sans: ["var(--font-family)", "system-ui", "sans-serif"],
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  // Incidental bug found+fixed during Slice 1.5 (visual redesign): this was
  // an inline `require("tailwindcss-animate")` call — a latent ESM/CJS
  // interop landmine in a `.ts` config file (`ReferenceError: require is
  // not defined`) that had simply never been triggered before, since
  // nothing had touched this file since Slice 1's initial scaffold. Editing
  // this file to add the `tint`/`boxShadow` tokens above made Next reload
  // the Tailwind config via `tailwindcss`'s `loadConfig` (a synchronous
  // `require()` of the `.ts` file under Node's ESM loader), which is what
  // surfaced it — not something this pass introduced. Fixed by switching to
  // a real static ESM import (`tailwindcssAnimate`, above) instead.
  plugins: [tailwindcssAnimate],
};

export default config;
