import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsDateString, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from "class-validator";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateQuotationLineDto {
  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  description!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  qty!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  unitPrice!: string;
}

export class CreateQuotationDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  requisitionId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  supplierId!: string;

  @ApiProperty()
  @IsDateString()
  quoteDate!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  documentFileId?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  terms?: string;

  @ApiProperty({ type: [CreateQuotationLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationLineDto)
  lines!: CreateQuotationLineDto[];
}

export class AwardQuotationDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  awardReason!: string;
}

export class QuotationResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  requisitionId!: string;

  @ApiProperty({ format: "uuid" })
  supplierId!: string;

  @ApiProperty()
  quoteDate!: string;

  @ApiProperty({ nullable: true })
  validUntil!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  documentFileId!: string | null;

  @ApiProperty({ type: String, description: "Decimal string" })
  total!: string;

  @ApiProperty({ nullable: true })
  terms!: string | null;

  @ApiProperty()
  isAwarded!: boolean;

  @ApiProperty({ nullable: true })
  awardReason!: string | null;
}

export class QuotationLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  quotationId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  itemId!: string | null;

  @ApiProperty()
  description!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  qty!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  unitPrice!: string;
}
