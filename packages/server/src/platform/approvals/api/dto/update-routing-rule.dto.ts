import { ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsInt, IsOptional, IsUUID, Matches, Min } from "class-validator";

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export class UpdateRoutingRuleDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  minAmount?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  maxAmount?: string | null;

  @ApiPropertyOptional({ type: [Number], nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  levelSubset?: number[] | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;
}
