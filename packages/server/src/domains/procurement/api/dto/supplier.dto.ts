import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { PROC_SUPPLIER_STATUSES } from "../../domain/proc-supplier.entity";

export class CreateSupplierDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tradingName?: string;

  @ApiPropertyOptional({ maxLength: 15, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  kraPin?: string;

  @ApiPropertyOptional({ type: "object", additionalProperties: true, description: "Opaque contact payload; a top-level string `email` field, if present, is used for FR-PROC-008.1 remittance advice" })
  @IsOptional()
  @IsObject()
  contacts?: Record<string, unknown>;

  @ApiPropertyOptional({ type: "object", additionalProperties: true, description: "Opaque bank/M-Pesa payout details" })
  @IsOptional()
  @IsObject()
  paymentDetails?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String], maxItems: 40 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;
}

export class UpdateSupplierDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tradingName?: string;

  @ApiPropertyOptional({ maxLength: 15, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  kraPin?: string;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  contacts?: Record<string, unknown>;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  paymentDetails?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String], maxItems: 40 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;
}

export class BlacklistSupplierDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class SetManualRatingDto {
  @ApiProperty({ minimum: 1, maximum: 5, description: "1-5 manual score (FR-PROC-011.1)" })
  @IsNumber()
  @Min(1)
  @Max(5)
  score!: number;
}

export class SupplierResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  tradingName!: string | null;

  @ApiProperty({ nullable: true })
  kraPin!: string | null;

  @ApiProperty({ type: "object", additionalProperties: true })
  contacts!: Record<string, unknown>;

  @ApiProperty({ type: "object", additionalProperties: true })
  paymentDetails!: Record<string, unknown>;

  @ApiProperty({ type: [String] })
  categories!: string[];

  @ApiProperty()
  paymentTermsDays!: number;

  @ApiProperty({ enum: PROC_SUPPLIER_STATUSES })
  status!: string;

  @ApiProperty({ nullable: true })
  blacklistReason!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "1-5, NUMERIC(3,2)" })
  ratingDelivery!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "1-5, NUMERIC(3,2)" })
  ratingQuality!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "1-5, NUMERIC(3,2)" })
  ratingManual!: string | null;
}
