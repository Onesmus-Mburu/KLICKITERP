import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsPositive, IsString, IsUUID, Matches } from "class-validator";
import { FA_ASSET_FUNDING_SOURCES, FA_ASSET_STATUSES, FaAssetFundingSource } from "../../domain/fa-asset.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateFaAssetDto {
  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  serialNo?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiProperty()
  @IsString()
  location!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  custodianUserId?: string;

  @ApiProperty({ type: String, format: "date" })
  @IsDateString()
  acquisitionDate!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  cost!: string;

  @ApiProperty({ enum: FA_ASSET_FUNDING_SOURCES })
  @IsIn(FA_ASSET_FUNDING_SOURCES)
  fundingSource!: FaAssetFundingSource;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  poId?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  grnId?: string;

  @ApiProperty({ type: String, format: "date" })
  @IsDateString()
  inServiceFrom!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @IsPositive()
  lifeMonthsOverride?: number;

  @ApiPropertyOptional({ type: String, description: "Decimal string — derived from category.residual_pct × cost when omitted" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  residualValue?: string;

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  insurance?: Record<string, unknown>;

  @ApiPropertyOptional({ description: "Defaults to 'GOOD'" })
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiPropertyOptional({ type: [String], format: "uuid", nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  photos?: string[];
}

export class UpdateFaAssetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  serialNo?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  custodianUserId?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @IsPositive()
  lifeMonthsOverride?: number;

  @ApiPropertyOptional({ type: String, description: "Decimal string" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  residualValue?: string;

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  insurance?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiPropertyOptional({ type: [String], format: "uuid", nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  photos?: string[];
}

export class UpdateFaAssetConditionDto {
  @ApiProperty()
  @IsString()
  condition!: string;
}

export class FaAssetResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ format: "uuid" })
  categoryId!: string;

  @ApiProperty({ nullable: true })
  serialNo!: string | null;

  @ApiProperty({ nullable: true })
  barcode!: string | null;

  @ApiProperty()
  location!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  custodianUserId!: string | null;

  @ApiProperty({ type: String, format: "date" })
  acquisitionDate!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  cost!: string;

  @ApiProperty({ enum: FA_ASSET_FUNDING_SOURCES })
  fundingSource!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  supplierId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  poId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  grnId!: string | null;

  @ApiProperty({ type: String, format: "date" })
  inServiceFrom!: string;

  @ApiProperty({ nullable: true })
  lifeMonthsOverride!: number | null;

  @ApiProperty({ type: String, description: "Decimal string" })
  residualValue!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  accumDepreciation!: string;

  @ApiProperty({ enum: FA_ASSET_STATUSES })
  status!: string;

  @ApiProperty({ type: Object, nullable: true })
  insurance!: Record<string, unknown> | null;

  @ApiProperty()
  condition!: string;

  @ApiProperty({ type: [String], nullable: true })
  photos!: string[] | null;
}
