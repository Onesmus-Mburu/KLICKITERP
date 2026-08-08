import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { GL_BUDGET_STATUSES } from "../../domain/gl-budget.entity";

export class BudgetResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  fiscalYearId!: string;

  @ApiProperty({ maxLength: 80 })
  name!: string;

  @ApiProperty({ maxLength: 20 })
  versionLabel!: string;

  @ApiProperty({ enum: GL_BUDGET_STATUSES })
  status!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  approvalRef!: string | null;
}

export class BudgetLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  budgetId!: string;

  @ApiProperty({ format: "uuid" })
  accountId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  costCenterId!: string | null;

  @ApiProperty({ type: "object", additionalProperties: true })
  periodPhasing!: Record<string, unknown>;

  @ApiProperty({ type: String, description: "Decimal string" })
  annualAmount!: string;
}
