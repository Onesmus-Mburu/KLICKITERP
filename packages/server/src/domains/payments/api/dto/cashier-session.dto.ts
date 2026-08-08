import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { DECIMAL_PATTERN } from "./decimal.util";

export class OpenSessionDto {
  @ApiProperty({ maxLength: 30, description: "Till/register identifier" })
  @IsString()
  @MaxLength(30)
  till!: string;

  @ApiProperty({ type: String, description: "Opening float amount, decimal string" })
  @Matches(DECIMAL_PATTERN)
  floatAmount!: string;
}

export class CloseSessionApprovalDto {
  @ApiProperty({ format: "uuid" })
  @IsString()
  supervisorId!: string;

  @ApiProperty()
  @IsString()
  varianceReason!: string;
}

export class CloseSessionDto {
  @ApiProperty({
    type: Object,
    description: "PayReceiptSplitMethod -> physically counted decimal-string amount",
  })
  @IsObject()
  counted!: Record<string, string>;

  @ApiPropertyOptional({
    type: CloseSessionApprovalDto,
    description: "Required only when the computed variance exceeds Settings key payments.session_variance_tolerance (BR-PAY-05)",
  })
  @IsOptional()
  @IsObject()
  approval?: CloseSessionApprovalDto;
}

export class CashierSessionResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  cashierId!: string;

  @ApiProperty()
  till!: string;

  @ApiProperty({ enum: ["OPEN", "CLOSED"] })
  status!: string;

  @ApiProperty()
  openedAt!: Date;

  @ApiProperty({ type: String, description: "Decimal string" })
  floatAmount!: string;

  @ApiProperty({ nullable: true })
  closedAt!: Date | null;

  @ApiProperty({ type: Object, nullable: true })
  counted!: Record<string, unknown> | null;

  @ApiProperty({ type: Object, nullable: true })
  expectedTotals!: Record<string, unknown> | null;

  @ApiProperty({ type: String, nullable: true, description: "Decimal string" })
  varianceAmount!: string | null;

  @ApiProperty({ nullable: true })
  varianceReason!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  supervisorId!: string | null;
}
