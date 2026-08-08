import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, Matches, MinLength, ValidateNested } from "class-validator";
import { PROC_SUPPLIER_INVOICE_STATUSES } from "../../domain/proc-supplier-invoice.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CaptureSupplierInvoiceLineDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  poLineId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  qty!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  unitPrice!: string;
}

export class CaptureSupplierInvoiceDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  supplierId!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "Omit for a non-PO (services/ad-hoc) invoice — see SupplierInvoicesService's doc comment for what that means for matching/posting" })
  @IsOptional()
  @IsUUID()
  poId?: string;

  @ApiProperty({ maxLength: 60 })
  @IsString()
  supplierRef!: string;

  @ApiProperty()
  @IsDateString()
  invoiceDate!: string;

  @ApiProperty()
  @IsDateString()
  dueDate!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  total!: string;

  @ApiPropertyOptional({ type: [CaptureSupplierInvoiceLineDto], description: "Data-entry integrity check only — not persisted (no proc_supplier_invoice_line table exists); see SupplierInvoicesService.capture()'s doc comment" })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CaptureSupplierInvoiceLineDto)
  lines?: CaptureSupplierInvoiceLineDto[];
}

export class ResolveMatchExceptionDto {
  @ApiProperty({ enum: ["ACCEPT_VARIANCE", "REJECT"] })
  @IsIn(["ACCEPT_VARIANCE", "REJECT"])
  resolution!: "ACCEPT_VARIANCE" | "REJECT";

  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  note!: string;
}

export class SupplierInvoiceResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty()
  supplierRef!: string;

  @ApiProperty({ format: "uuid" })
  supplierId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  poId!: string | null;

  @ApiProperty()
  invoiceDate!: string;

  @ApiProperty()
  dueDate!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  total!: string;

  @ApiProperty({ enum: PROC_SUPPLIER_INVOICE_STATUSES })
  status!: string;

  @ApiProperty({ type: "object", additionalProperties: true, nullable: true, description: "FR-PROC-007.1 3-way-match result — side-by-side PO/GRN comparison" })
  matchVariance!: Record<string, unknown> | null;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;

  @ApiProperty({ type: String, description: "Decimal string" })
  paidAmount!: string;
}
