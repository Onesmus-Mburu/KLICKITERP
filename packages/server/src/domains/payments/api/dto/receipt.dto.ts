import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { PAY_RECEIPT_SPLIT_METHODS, PayReceiptSplitMethod } from "../../domain/pay-receipt-split.entity";
import { ReceiptReversalReasonCode } from "../../application/receipts.service";
import { DECIMAL_PATTERN } from "./decimal.util";

const REVERSAL_REASON_CODES: readonly ReceiptReversalReasonCode[] = ["ERROR", "BOUNCE", "DUPLICATE", "FRAUD"];

export class CaptureReceiptChequeDetailsDto {
  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  bankName!: string;

  @ApiProperty({ maxLength: 30 })
  @IsString()
  @MaxLength(30)
  chequeNo!: string;

  @ApiProperty({ description: "ISO date (YYYY-MM-DD)" })
  @IsISO8601({ strict: true })
  chequeDate!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  drawer!: string;
}

export class CaptureReceiptSplitDto {
  @ApiProperty({ enum: PAY_RECEIPT_SPLIT_METHODS })
  @IsEnum(PAY_RECEIPT_SPLIT_METHODS)
  method!: PayReceiptSplitMethod;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;

  @ApiPropertyOptional({ format: "uuid", description: "BANK/BANK_TRANSFER only — forward reference to bank_account (Module 16, not built yet)" })
  @IsOptional()
  @IsString()
  bankAccountId?: string;

  @ApiPropertyOptional({ maxLength: 60, description: "BANK/BANK_TRANSFER deposit-slip ref, or CARD/POS terminal ref" })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  externalRef?: string;

  @ApiPropertyOptional({ type: CaptureReceiptChequeDetailsDto, description: "Required when method='CHEQUE'" })
  @IsOptional()
  @ValidateNested()
  @Type(() => CaptureReceiptChequeDetailsDto)
  chequeDetails?: CaptureReceiptChequeDetailsDto;

  @ApiPropertyOptional({ format: "uuid", description: "MPESA_* pass-through, supplied by MpesaService's own callback handlers" })
  @IsOptional()
  @IsString()
  mpesaTransactionId?: string;
}

export class CaptureReceiptDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  studentId!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  payerName!: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  payerPhone?: string;

  @ApiProperty({ description: "ISO date (YYYY-MM-DD)" })
  @IsISO8601({ strict: true })
  receiptDate!: string;

  @ApiProperty({ type: String, description: "Decimal string — splits must sum to exactly this (BR-PAY-01)" })
  @Matches(DECIMAL_PATTERN)
  total!: string;

  @ApiProperty({ type: [CaptureReceiptSplitDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CaptureReceiptSplitDto)
  splits!: CaptureReceiptSplitDto[];

  @ApiPropertyOptional({ format: "uuid", description: "Required when any split is CASH (BR-PAY-04)" })
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  idempotencyKey?: string;

  @ApiPropertyOptional({
    type: [String],
    format: "uuid",
    description:
      "Phase 6 Slice 8 (Part 3) — 'Collect Fees' directed multi-invoice collection. When present and non-empty, restricts BR-PAY-02/03's FIFO-by-due-date allocation to ONLY these open invoices (a subset the cashier explicitly checked) instead of every one of the student's open invoices. Omitted (the default), behavior is unchanged — the unscoped FIFO rule applies across all open invoices, exactly as before this field existed.",
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  invoiceIds?: string[];
}

export class ReverseReceiptDto {
  @ApiProperty({ enum: REVERSAL_REASON_CODES })
  @IsEnum(REVERSAL_REASON_CODES)
  reasonCode!: ReceiptReversalReasonCode;

  @ApiProperty({ format: "uuid", description: "A PAYMENT_REVERSALS appr_instance id already in APPROVED status (see POST .../reverse/request)" })
  @IsUUID()
  approvalRef!: string;
}

export class ReceiptSplitResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  receiptId!: string;

  @ApiProperty({ enum: PAY_RECEIPT_SPLIT_METHODS })
  method!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  bankAccountId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  chequeId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  mpesaTransactionId!: string | null;

  @ApiProperty({ nullable: true })
  externalRef!: string | null;
}

export class ReceiptAllocationResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  receiptId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  invoiceId!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  installmentId!: string | null;

  @ApiProperty()
  toPrepayment!: boolean;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  /**
   * Phase 6 Slice 8 (Part 4) — the real invoice number (e.g. `BIL-000047`)
   * for rows with a non-null `invoiceId`, resolved by
   * `ReceiptsController.findOne()` via `BillInvoiceRepository.findByIdOrFail()`
   * (a receipt has at most a handful of allocations, so this small N-lookup
   * is fine — same precedent `domains/reporting`'s aging report already
   * uses). Always `null` for a `toPrepayment:true` row, which has no
   * `invoiceId` to resolve.
   */
  // `type: String` explicit (not just `nullable: true`) — a `string | null`
  // union return type can't be reflected by Nest/Swagger on its own; without
  // this, the generated OpenAPI schema loses its `type` entirely, which
  // `openapi-typescript` then renders as an ambiguous placeholder instead of
  // `string | null` (the exact pre-existing gap `lib/api-error.ts`'s own doc
  // comment documents for several Students-domain DTOs — avoided here
  // outright rather than reproduced in new code).
  @ApiProperty({ type: String, nullable: true })
  invoiceNumber!: string | null;
}

export class ReceiptResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty()
  payerName!: string;

  @ApiProperty({ nullable: true })
  payerPhone!: string | null;

  @ApiProperty()
  receiptDate!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  total!: string;

  @ApiProperty({ enum: ["POSTED", "REVERSED"] })
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  reversalOfId!: string | null;

  @ApiProperty({ nullable: true })
  reversalReason!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ format: "uuid" })
  cashierId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  sessionId!: string | null;

  @ApiProperty({
    format: "uuid",
    nullable: true,
    description:
      "Null for a WALLET-funded receipt (Phase 6 Slice 12 Part A) — the real GL effect already posted via the wallet's own journal; this receipt is an audit-trail record, not a second posting. A CREDIT_BALANCE-funded receipt (Part D), by contrast, carries a REAL non-null journalId — applyStudentCreditToInvoices() posts a genuinely new P-10 journal of its own.",
  })
  journalId!: string | null;

  @ApiProperty({ nullable: true })
  idempotencyKey!: string | null;

  @ApiProperty({ type: String, description: "Decimal string" })
  balanceAfter!: string;

  @ApiProperty()
  reprintCount!: number;
}

