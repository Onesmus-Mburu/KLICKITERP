import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID, Matches } from "class-validator";
import { EXP_PETTY_CASH_VOUCHER_STATUSES } from "../../domain/exp-petty-cash-voucher.entity";
import { EXP_REPLENISHMENT_STATUSES } from "../../domain/exp-replenishment.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateFloatDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  custodianUserId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  ceiling!: string;
}

export class UpdateFloatCeilingDto {
  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  ceiling!: string;
}

export class FloatResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  custodianUserId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  ceiling!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  balance!: string;
}

export class SpendDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  receiptFileId?: string;
}

export class PettyCashVoucherResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ format: "uuid" })
  floatId!: string;

  @ApiProperty({ format: "uuid" })
  categoryId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  receiptFileId!: string | null;

  @ApiProperty({ enum: EXP_PETTY_CASH_VOUCHER_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;
}

export class ReplenishmentResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  floatId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ type: [String], format: "uuid" })
  voucherIds!: string[];

  @ApiProperty({ enum: EXP_REPLENISHMENT_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;
}
