import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional, Matches } from "class-validator";

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export class UpdateBudgetLineDto {
  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  periodPhasing?: Record<string, unknown>;

  @ApiPropertyOptional({ type: String, description: "Decimal string" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  annualAmount?: string;
}
