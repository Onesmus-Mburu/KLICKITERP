import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUUID, Matches } from "class-validator";
import { BILL_REFUND_METHODS, BillRefundMethod } from "../../domain/bill-refund-voucher.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateRefundVoucherDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  studentId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;

  @ApiProperty({ enum: BILL_REFUND_METHODS })
  @IsIn(BILL_REFUND_METHODS)
  method!: BillRefundMethod;

  @ApiProperty({ type: "object", additionalProperties: true, description: "Payee details (name/account/phone, method-dependent)" })
  @IsObject()
  payee!: Record<string, unknown>;
}

export class DecideRefundVoucherDto {
  @ApiProperty()
  @IsBoolean()
  approved!: boolean;
}

export class MarkRefundVoucherPaidDto {
  @ApiPropertyOptional({ nullable: true, description: "Interim placeholder — see RefundVouchersService's doc comment" })
  @IsOptional()
  @IsString()
  b2cTransactionId?: string;
}

export class RefundVoucherResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ enum: BILL_REFUND_METHODS })
  method!: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  payee!: Record<string, unknown>;

  @ApiProperty()
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;

  @ApiProperty({ nullable: true })
  b2cTransactionId!: string | null;
}
