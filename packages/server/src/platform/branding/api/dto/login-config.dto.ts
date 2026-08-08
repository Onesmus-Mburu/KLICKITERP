import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

/** Mirrors `ThemeLoginConfig` (application/theme-config.types.ts) — FR-BRND-002.1 "Login page" section. */
export class LoginConfigDto {
  @ApiPropertyOptional({ format: "uuid", description: "file_object.id of the login page background image" })
  @IsOptional()
  @IsUUID()
  backgroundImageFileId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  welcomeText?: string;
}
