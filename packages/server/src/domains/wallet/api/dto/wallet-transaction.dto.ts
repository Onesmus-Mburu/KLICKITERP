import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from "class-validator";
import { WALL_TRANSACTION_TYPES } from "../../domain/wall-transaction.entity";

const DECIMAL_STRING_PATTERN = /^\d+(\.\d{1,4})?$/;
const PAY_METHODS = ["CASH", "BANK", "CHEQUE", "CARD", "POS", "MPESA_STK", "MPESA_C2B", "MPESA_TILL", "BANK_TRANSFER"];
const REFUND_METHODS = ["CASH", "BANK", "MPESA_B2C"];

export class TopUpDto {
  @ApiProperty({ type: String })
  @Matches(DECIMAL_STRING_PATTERN)
  amount!: string;

  @ApiProperty({ enum: PAY_METHODS })
  @IsIn(PAY_METHODS)
  method!: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  receiptId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class SpendDto {
  @ApiProperty({ type: String })
  @Matches(DECIMAL_STRING_PATTERN)
  amount!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  servicePointId!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  items?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class TransferToFeesDto {
  @ApiProperty({ type: String })
  @Matches(DECIMAL_STRING_PATTERN)
  amount!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  invoiceId!: string;

  @ApiPropertyOptional({ format: "uuid", description: "Required once amount exceeds the transfer approval threshold" })
  @IsOptional()
  @IsUUID()
  approvalRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

/** Phase 6 Slice 12 (Part A) — `POST /wallets/:id/sweep-to-invoices` request body. */
export class SweepToInvoicesDto {
  @ApiProperty({
    type: [String],
    description: "Caller-ordered (typically oldest-due-first) invoice ids to sweep the wallet's available balance into, in the given order",
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("all", { each: true })
  invoiceIds!: string[];

  @ApiPropertyOptional({
    format: "uuid",
    description: "A WALLET_TRANSFER appr_instance id already in APPROVED status — required only once the AGGREGATE swept total exceeds the transfer approval threshold",
  })
  @IsOptional()
  @IsUUID()
  approvalRef?: string;
}

export class SweepToInvoicesAllocationResponseDto {
  @ApiProperty({ format: "uuid" })
  invoiceId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;
}

export class SweepToInvoicesShortfallResponseDto {
  @ApiProperty({ format: "uuid" })
  invoiceId!: string;

  @ApiProperty({ type: String, description: "Decimal string — the invoice's own balance still outstanding after this sweep" })
  remainingBalance!: string;
}

export class SweepToInvoicesResponseDto {
  @ApiProperty({ type: String, description: "Decimal string — zero when nothing was available to sweep" })
  totalSwept!: string;

  @ApiProperty({ type: [SweepToInvoicesAllocationResponseDto] })
  allocations!: SweepToInvoicesAllocationResponseDto[];

  @ApiProperty({ format: "uuid", nullable: true, description: "Null when totalSwept is zero — no receipt was created" })
  receiptId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true, description: "Null when totalSwept is zero — no wall_transaction was created" })
  transactionId!: string | null;

  @ApiProperty({ type: [SweepToInvoicesShortfallResponseDto] })
  shortfall!: SweepToInvoicesShortfallResponseDto[];
}

export class TransferToWalletDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  toWalletId!: string;

  @ApiProperty({ type: String })
  @Matches(DECIMAL_STRING_PATTERN)
  amount!: string;

  @ApiPropertyOptional({ format: "uuid", description: "Required once amount exceeds the transfer approval threshold" })
  @IsOptional()
  @IsUUID()
  approvalRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class RefundPayoutTargetDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  guardianId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountRef?: string;
}

export class RefundWalletDto {
  @ApiProperty({ type: String })
  @Matches(DECIMAL_STRING_PATTERN)
  amount!: string;

  @ApiProperty({ enum: REFUND_METHODS })
  @IsIn(REFUND_METHODS)
  payoutMethod!: string;

  @ApiProperty({ type: RefundPayoutTargetDto })
  @ValidateNested()
  @Type(() => RefundPayoutTargetDto)
  payoutTarget!: RefundPayoutTargetDto;

  @ApiProperty({ format: "uuid", description: "A WALLET_REFUND appr_instance id already in APPROVED status" })
  @IsUUID()
  approvalRef!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class AdjustWalletDto {
  @ApiProperty({ type: String })
  @Matches(DECIMAL_STRING_PATTERN)
  amount!: string;

  @ApiProperty({ enum: ["D", "C"] })
  @IsIn(["D", "C"])
  direction!: string;

  @ApiProperty()
  @IsString()
  reasonCode!: string;

  @ApiProperty({ format: "uuid", description: "A WALLET_ADJUSTMENT appr_instance id already in APPROVED status" })
  @IsUUID()
  approvalRef!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class CloseWalletRefundDto {
  @ApiProperty({ enum: REFUND_METHODS })
  @IsIn(REFUND_METHODS)
  payoutMethod!: string;

  @ApiProperty({ type: RefundPayoutTargetDto })
  @ValidateNested()
  @Type(() => RefundPayoutTargetDto)
  payoutTarget!: RefundPayoutTargetDto;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  approvalRef!: string;
}

export class CloseWalletDto {
  @ApiProperty({ enum: ["REFUND", "TRANSFER_TO_SIBLING", "APPLY_TO_FEES"] })
  @IsIn(["REFUND", "TRANSFER_TO_SIBLING", "APPLY_TO_FEES"])
  disposition!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ type: CloseWalletRefundDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CloseWalletRefundDto)
  refund?: CloseWalletRefundDto;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  transferToSiblingWalletId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  applyToFeesInvoiceId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  approvalRef?: string;
}

export class WalletApprovalRequestResponseDto {
  @ApiProperty({ format: "uuid" })
  instanceId!: string;

  @ApiProperty({ enum: ["PENDING", "APPROVED", "REJECTED", "RETURNED", "CANCELLED"] })
  status!: string;
}

export class WalletTransactionResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  walletId!: string;

  @ApiProperty({ enum: WALL_TRANSACTION_TYPES })
  type!: string;

  @ApiProperty({ type: String })
  amount!: string;

  @ApiProperty({ enum: ["D", "C"] })
  direction!: string;

  @ApiProperty({ type: String })
  balanceAfter!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  servicePointId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  counterpartyWalletId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  receiptId!: string | null;

  @ApiProperty({ format: "uuid" })
  journalId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ nullable: true })
  reasonCode!: string | null;

  @ApiProperty()
  at!: Date;
}

export class TransferToWalletResponseDto {
  @ApiProperty({ type: WalletTransactionResponseDto })
  outTransaction!: WalletTransactionResponseDto;

  @ApiProperty({ type: WalletTransactionResponseDto })
  inTransaction!: WalletTransactionResponseDto;
}
