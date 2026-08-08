import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional, IsUUID, Matches } from "class-validator";

/** `Money.fromDecimalString`'s accepted shape — matches this codebase's convention for decimal-string monetary DTO fields (see `platform/approvals/api/dto/routing-rule-input.dto.ts`). */
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/** Nested shape for one `gl_budget_line` row — used both inside `CreateBudgetDto.lines[]` and standalone (`AddBudgetLineDto`). */
export class BudgetLineInputDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  accountId!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  costCenterId?: string;

  @ApiProperty({ type: "object", additionalProperties: true, description: "Month-by-month/term-by-term spread — opaque to this pass" })
  @IsObject()
  periodPhasing!: Record<string, unknown>;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  annualAmount!: string;
}
