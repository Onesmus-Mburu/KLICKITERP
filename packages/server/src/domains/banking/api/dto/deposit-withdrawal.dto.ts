import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, Matches } from "class-validator";
import { BANK_DEPOSIT_WITHDRAWAL_STATUSES } from "../../domain/bank-deposit.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

/** Shared shape for `bank_deposit`/`bank_withdrawal` — the DDL's own mirror-image tables, see `BankDepositEntity`'s doc comment. */
export class CreateDepositOrWithdrawalDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  accountId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  slipRef?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "Links to a pay_cashier_session (FR-PAY-011.1) — reference only, no additional posting logic." })
  @IsOptional()
  @IsUUID()
  sourceSessionId?: string;
}

export class DepositOrWithdrawalResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ format: "uuid" })
  accountId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ nullable: true })
  slipRef!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  sourceSessionId!: string | null;

  @ApiProperty({ enum: BANK_DEPOSIT_WITHDRAWAL_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  ackBySender!: string | null;

  @ApiProperty({ type: Date, nullable: true })
  ackBySenderAt!: Date | null;

  @ApiProperty({ format: "uuid", nullable: true })
  ackByReceiver!: string | null;

  @ApiProperty({ type: Date, nullable: true })
  ackByReceiverAt!: Date | null;
}
