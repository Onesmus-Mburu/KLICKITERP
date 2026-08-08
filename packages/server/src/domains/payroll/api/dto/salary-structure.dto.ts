import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from "class-validator";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreatePyrlSalaryStructureDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 30, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  grade?: string;

  @ApiProperty()
  @IsDateString()
  effectiveFrom!: string;
}

export class UpdatePyrlSalaryStructureDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ maxLength: 30, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  grade?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class PyrlSalaryStructureResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  grade!: string | null;

  @ApiProperty()
  effectiveFrom!: string;
}

/**
 * `pyrl_structure_component.amount|formula` DTO shape, exactly one of
 * `amount` (`type='FIXED'`) or `rate` (`type='PERCENT_OF_BASIC'`) supplied
 * per `type` — mirrors `SalaryStructuresService`'s own
 * `StructureComponentFormula` contract word-for-word
 * (`salary-structures.service.ts`'s doc comment).
 */
export class StructureComponentLineDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  componentId!: string;

  @ApiProperty({ enum: ["FIXED", "PERCENT_OF_BASIC"] })
  @IsIn(["FIXED", "PERCENT_OF_BASIC"])
  type!: "FIXED" | "PERCENT_OF_BASIC";

  @ApiPropertyOptional({ type: String, description: "Decimal string KES amount — required when type=FIXED" })
  @ValidateIf((o: StructureComponentLineDto) => o.type === "FIXED")
  @Matches(DECIMAL_PATTERN)
  amount?: string;

  @ApiPropertyOptional({ type: String, description: "Decimal FRACTION (e.g. \"0.15\" for 15%) — required when type=PERCENT_OF_BASIC" })
  @ValidateIf((o: StructureComponentLineDto) => o.type === "PERCENT_OF_BASIC")
  @Matches(DECIMAL_PATTERN)
  rate?: string;
}

export class StructureComponentLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  structureId!: string;

  @ApiProperty({ format: "uuid" })
  componentId!: string;

  @ApiProperty({ type: String, nullable: true, description: "Decimal string — set when this line uses a FIXED amount" })
  amount!: string | null;

  @ApiProperty({ type: "object", additionalProperties: true, nullable: true, description: "{ type: 'PERCENT_OF_BASIC', rate: string } — set when this line uses a formula" })
  formula!: Record<string, unknown> | null;
}
