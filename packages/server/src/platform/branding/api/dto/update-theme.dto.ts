import { Type } from "class-transformer";
import { IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { DocumentConfigDto } from "./document-config.dto";
import { LoginConfigDto } from "./login-config.dto";
import { ThemeTokensDto } from "./theme-tokens.dto";

/** Rejected by `ThemesService.update` once the theme's status is PUBLISHED — see that method's doc comment. */
export class UpdateThemeDto {
  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ type: ThemeTokensDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeTokensDto)
  tokens?: ThemeTokensDto;

  @ApiPropertyOptional({ type: LoginConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LoginConfigDto)
  loginConfig?: LoginConfigDto;

  @ApiPropertyOptional({ type: DocumentConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentConfigDto)
  documentConfig?: DocumentConfigDto;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  logoFileId?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  faviconFileId?: string;
}
