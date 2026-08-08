import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUUID, Matches } from "class-validator";
import { INV_ITEM_TYPES, InvItemType } from "../../domain/inv-item.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateItemDto {
  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  categoryId!: string;

  @ApiProperty()
  @IsString()
  uom!: string;

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  uomConversions?: Record<string, unknown>;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiProperty({ enum: INV_ITEM_TYPES })
  @IsIn(INV_ITEM_TYPES)
  itemType!: InvItemType;

  @ApiPropertyOptional({ type: String, description: "Decimal string, nullable" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  reorderLevel?: string;

  @ApiPropertyOptional({ type: String, description: "Decimal string, nullable" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  reorderQty?: string;

  @ApiPropertyOptional({ type: [String], format: "uuid", nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  preferredSupplierIds?: string[];

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  glAssetAccountId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  glExpenseAccountId!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "Required (with salePrice) for RESALE items — BR-INV-04" })
  @IsOptional()
  @IsUUID()
  glIncomeAccountId?: string;

  @ApiPropertyOptional({ type: String, description: "Decimal string, nullable — required (with glIncomeAccountId) for RESALE items — BR-INV-04" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  salePrice?: string;
}

export class UpdateItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  uom?: string;

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  uomConversions?: Record<string, unknown>;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ enum: INV_ITEM_TYPES })
  @IsOptional()
  @IsIn(INV_ITEM_TYPES)
  itemType?: InvItemType;

  @ApiPropertyOptional({ type: String, description: "Decimal string, nullable" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  reorderLevel?: string;

  @ApiPropertyOptional({ type: String, description: "Decimal string, nullable" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  reorderQty?: string;

  @ApiPropertyOptional({ type: [String], format: "uuid", nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  preferredSupplierIds?: string[];

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  glAssetAccountId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  glExpenseAccountId?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  glIncomeAccountId?: string;

  @ApiPropertyOptional({ type: String, description: "Decimal string, nullable" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  salePrice?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ItemResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ format: "uuid" })
  categoryId!: string;

  @ApiProperty()
  uom!: string;

  @ApiProperty({ nullable: true })
  barcode!: string | null;

  @ApiProperty({ enum: INV_ITEM_TYPES })
  itemType!: string;

  @ApiProperty({ type: String, nullable: true, description: "Decimal string" })
  reorderLevel!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Decimal string" })
  reorderQty!: string | null;

  @ApiProperty({ format: "uuid" })
  glAssetAccountId!: string;

  @ApiProperty({ format: "uuid" })
  glExpenseAccountId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  glIncomeAccountId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Decimal string" })
  salePrice!: string | null;

  @ApiProperty({ type: String, description: "Decimal string, scale 6" })
  avgCost!: string;

  @ApiProperty()
  isActive!: boolean;
}
