import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";
import { FA_VERIFICATION_STATUSES } from "../../domain/fa-verification.entity";

export class FaVerificationScopeDto {
  @ApiProperty({
    description: "'ALL' (every currently ACTIVE asset) or an explicit array of asset ids — see verification.service.ts's FaVerificationScope doc comment",
    oneOf: [{ type: "string", enum: ["ALL"] }, { type: "array", items: { type: "string", format: "uuid" } }],
  })
  assetIds!: string[] | "ALL";
}

export class CreateFaVerificationDto {
  @ApiProperty({ type: FaVerificationScopeDto })
  @ValidateNested()
  @Type(() => FaVerificationScopeDto)
  scope!: FaVerificationScopeDto;
}

export class RecordVerificationCountDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  lineId!: string;

  @ApiProperty()
  @IsBoolean()
  found!: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordVerificationCountsDto {
  @ApiProperty({ type: [RecordVerificationCountDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RecordVerificationCountDto)
  counts!: RecordVerificationCountDto[];
}

export class DecideFaVerificationDto {
  @ApiProperty({ enum: ["APPROVE", "RETURN"] })
  @IsIn(["APPROVE", "RETURN"])
  decision!: "APPROVE" | "RETURN";
}

export class FaVerificationResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ type: Object })
  scope!: Record<string, unknown>;

  @ApiProperty()
  snapshotAt!: Date;

  @ApiProperty({ enum: FA_VERIFICATION_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;
}

export class FaVerificationLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  verificationId!: string;

  @ApiProperty({ format: "uuid" })
  assetId!: string;

  @ApiProperty()
  found!: boolean;

  @ApiProperty({ nullable: true })
  condition!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;
}

export class PostFaVerificationResponseDto {
  @ApiProperty({ type: FaVerificationResponseDto })
  verification!: FaVerificationResponseDto;

  @ApiProperty({ type: [String], format: "uuid", description: "Missing-asset write-off proposals — asset ids with found=false at post time. Act on each via POST /fixed-assets/disposals with method=WRITE_OFF." })
  missingAssetIds!: string[];
}