export class ReceiptDetailResponseDto extends ReceiptResponseDto {
  @ApiProperty({ type: [ReceiptSplitResponseDto] })
  splits!: ReceiptSplitResponseDto[];

  @ApiProperty({ type: [ReceiptAllocationResponseDto] })
  allocations!: ReceiptAllocationResponseDto[];

  /**
   * Phase 6 Slice 16 (Part 1) — the opaque `docv_record.token`
   * `ReceiptsService.captureReceipt()` mints for every real receipt
   * (`platform/document-verification`), resolved here via
   * `DocumentVerificationService.findByDocument('PAYMENT_RECEIPT', id)`.
   * `null` only for a receipt that predates this feature (minted before
   * migration `0237` ran) — every receipt captured from here on always has
   * one. Never populated for a wallet/credit-balance-funded receipt or a
   * reversal's contra receipt (`captureReceipt()` is the only minting call
   * site) — `null` for those too, correctly.
   */
  @ApiProperty({ nullable: true, type: String })
  verificationToken!: string | null;
}

/**
 * Phase 6 Slice 8 (Part 4) — the global (unscoped) Receipts list row shape:
 * every `ReceiptResponseDto` field, plus the joined student/cashier display
 * names (only meaningful in this cross-student context — the existing
 * `studentId`/`sessionId`-scoped `list()` branches keep returning a bare
 * `ReceiptResponseDto[]`, unchanged). Mirrors `PendingUpcomingInvoiceResponseDto`'s
 * own "row fields + a couple of joined display names, empty-string fallback
 * if the join somehow comes back empty" shape.
 */
export class ReceiptListItemResponseDto extends ReceiptResponseDto {
  @ApiProperty()
  studentName!: string;

  @ApiProperty()
  cashierName!: string;
}

/** `{items,total}` pagination envelope — same shape `PendingUpcomingInvoiceListResponseDto`/`ListStudentsResponseDto` already establish. */
export class ReceiptListResponseDto {
  @ApiProperty({ type: [ReceiptListItemResponseDto] })
  items!: ReceiptListItemResponseDto[];

  @ApiProperty()
  total!: number;
}

export class ReversalApprovalResponseDto {
  @ApiProperty({ format: "uuid", description: "appr_instance id — pass back as approvalRef to POST .../reverse once APPROVED" })
  instanceId!: string;

  @ApiProperty({ enum: ["PENDING", "APPROVED", "REJECTED", "RETURNED", "CANCELLED"] })
  status!: string;
}

/** Phase 6 Slice 12 (Part D) — `POST /payments/receipts/apply-student-credit` request body. */
export class ApplyStudentCreditDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  studentId!: string;

  @ApiProperty({
    type: [String],
    description: "Caller-ordered (typically oldest-due-first) invoice ids to apply the student's Credit Balance into, in the given order",
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("all", { each: true })
  invoiceIds!: string[];
}

export class ApplyStudentCreditAllocationResponseDto {
  @ApiProperty({ format: "uuid" })
  invoiceId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;
}

export class ApplyStudentCreditShortfallResponseDto {
  @ApiProperty({ format: "uuid" })
  invoiceId!: string;

  @ApiProperty({ type: String, description: "Decimal string — the invoice's own balance still outstanding after this application" })
  remainingBalance!: string;
}

export class ApplyStudentCreditResponseDto {
  @ApiProperty({ type: String, description: "Decimal string — zero when the student had no credit balance to apply" })
  totalApplied!: string;

  @ApiProperty({ type: [ApplyStudentCreditAllocationResponseDto] })
  allocations!: ApplyStudentCreditAllocationResponseDto[];

  @ApiProperty({ format: "uuid", nullable: true, description: "Null when totalApplied is zero — no receipt/journal was posted" })
  receiptId!: string | null;

  @ApiProperty({ type: [ApplyStudentCreditShortfallResponseDto] })
  shortfall!: ApplyStudentCreditShortfallResponseDto[];
}
