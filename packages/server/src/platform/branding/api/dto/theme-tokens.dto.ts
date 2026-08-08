import { Type } from "class-transformer";
import { IsDefined, IsString, Matches, MaxLength, ValidateNested } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

const HEX_COLOR_PATTERN = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const HEX_COLOR_OPTS = { message: "must be a hex color, e.g. #573399" } as const;

/** Mirrors `ThemeColorTokens` (application/theme-tokens.util.ts) — FR-BRND-001.1 `--color-*` variables. */
export class ThemeColorsDto {
  @ApiProperty({ example: "#573399", description: "--color-primary" })
  @IsString()
  @Matches(HEX_COLOR_PATTERN, HEX_COLOR_OPTS)
  primary!: string;

  @ApiProperty({ example: "#FBF80D", description: "--color-secondary" })
  @IsString()
  @Matches(HEX_COLOR_PATTERN, HEX_COLOR_OPTS)
  secondary!: string;

  @ApiProperty({ example: "#CFA22D", description: "--color-accent" })
  @IsString()
  @Matches(HEX_COLOR_PATTERN, HEX_COLOR_OPTS)
  accent!: string;

  @ApiProperty({ example: "#9371F8", description: "--color-primary-light" })
  @IsString()
  @Matches(HEX_COLOR_PATTERN, HEX_COLOR_OPTS)
  primaryLight!: string;

  @ApiProperty({ example: "#A972FA", description: "--color-primary-soft" })
  @IsString()
  @Matches(HEX_COLOR_PATTERN, HEX_COLOR_OPTS)
  primarySoft!: string;

  @ApiProperty({ example: "#CCACF4", description: "--color-primary-lavender" })
  @IsString()
  @Matches(HEX_COLOR_PATTERN, HEX_COLOR_OPTS)
  primaryLavender!: string;

  @ApiProperty({ example: "#FDFDFE", description: "--color-surface" })
  @IsString()
  @Matches(HEX_COLOR_PATTERN, HEX_COLOR_OPTS)
  surface!: string;

  @ApiProperty({ example: "#341E40", description: "--color-dark" })
  @IsString()
  @Matches(HEX_COLOR_PATTERN, HEX_COLOR_OPTS)
  dark!: string;

  @ApiProperty({ example: "#000000", description: "--color-black" })
  @IsString()
  @Matches(HEX_COLOR_PATTERN, HEX_COLOR_OPTS)
  black!: string;
}

/** Mirrors `ThemeRadiusTokens` — CSS length values, e.g. "8px". */
export class ThemeRadiusDto {
  @ApiProperty({ example: "4px" })
  @IsString()
  @MaxLength(20)
  sm!: string;

  @ApiProperty({ example: "8px" })
  @IsString()
  @MaxLength(20)
  md!: string;

  @ApiProperty({ example: "16px" })
  @IsString()
  @MaxLength(20)
  lg!: string;

  @ApiProperty({ example: "24px" })
  @IsString()
  @MaxLength(20)
  xl!: string;
}

/** Mirrors `ThemeSpacingTokens` — Infoney default is the 4/8/12/16/24/32/48 px scale. */
export class ThemeSpacingDto {
  @ApiProperty({ example: "4px" })
  @IsString()
  @MaxLength(20)
  xs!: string;

  @ApiProperty({ example: "8px" })
  @IsString()
  @MaxLength(20)
  sm!: string;

  @ApiProperty({ example: "12px" })
  @IsString()
  @MaxLength(20)
  md!: string;

  @ApiProperty({ example: "16px" })
  @IsString()
  @MaxLength(20)
  lg!: string;

  @ApiProperty({ example: "24px" })
  @IsString()
  @MaxLength(20)
  xl!: string;

  @ApiProperty({ example: "32px" })
  @IsString()
  @MaxLength(20)
  xxl!: string;

  @ApiProperty({ example: "48px" })
  @IsString()
  @MaxLength(20)
  xxxl!: string;
}

/** Mirrors `ThemeTokens` (application/theme-tokens.util.ts) — `brnd_theme.tokens` jsonb shape (FR-BRND-001.1). */
export class ThemeTokensDto {
  @ApiProperty({ type: ThemeColorsDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ThemeColorsDto)
  colors!: ThemeColorsDto;

  @ApiProperty({ example: "Poppins, sans-serif" })
  @IsString()
  @MaxLength(100)
  fontFamily!: string;

  @ApiProperty({ type: ThemeRadiusDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ThemeRadiusDto)
  radius!: ThemeRadiusDto;

  @ApiProperty({ type: ThemeSpacingDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ThemeSpacingDto)
  spacing!: ThemeSpacingDto;
}
