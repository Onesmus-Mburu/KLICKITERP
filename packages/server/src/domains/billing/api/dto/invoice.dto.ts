import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { BILL_INVOICE_SOURCES, BillInvoiceSource } from "../../domain/bill-invoice.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class GenerateInvoiceAdhocLineDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  feeCategoryId!: string;

  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MaxLength(160)
  description!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;
}

export class GenerateInvoiceDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  studentId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  termId!: string;

  @ApiProperty({ enum: BILL_INVOICE_SOURCES })
  @IsIn(BILL_INVOICE_SOURCES)
  source!: BillInvoiceSource;

  @ApiPropertyOptional({ type: [GenerateInvoiceAdhocLineDto] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => GenerateInvoiceAdhocLineDto)
  adhocLines?: GenerateInvoiceAdhocLineDto[];

  @ApiPropertyOptional({ type: String, format: "date" })
  @IsOptional()
  @IsISO8601({ strict: true })
  issueDate?: string;

  @ApiPropertyOptional({ type: String, format: "date" })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueDate?: string;
}

export class VoidInvoiceDto {
  @ApiProperty()
  @IsString()
  reason!: string;
}

export class InvoiceResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ format: "uuid" })
  termId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  feeStructureId!: string | null;

  @ApiProperty({ type: String, format: "date" })
  issueDate!: string;

  @ApiProperty({ type: String, format: "date" })
  dueDate!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  source!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  subtotal!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  concessionTotal!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  total!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  paidAmount!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  balance!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;
}

/**
 * Phase 6 Slice 8 (Part 2) — `InvoicesController.pending()`/`.upcoming()`'s
 * per-row shape: the invoice fields a cashier needs (id/number/dueDate/
 * total/balance/status) PLUS the joined student's `admissionNo`/`studentName`/
 * `classId` so the list screens don't need a second per-row lookup. Deliberately
 * NOT the full `InvoiceResponseDto` — this is a narrower, list-specific view.
 */
export class PendingUpcomingInvoiceResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ type: String, format: "date" })
  dueDate!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  total!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  balance!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty()
  admissionNo!: string;

  @ApiProperty()
  studentName!: string;

  @ApiProperty({ format: "uuid" })
  classId!: string;
}

/** `{items, total}` pagination envelope — same flat shape `ListStudentsResponseDto` already established, no `meta` wrapper. */
export class PendingUpcomingInvoiceListResponseDto {
  @ApiProperty({ type: [PendingUpcomingInvoiceResponseDto] })
  items!: PendingUpcomingInvoiceResponseDto[];

  @ApiProperty({ description: "Total row count matching the applied filters, ignoring page/pageSize" })
  total!: number;
}

export class InvoiceLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  invoiceId!: string;

  @ApiProperty()
  lineNo!: number;

  @ApiProperty({ format: "uuid" })
  feeCategoryId!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  concessionAmount!: string;
}
