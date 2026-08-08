import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

/** Mirrors `ThemeDocumentConfig` (application/theme-config.types.ts) — FR-BRND-002.1 "Documents" section (invoice/receipt/report header-footer, watermark, signatures). */
export class DocumentConfigDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  headerText?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  footerText?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  watermarkText?: string;

  @ApiPropertyOptional({ type: [String], format: "uuid", description: "file_object.id[] of signature images" })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  signatureFileIds?: string[];
}
