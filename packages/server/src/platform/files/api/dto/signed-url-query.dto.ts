import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";

/**
 * `expirySeconds` arrives as a query-string value (always `string | undefined`
 * at the HTTP boundary — no global `ValidationPipe`/`class-transformer`
 * coercion is wired up yet in this repo, matching `NumberingController.preview`'s
 * precedent of parsing `@Query()` strings by hand in the controller). Kept as
 * a small closed set of sane presets rather than an open numeric range so a
 * hand-parsed value can't produce a nonsensical (negative/absurdly large)
 * expiry without the pipe.
 */
export const SIGNED_URL_EXPIRY_PRESETS_SECONDS = ["60", "300", "900", "3600", "86400"] as const;

export class SignedUrlQueryDto {
  @ApiPropertyOptional({
    enum: SIGNED_URL_EXPIRY_PRESETS_SECONDS,
    default: "300",
    description: "Signed URL expiry in seconds",
  })
  @IsOptional()
  @IsIn(SIGNED_URL_EXPIRY_PRESETS_SECONDS)
  expirySeconds?: string;
}
