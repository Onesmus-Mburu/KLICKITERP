import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsIn, IsOptional, IsUUID, Matches } from "class-validator";
import { BILL_FEE_STRUCTURE_BOARDING_KINDS, BillFeeStructureBoarding } from "../../domain/bill-fee-structure.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

/** Phase 6 Slice 3b: `termId` dropped — a fee structure now spans a whole academic year, see `BillFeeStructureEntity`'s doc comment. */
export class CreateFeeStructureDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  academicYearId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  classId!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  streamId?: string;

  @ApiPropertyOptional({ enum: BILL_FEE_STRUCTURE_BOARDING_KINDS, nullable: true })
  @IsOptional()
  @IsIn(BILL_FEE_STRUCTURE_BOARDING_KINDS)
  boarding?: BillFeeStructureBoarding;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  feeGroupId?: string;
}

/** Phase 6 Slice 3b: `termId`/`dueDate` added — each line now carries its own term and due date. */
export class CreateFeeStructureLineDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  feeCategoryId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  termId!: string;

  @ApiProperty({ type: String, format: "date", description: "ISO date string (YYYY-MM-DD)" })
  @IsDateString()
  dueDate!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;
}

/** Phase 6 Slice 3b: widened alongside `CreateFeeStructureLineDto` — `termId`/`dueDate` gain edit-in-place support, not just `amount`. */
export class UpdateFeeStructureLineDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  termId!: string;

  @ApiProperty({ type: String, format: "date", description: "ISO date string (YYYY-MM-DD)" })
  @IsDateString()
  dueDate!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;
}

/** Phase 6 Slice 3b: `termId` dropped — see `CreateFeeStructureDto`. */
export class FeeStructureResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  academicYearId!: string;

  @ApiProperty({ format: "uuid" })
  classId!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  streamId!: string | null;

  @ApiProperty({ nullable: true })
  boarding!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  feeGroupId!: string | null;

  @ApiProperty()
  version!: number;

  @ApiProperty()
  status!: string;

  @ApiProperty({ nullable: true })
  publishedAt!: Date | null;

  /**
   * Phase 6 Slice 16 (Part 1) — the opaque `docv_record.token`
   * `FeeStructuresService.publish()` mints for the structure
   * (`platform/document-verification`), resolved by `FeeStructuresController`
   * only on its `GET :id` "get by id" path via
   * `DocumentVerificationService.findByDocument('FEE_STRUCTURE', id)` — left
   * `null` on `create()`/`list()`/`addLine()`/`publish()`'s own responses
   * (no per-row lookup there, avoiding an N+1). Always `null` for a `DRAFT`
   * structure (never published) or a row that predates this feature.
   */
  @ApiProperty({ nullable: true, type: String })
  verificationToken!: string | null;
}

/** Phase 6 Slice 3b: `termId`/`dueDate` added — see `CreateFeeStructureLineDto`. */
export class FeeStructureLineResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  feeStructureId!: string;

  @ApiProperty({ format: "uuid" })
  feeCategoryId!: string;

  @ApiProperty({ format: "uuid" })
  termId!: string;

  @ApiProperty({ type: String, format: "date" })
  dueDate!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty()
  isOptional!: boolean;
}

/** Phase 6 Slice 8 — chip-picker catalog row for the bulk "Generate Invoice" screen, see `FeeStructuresService.listCategoriesForScope()`'s doc comment. */
export class FeeCategoryForScopeResponseDto {
  @ApiProperty({ format: "uuid" })
  feeCategoryId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, description: "Decimal string — one representative structure-line amount for this category within the scope (display context only, not a canonical/aggregate price)" })
  exampleAmount!: string;
}
