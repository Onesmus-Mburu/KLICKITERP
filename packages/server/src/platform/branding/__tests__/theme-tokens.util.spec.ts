import { buildThemeCssVariables, ThemeTokens } from "../application/theme-tokens.util";

const SAMPLE_TOKENS: ThemeTokens = {
  colors: {
    primary: "#573399",
    secondary: "#FBF80D",
    accent: "#CFA22D",
    primaryLight: "#9371F8",
    primarySoft: "#A972FA",
    primaryLavender: "#CCACF4",
    surface: "#FDFDFE",
    dark: "#341E40",
    black: "#000000",
  },
  fontFamily: "Poppins, sans-serif",
  radius: { sm: "4px", md: "8px", lg: "16px", xl: "24px" },
  spacing: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px", xxl: "32px", xxxl: "48px" },
};

describe("buildThemeCssVariables", () => {
  it("produces the correct CSS-variable shape from a sample tokens jsonb (FR-BRND-001.1)", () => {
    expect(buildThemeCssVariables(SAMPLE_TOKENS)).toEqual({
      "--color-primary": "#573399",
      "--color-secondary": "#FBF80D",
      "--color-accent": "#CFA22D",
      "--color-primary-light": "#9371F8",
      "--color-primary-soft": "#A972FA",
      "--color-primary-lavender": "#CCACF4",
      "--color-surface": "#FDFDFE",
      "--color-dark": "#341E40",
      "--color-black": "#000000",
      "--font-family": "Poppins, sans-serif",
      "--radius-sm": "4px",
      "--radius-md": "8px",
      "--radius-lg": "16px",
      "--radius-xl": "24px",
      "--spacing-xs": "4px",
      "--spacing-sm": "8px",
      "--spacing-md": "12px",
      "--spacing-lg": "16px",
      "--spacing-xl": "24px",
      "--spacing-xxl": "32px",
      "--spacing-xxxl": "48px",
    });
  });

  it("reflects a different palette 1:1 (no hardcoded values leak through)", () => {
    const other: ThemeTokens = {
      ...SAMPLE_TOKENS,
      colors: { ...SAMPLE_TOKENS.colors, primary: "#112233", surface: "#ffffff" },
      fontFamily: "Inter, sans-serif",
    };

    const vars = buildThemeCssVariables(other);

    expect(vars["--color-primary"]).toBe("#112233");
    expect(vars["--color-surface"]).toBe("#ffffff");
    expect(vars["--font-family"]).toBe("Inter, sans-serif");
  });
});
