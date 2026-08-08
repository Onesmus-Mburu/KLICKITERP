import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsObject, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateSponsorDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  contacts?: Record<string, unknown>;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  agreementFileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowsCashConversion?: boolean;
}

export class UpdateSponsorDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  contacts?: Record<string, unknown>;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  agreementFileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowsCashConversion?: boolean;
}

export class SponsorResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  contacts!: Record<string, unknown>;

  @ApiProperty({ format: "uuid", nullable: true })
  agreementFileId!: string | null;

  @ApiProperty()
  allowsCashConversion!: boolean;
}
