import { Type } from "class-transformer";
import { IsDefined, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DocumentConfigDto } from "./document-config.dto";
import { LoginConfigDto } from "./login-config.dto";
import { ThemeTokensDto } from "./theme-tokens.dto";

export class CreateThemeDto {
  @ApiProperty({ maxLength: 60 })
  @IsString()
  @MaxLength(60)
  name!: string;

  @ApiProperty({ type: ThemeTokensDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ThemeTokensDto)
  tokens!: ThemeTokensDto;

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
