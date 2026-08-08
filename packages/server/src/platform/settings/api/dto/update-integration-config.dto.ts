import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpdateIntegrationConfigDto {
  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ type: "object", additionalProperties: true, description: "Replaces the entire credential payload — re-encrypted before storage" })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}
