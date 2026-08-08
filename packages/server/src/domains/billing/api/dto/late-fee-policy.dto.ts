import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Min, MaxLength } from "class-validator";
import { BILL_LATE_FEE_MODES, BillLateFeeMode } from "../../domain/bill-late-fee-policy.entity";

export class CreateLateFeePolicyDto {
  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ enum: BILL_LATE_FEE_MODES })
  @IsIn(BILL_LATE_FEE_MODES)
  mode!: BillLateFeeMode;

  @ApiProperty({
    type: "object",
    additionalProperties: true,
    description:
      "Mode-specific: FLAT {amount}, PERCENT {rate}, TIERED {tiers:[{minDaysOverdue,maxDaysOverdue?,amount?,rate?}]} — see LateFeePoliciesService's doc comment",
  })
  @IsObject()
  params!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  graceDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}

export class UpdateLateFeePolicyDto {
  @ApiPropertyOptional({ enum: BILL_LATE_FEE_MODES })
  @IsOptional()
  @IsIn(BILL_LATE_FEE_MODES)
  mode?: BillLateFeeMode;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  graceDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}

export class LateFeePolicyResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: BILL_LATE_FEE_MODES })
  mode!: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  params!: Record<string, unknown>;

  @ApiProperty()
  graceDays!: number;

  @ApiProperty()
  requiresApproval!: boolean;

  @ApiProperty()
  isActive!: boolean;
}
