import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMinSize, IsArray, IsUUID } from "class-validator";

export class BulkGenerateAdhocInvoicesDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  termId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  classId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  feeCategoryIds!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  studentIds!: string[];
}

export class BulkAdhocInvoiceSuccessDto {
  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ type: [String] })
  invoiceIds!: string[];

  /**
   * Phase 6 Slice 12 (Part C) — set (and non-empty) only on a PARTIAL
   * duplicate-billing skip: some, but not all, of the categories selected for
   * this student were already really billed this term, so this student was
   * still invoiced for the rest, but the accountant needs to see which
   * category ids were left out. Omitted when every selected category was
   * billable.
   */
  @ApiPropertyOptional({ type: [String] })
  alreadyBilledCategoryIds?: string[];
}

export class BulkAdhocInvoiceFailureDto {
  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty()
  error!: string;
}

/**
 * Phase 6 Slice 12 (Part C) — a FULL duplicate-billing skip: EVERY category
 * selected for this student was already really billed this term, so nothing
 * was generated for them at all. Distinct from `BulkAdhocInvoiceFailureDto` —
 * this is not an error, it's a signal for the accountant to uncheck this
 * student and retry with the rest of the batch.
 */
export class BulkAdhocInvoiceSkipDto {
  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ type: [String] })
  alreadyBilledCategoryIds!: string[];
}

export class BulkGenerateAdhocInvoicesResultDto {
  @ApiProperty({ type: [BulkAdhocInvoiceSuccessDto] })
  succeeded!: BulkAdhocInvoiceSuccessDto[];

  @ApiProperty({ type: [BulkAdhocInvoiceFailureDto] })
  failed!: BulkAdhocInvoiceFailureDto[];

  @ApiProperty({ type: [BulkAdhocInvoiceSkipDto] })
  skipped!: BulkAdhocInvoiceSkipDto[];
}
