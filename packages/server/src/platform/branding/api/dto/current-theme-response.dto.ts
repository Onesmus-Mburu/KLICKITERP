import { ApiProperty } from "@nestjs/swagger";
import { BrndThemeStatus } from "../../domain/brnd-theme.entity";
import { DocumentConfigDto } from "./document-config.dto";
import { LoginConfigDto } from "./login-config.dto";
import { ThemeTokensDto } from "./theme-tokens.dto";

const THEME_STATUSES: BrndThemeStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

/**
 * Response shape for the resolved token/config bundle — `ThemesService.preview()`
 * and the public `GET /branding/theme/current` (`ResolvedThemeBundle`,
 * application/theme-tokens.util.ts-adjacent). `cssVariables` is the flat
 * `--color-primary`/etc. map (FR-BRND-001.1) a login page or PDF renderer
 * consumes directly.
 */
export class CurrentThemeResponseDto {
  @ApiProperty({
    nullable: true,
    format: "uuid",
    type: String,
    description: "Null only for the hardcoded Infoney-default fallback (no brnd_theme row published yet)",
  })
  themeId!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: THEME_STATUSES })
  status!: BrndThemeStatus;

  @ApiProperty({ description: "True when this is the hardcoded fallback, not a real published brnd_theme row" })
  isFallback!: boolean;

  @ApiProperty({
    type: "object",
    additionalProperties: { type: "string" },
    description: "Flat CSS custom-property map, e.g. { '--color-primary': '#573399', ... }",
  })
  cssVariables!: Record<string, string>;

  @ApiProperty({ type: ThemeTokensDto })
  tokens!: ThemeTokensDto;

  @ApiProperty({ type: LoginConfigDto })
  loginConfig!: LoginConfigDto;

  @ApiProperty({ type: DocumentConfigDto })
  documentConfig!: DocumentConfigDto;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  logoFileId!: string | null;

  @ApiProperty({ nullable: true, format: "uuid", type: String })
  faviconFileId!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      "Signed MinIO URL for logoFileId, resolved in-process by ThemesService (never over HTTP, so the " +
      "files:file:view permission guard is never in the request path). Null when logoFileId is unset OR " +
      "resolution failed (a broken file reference must not break this whole public bundle).",
  })
  logoUrl!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: "Signed MinIO URL for faviconFileId — see logoUrl's doc comment for the resolution/null rules.",
  })
  faviconUrl!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      "Signed MinIO URL for loginConfig.backgroundImageFileId — see logoUrl's doc comment for the " +
      "resolution/null rules.",
  })
  loginBackgroundImageUrl!: string | null;

  @ApiProperty({ nullable: true, type: Date })
  publishedAt!: Date | null;
}
