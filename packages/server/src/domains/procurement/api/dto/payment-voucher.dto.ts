import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsUUID, Matches, ValidateNested } from "class-validator";
import { PROC_PAYMENT_VOUCHER_METHODS, PROC_PAYMENT_VOUCHER_STATUSES } from "../../domain/proc-payment-voucher.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreatePaymentVoucherAllocationDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  supplierInvoiceId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;
}

export class CreatePaymentVoucherDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  supplierId!: string;

  @ApiProperty({ enum: PROC_PAYMENT_VOUCHER_METHODS })
  @IsIn(PROC_PAYMENT_VOUCHER_METHODS)
  method!: "BANK" | "CHEQUE" | "MPESA" | "CASH";

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "Forward reference to bank_account (Module 16/Banking, not built yet)" })
  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "Forward reference to bank_cheque_leaf (Module 16/Banking, not built yet)" })
  @IsOptional()
  @IsUUID()
  chequeLeafId?: string;

  @ApiProperty({ type: [CreatePaymentVoucherAllocationDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreatePaymentVoucherAllocationDto)
  allocations!: CreatePaymentVoucherAllocationDto[];
}

export class PaymentVoucherResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ format: "uuid" })
  supplierId!: string;

  @ApiProperty({ enum: PROC_PAYMENT_VOUCHER_METHODS })
  method!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  bankAccountId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  chequeLeafId!: string | null;

  @ApiProperty({ type: String, description: "Decimal string" })
  total!: string;

  @ApiProperty({ enum: PROC_PAYMENT_VOUCHER_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;

  @ApiProperty()
  remittanceSent!: boolean;
}

export class PaymentVoucherAllocationResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  voucherId!: string;

  @ApiProperty({ format: "uuid" })
  supplierInvoiceId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;
}
