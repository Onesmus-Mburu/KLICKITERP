import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateThemeDto } from "../api/dto/create-theme.dto";
import { DocumentConfigDto } from "../api/dto/document-config.dto";
import { LoginConfigDto } from "../api/dto/login-config.dto";
import { ThemeTokensDto } from "../api/dto/theme-tokens.dto";

const VALID_TOKENS = {
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

describe("ThemeTokensDto validation", () => {
  it("accepts a well-formed tokens payload", async () => {
    const dto = plainToInstance(ThemeTokensDto, VALID_TOKENS);
    expect(await validate(dto)).toHaveLength(0);
  });

  it("rejects a non-hex color value", async () => {
    const dto = plainToInstance(ThemeTokensDto, {
      ...VALID_TOKENS,
      colors: { ...VALID_TOKENS.colors, primary: "not-a-color" },
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects a missing nested colors object", async () => {
    const { colors: _colors, ...withoutColors } = VALID_TOKENS;
    const dto = plainToInstance(ThemeTokensDto, withoutColors);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "colors")).toBe(true);
  });

  it("rejects a missing radius scale key", async () => {
    const { xl: _xl, ...radiusWithoutXl } = VALID_TOKENS.radius;
    const dto = plainToInstance(ThemeTokensDto, { ...VALID_TOKENS, radius: radiusWithoutXl });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "radius")).toBe(true);
  });
});

describe("LoginConfigDto validation", () => {
  it("accepts an empty object — every field is optional", async () => {
    const dto = plainToInstance(LoginConfigDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it("accepts a well-formed payload", async () => {
    const dto = plainToInstance(LoginConfigDto, {
      backgroundImageFileId: "018e5a1e-7b2c-7c3d-8b4a-1234567890ab",
      welcomeText: "Welcome to Klickit",
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it("rejects a non-UUID backgroundImageFileId", async () => {
    const dto = plainToInstance(LoginConfigDto, { backgroundImageFileId: "not-a-uuid" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "backgroundImageFileId")).toBe(true);
  });
});

describe("DocumentConfigDto validation", () => {
  it("accepts an empty object — every field is optional", async () => {
    const dto = plainToInstance(DocumentConfigDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it("accepts a well-formed payload with signature file ids", async () => {
    const dto = plainToInstance(DocumentConfigDto, {
      headerText: "Klickit School",
      footerText: "Thank you",
      watermarkText: "DRAFT",
      signatureFileIds: ["018e5a1e-7b2c-7c3d-8b4a-1234567890ab"],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it("rejects a non-UUID entry inside signatureFileIds", async () => {
    const dto = plainToInstance(DocumentConfigDto, { signatureFileIds: ["not-a-uuid"] });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "signatureFileIds")).toBe(true);
  });
});

describe("CreateThemeDto validation", () => {
  it("accepts a full, well-formed create payload", async () => {
    const dto = plainToInstance(CreateThemeDto, { name: "Custom Theme", tokens: VALID_TOKENS });
    expect(await validate(dto)).toHaveLength(0);
  });

  it("rejects a missing name", async () => {
    const dto = plainToInstance(CreateThemeDto, { tokens: VALID_TOKENS });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "name")).toBe(true);
  });

  it("rejects a missing tokens object", async () => {
    const dto = plainToInstance(CreateThemeDto, { name: "Custom Theme" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "tokens")).toBe(true);
  });

  it("propagates a nested tokens validation failure up through the create DTO", async () => {
    const dto = plainToInstance(CreateThemeDto, {
      name: "Custom Theme",
      tokens: { ...VALID_TOKENS, colors: { ...VALID_TOKENS.colors, primary: "bad" } },
    });
    const errors = await validate(dto);
    const tokensError = errors.find((e) => e.property === "tokens");
    expect(tokensError).toBeDefined();
  });
});
