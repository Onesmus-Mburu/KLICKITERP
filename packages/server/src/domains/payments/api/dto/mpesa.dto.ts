import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { PAY_MPESA_TRANSACTION_KINDS, PAY_MPESA_TRANSACTION_STATES } from "../../domain/pay-mpesa-transaction.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class InitiateStkDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  studentId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amountKes!: string;

  @ApiProperty({ description: "MSISDN in 2547XXXXXXXX format" })
  @IsString()
  @MaxLength(15)
  msisdn!: string;

  @ApiProperty({ description: "Typically the student's admission number" })
  @IsString()
  @MaxLength(30)
  accountRef!: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      "Phase 6 Slice 9 (Part A) — Collect Fees' directed multi-invoice scoping. When present and non-empty, the eventual STK callback's " +
      "captured receipt is scoped to ONLY these open invoices (same convention as CaptureReceiptDto.invoiceIds, Slice 8 Part 3). Omitted " +
      "or empty means unscoped — the confirmed payment auto-FIFOs across every open invoice, exactly as before this field existed.",
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  invoiceIds?: string[];
}

export class InitiateB2cDto {
  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amountKes!: string;

  @ApiProperty({ description: "MSISDN in 2547XXXXXXXX format" })
  @IsString()
  @MaxLength(15)
  msisdn!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  remarks!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  originatingReason?: string;
}

export class MpesaTransactionResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: PAY_MPESA_TRANSACTION_KINDS })
  kind!: string;

  @ApiProperty()
  shortcode!: string;

  @ApiProperty()
  msisdnMasked!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ nullable: true })
  mpesaRef!: string | null;

  @ApiProperty({ nullable: true })
  checkoutRequestId!: string | null;

  @ApiProperty({ nullable: true })
  conversationId!: string | null;

  @ApiProperty({ enum: PAY_MPESA_TRANSACTION_STATES })
  state!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  matchedReceiptId!: string | null;
}
