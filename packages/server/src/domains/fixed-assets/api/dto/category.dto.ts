import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsPositive, IsString, IsUUID, Matches } from "class-validator";
import { FA_CATEGORY_METHODS, FaCategoryMethod } from "../../domain/fa-category.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateFaCategoryDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: FA_CATEGORY_METHODS })
  @IsIn(FA_CATEGORY_METHODS)
  method!: FaCategoryMethod;

  @ApiProperty()
  @IsInt()
  @IsPositive()
  lifeMonths!: number;

  @ApiPropertyOptional({ type: String, description: "Decimal string, NUMERIC(9,6) — required when method='RB'" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  rate?: string;

  @ApiPropertyOptional({ type: String, description: "Decimal string 0..1, e.g. '0.1000' = 10%. Defaults to 0." })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  residualPct?: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  glCostAccountId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  glAccumDepAccountId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  glDepExpenseAccountId!: string;
}

export class UpdateFaCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: FA_CATEGORY_METHODS })
  @IsOptional()
  @IsIn(FA_CATEGORY_METHODS)
  method?: FaCategoryMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @IsPositive()
  lifeMonths?: number;

  @ApiPropertyOptional({ type: String, description: "Decimal string, NUMERIC(9,6)" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  rate?: string;

  @ApiPropertyOptional({ type: String, description: "Decimal string 0..1" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  residualPct?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  glCostAccountId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  glAccumDepAccountId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  glDepExpenseAccountId?: string;
}

export class FaCategoryResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: FA_CATEGORY_METHODS })
  method!: string;

  @ApiProperty()
  lifeMonths!: number;

  @ApiProperty({ type: String, nullable: true, description: "Decimal string" })
  rate!: string | null;

  @ApiProperty({ type: String, description: "Decimal string" })
  residualPct!: string;

  @ApiProperty({ format: "uuid" })
  glCostAccountId!: string;

  @ApiProperty({ format: "uuid" })
  glAccumDepAccountId!: string;

  @ApiProperty({ format: "uuid" })
  glDepExpenseAccountId!: string;
}
