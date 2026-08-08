import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

export class CreateFeeCategoryDto {
  @ApiProperty({ maxLength: 60 })
  @IsString()
  @MaxLength(60)
  name!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  glIncomeAccountId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  taxable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}

export class UpdateFeeCategoryDto {
  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  glIncomeAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  taxable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}

export class FeeCategoryResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ format: "uuid" })
  glIncomeAccountId!: string;

  @ApiProperty()
  taxable!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  priority!: number;
}
